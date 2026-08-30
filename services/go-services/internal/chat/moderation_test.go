package chat

import (
	"strings"
	"testing"
)

func TestScanMessageText_CleanMessagePasses(t *testing.T) {
	r := ScanMessageText("Hi, is this still available? What's the condition?")
	if !r.Clean || r.Action != "allow" {
		t.Fatalf("expected clean/allow, got clean=%v action=%s", r.Clean, r.Action)
	}
}

func TestScanMessageText_PhoneNumberBlocks(t *testing.T) {
	r := ScanMessageText("call me on 0788123456 to discuss")
	if r.Action != "block" {
		t.Fatalf("expected block for phone number, got %s", r.Action)
	}
	if r.MaskedText == "call me on 0788123456 to discuss" {
		t.Fatal("expected phone number to be masked")
	}
}

func TestScanMessageText_EmailBlocks(t *testing.T) {
	r := ScanMessageText("email me at someone@example.com please")
	if r.Action != "block" {
		t.Fatalf("expected block for email, got %s", r.Action)
	}
}

func TestScanMessageText_ExternalLinkBlocks(t *testing.T) {
	r := ScanMessageText("check this out https://example.com/deal")
	if r.Action != "block" {
		t.Fatalf("expected block for external link, got %s", r.Action)
	}
}

func TestScanMessageText_SocialMentionMasksOnly(t *testing.T) {
	r := ScanMessageText("just message me on whatsapp")
	if r.Action != "mask" {
		t.Fatalf("expected mask for a lone social mention, got %s", r.Action)
	}
}

func TestScanMessageText_PaymentDiversionBlocks(t *testing.T) {
	r := ScanMessageText("please send money to my mpesa instead")
	if r.Action != "block" {
		t.Fatalf("expected block for payment diversion, got %s", r.Action)
	}
}

func TestScanMessageText_LeavePlatformBlocks(t *testing.T) {
	r := ScanMessageText("let's chat outside the app from now on")
	if r.Action != "block" {
		t.Fatalf("expected block for leave-platform request, got %s", r.Action)
	}
}

func TestScanMessageText_MeetingRequestMasksOnly(t *testing.T) {
	r := ScanMessageText("can we meet up tomorrow")
	if r.Action != "mask" {
		t.Fatalf("expected mask for a meeting request, got %s", r.Action)
	}
}

func TestScanMessageText_SpelledOutDigitsCaught(t *testing.T) {
	r := ScanMessageText("my number is zero seven eight eight one two three")
	if r.Clean {
		t.Fatal("expected spelled-out digit run to be flagged")
	}
}

func TestScanMessageText_BareDigitRunWithoutSeparatorsCaught(t *testing.T) {
	r := ScanMessageText("0788123456")
	if r.Action != "block" {
		t.Fatalf("expected a bare 10-digit run to be flagged as a phone number, got %s", r.Action)
	}
}

func TestScanMessageText_DiscordTagRequiresAdjacentHandle(t *testing.T) {
	// Regression guard for the false-positive the JS comment calls out:
	// "order #1234" should NOT be flagged as a Discord tag.
	r := ScanMessageText("following up on order #1234")
	for _, v := range r.Violations {
		if v.Type == "social_discord" {
			t.Fatal("bare '#1234' should not be flagged as a Discord tag")
		}
	}
}

func TestScanMessageText_RealDiscordTagIsCaught(t *testing.T) {
	r := ScanMessageText("add me on discord: coolguy123#4521")
	found := false
	for _, v := range r.Violations {
		if v.Type == "social_discord" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a real discord#1234 tag to be flagged")
	}
}

func TestIsExemptSender(t *testing.T) {
	if IsExemptSender(AuthedUser{IsAdmin: false}) {
		t.Fatal("non-admin should not be exempt")
	}
	if !IsExemptSender(AuthedUser{IsAdmin: true}) {
		t.Fatal("admin should be exempt")
	}
}

func TestBuildReminderMessage_PaymentCategoryTakesPriority(t *testing.T) {
	r := ScanResult{Violations: []Violation{
		{Category: "off_platform_payment"},
		{Category: "contact_info"},
	}}
	msg := BuildReminderMessage(r)
	if !strings.Contains(msg, "payments must stay inside Jedida") {
		t.Fatalf("expected payment-specific reminder, got: %s", msg)
	}
}
