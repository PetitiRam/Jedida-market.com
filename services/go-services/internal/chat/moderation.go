// Package chat's moderation.go ports
// backend/src/chat/contactModerationEngine.js's scanMessageText,
// isExemptSender, and buildReminderMessage as closely as Go regex syntax
// allows. Kept in its own file, pure and DB-free, so it's testable without
// a database — recording the result (chat_moderation_events, risk score,
// security log, admin alert) is repository.go's job, mirroring
// recordModerationEvent in the original.
package chat

import (
	"regexp"
	"strings"
)

var (
	phoneRE    = regexp.MustCompile(`(?:\+?\d[\d\s\-().]{6,}\d)`)
	digitRunRE = regexp.MustCompile(`\d[\d\s\-.]{6,}\d`)
	emailRE    = regexp.MustCompile(`(?i)[a-zA-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-zA-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[a-zA-Z]{2,}`)
	externalRE = regexp.MustCompile(`(?i)(https?://|www\.)\S+`)
	meetingRE  = regexp.MustCompile(`(?i)\b(meet\s+me|meet\s+up|in\s+person|come\s+to\s+my\s+(house|home|shop|office)|let'?s\s+meet\s+outside|meet\s+outside\s+the\s+app|cash\s+on\s+delivery\s+in\s+person)\b`)
	paymentRE  = regexp.MustCompile(`(?i)\b(pay\s+me\s+directly|send\s+(money|cash)\s+(to|via)\s+(my\s+)?(mpesa|momo|mobile\s?money|bank|paypal|zelle|cashapp|venmo)|western\s+union|moneygram|off[\s-]?platform\s+payment|pay\s+outside\s+(the\s+)?(app|platform|jedida))\b`)
	leaveRE    = regexp.MustCompile(`(?i)\b(talk\s+(to\s+me\s+)?(elsewhere|somewhere\s+else)|chat\s+(with\s+me\s+)?(elsewhere|outside\s+(jedida|the\s+app|this\s+app|the\s+platform))|leave\s+(jedida|this\s+app|the\s+app|the\s+platform)|get\s+off\s+(jedida|this\s+app|the\s+platform)|continue\s+(this\s+)?(chat|conversation)\s+outside|move\s+(this\s+)?(chat|conversation)\s+(off|outside)|contact\s+me\s+(outside|off)\s+(jedida|the\s+app|this\s+app|the\s+platform)|reach\s+me\s+(directly|outside\s+jedida))\b`)
)

type socialPattern struct {
	name string
	re   *regexp.Regexp
}

var socialPatterns = []socialPattern{
	{"whatsapp", regexp.MustCompile(`(?i)\b(whats\s*app|wa\.me|w[\s.]?a[\s.]?)\b`)},
	{"telegram", regexp.MustCompile(`(?i)\b(telegram|t\.me|tg\s*[:@]\s*[a-z0-9_]{3,})\b`)},
	{"facebook", regexp.MustCompile(`(?i)\b(facebook|fb\.com|fb\.me)\b`)},
	{"instagram", regexp.MustCompile(`(?i)\b(instagram|insta\s?gram|ig\s*[:@])\b`)},
	{"tiktok", regexp.MustCompile(`(?i)\btik\s?tok\b`)},
	{"twitter_x", regexp.MustCompile(`(?i)\b(twitter|x\.com)\b`)},
	{"snapchat", regexp.MustCompile(`(?i)\bsnap\s?chat\b`)},
	{"discord", regexp.MustCompile(`(?i)\bdiscord\b|\b[a-z0-9_]{2,32}#\d{4}\b`)},
	{"wechat", regexp.MustCompile(`(?i)\bwe\s?chat\b`)},
	{"imo_viber_signal", regexp.MustCompile(`(?i)\b(imo|viber|signal app)\b`)},
}

var wordDigits = map[string]string{
	"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
	"five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9", "oh": "0",
}

var splitWordsRE = regexp.MustCompile(`[\s,\-]+`)
var nonDigitRE = regexp.MustCompile(`\D`)

func countSpelledDigits(text string) int {
	fields := splitWordsRE.Split(strings.ToLower(text), -1)
	run, maxRun := 0, 0
	for _, w := range fields {
		if _, ok := wordDigits[w]; ok {
			run++
			if run > maxRun {
				maxRun = run
			}
		} else {
			run = 0
		}
	}
	return maxRun
}

// Violation mirrors one entry of the JS engine's `violations` array.
type Violation struct {
	Type     string   `json:"type"`
	Category string   `json:"category"`
	Severity string   `json:"severity"` // "high" | "medium"
	Matches  []string `json:"matches"`
}

// ScanResult mirrors scanMessageText's return shape.
type ScanResult struct {
	Violations []Violation
	MaskedText string
	Action     string // "allow" | "mask" | "block"
	RiskDelta  int
	Clean      bool
}

func maskMatch(s string) string {
	n := len(s)
	if n > 12 {
		n = 12
	}
	return strings.Repeat("*", n)
}

// ScanMessageText is a line-for-line port of contactModerationEngine.js's
// scanMessageText. Same detection order, same masking behavior, same
// action thresholds (high severity anywhere -> block, medium-only -> mask,
// nothing -> allow), same risk delta formula.
func ScanMessageText(rawText string) ScanResult {
	text := rawText
	masked := text
	var violations []Violation

	maskAll := func(re *regexp.Regexp, category, vtype, severity string) {
		matches := re.FindAllString(text, -1)
		if len(matches) == 0 {
			return
		}
		capped := matches
		if len(capped) > 5 {
			capped = capped[:5]
		}
		violations = append(violations, Violation{Type: vtype, Category: category, Severity: severity, Matches: capped})
		masked = re.ReplaceAllStringFunc(masked, maskMatch)
	}

	maskAll(emailRE, "contact_info", "email", "high")
	maskAll(phoneRE, "contact_info", "phone_number", "high")
	maskAll(externalRE, "contact_info", "external_link", "high")

	for _, sp := range socialPatterns {
		maskAll(sp.re, "contact_info", "social_"+sp.name, "medium")
	}

	maskAll(meetingRE, "off_platform_meeting", "meeting_request", "medium")
	maskAll(paymentRE, "off_platform_payment", "payment_diversion", "high")
	maskAll(leaveRE, "leave_platform", "leave_platform_request", "high")

	if countSpelledDigits(text) >= 7 {
		violations = append(violations, Violation{Type: "spelled_out_number", Category: "contact_info", Severity: "medium"})
	}

	hasPhoneViolation := false
	for _, v := range violations {
		if v.Type == "phone_number" {
			hasPhoneViolation = true
			break
		}
	}
	for _, run := range digitRunRE.FindAllString(text, -1) {
		digitsOnly := nonDigitRE.ReplaceAllString(run, "")
		if len(digitsOnly) >= 7 && !hasPhoneViolation {
			violations = append(violations, Violation{Type: "phone_number", Category: "contact_info", Severity: "high", Matches: []string{run}})
			masked = strings.Replace(masked, run, maskMatch(run), 1)
			hasPhoneViolation = true
		}
	}

	highest := 0
	for _, v := range violations {
		score := 1
		switch v.Severity {
		case "high":
			score = 3
		case "medium":
			score = 2
		}
		if score > highest {
			highest = score
		}
	}
	action := "allow"
	if highest >= 3 {
		action = "block"
	} else if highest == 2 {
		action = "mask"
	}
	riskDelta := 0
	if len(violations) > 0 {
		riskDelta = 10 + len(violations)*5
		if riskDelta > 40 {
			riskDelta = 40
		}
	}

	return ScanResult{
		Violations: violations,
		MaskedText: masked,
		Action:     action,
		RiskDelta:  riskDelta,
		Clean:      len(violations) == 0,
	}
}

// IsExemptSender mirrors isExemptSender: admins may share contact/payment
// info freely.
func IsExemptSender(user AuthedUser) bool {
	return user.IsAdmin
}

const OrderProtectionReminder = "Keep all communication and payments inside Jedida for buyer protection."

// BuildReminderMessage mirrors buildReminderMessage's category-based copy
// exactly.
func BuildReminderMessage(result ScanResult) string {
	categories := map[string]bool{}
	for _, v := range result.Violations {
		categories[v.Category] = true
	}
	if categories["off_platform_payment"] {
		return "For your safety, payments must stay inside Jedida Marketplace — please use the order's official payment flow instead of sharing outside payment details. " + OrderProtectionReminder
	}
	if categories["leave_platform"] {
		return "For everyone's protection, this conversation needs to stay inside Jedida — Jedida chat, orders, and payments only work when everything happens on-platform. " + OrderProtectionReminder
	}
	if categories["off_platform_meeting"] {
		return "To keep both of you protected, please arrange delivery and meetups through Jedida Marketplace's order and delivery tools rather than off-platform."
	}
	return "For everyone's safety, personal contact details (phone numbers, emails, social/messaging handles, external links) can't be shared in chat. " + OrderProtectionReminder
}
