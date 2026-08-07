-- Phase 21: Legal Center — seeds all 50 Jedida Marketplace legal
-- documents into legal_documents as version 1 (is_current = TRUE).
-- Idempotent: skips a doc_type that already has a current version, so
-- re-running this migration never overwrites an admin-edited document.

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'terms_of_service', $legaldoc_terms_of_service$
# Terms of Service

*Jedida Marketplace Legal Center — Platform-Wide*
*Related documents: [Privacy Policy](/legal/privacy_policy), [Marketplace Rules](/legal/marketplace_rules), [Dispute Resolution Policy](/legal/dispute_resolution_policy).*

## 1. Purpose

These Terms of Service ("Terms") constitute a legally binding agreement between each User and the Company governing access to and use of the Platform, and set out the foundational rules from which every other Platform policy is derived.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

These Terms apply to every person and entity that accesses the Platform in any capacity, and govern:

1. account creation and eligibility
2. browsing and use of the Platform's services
3. the relationship between the Company, Buyers, Sellers, and Delivery Partners
4. the incorporation by reference of every other policy published in the Legal Center
5. modification, suspension, and termination of Platform access

## 4. User Rights

- Access the Platform's public features without charge, subject to these Terms
- Receive the services applicable to the User's registered role (Buyer, Seller, or Delivery Partner)
- Be informed of material changes to these Terms before they take effect
- Close an account at any time, subject to the resolution of open Orders, disputes, or outstanding balances
- Access all subordinate policies referenced in these Terms free of charge

## 5. User Responsibilities

- Provide accurate, current, and complete information at registration and keep it updated
- Maintain the confidentiality of account credentials and promptly report unauthorised access
- Comply with these Terms, all subordinate policies, and Applicable Law
- Use the Platform only for lawful purposes consistent with its intended function as a marketplace
- Be at least the age of majority in their jurisdiction, or hold verified parental or guardian consent where permitted

## 6. Marketplace Responsibilities

- Operate the Platform with reasonable skill and care and use commercially reasonable efforts to maintain its availability
- Publish and maintain the subordinate policies referenced in these Terms
- Provide mechanisms for dispute resolution, reporting, and appeals as described in this Legal Center
- Take reasonable steps to protect User data in accordance with the Privacy Policy and Data Protection Policy
- Notify Users of material changes to these Terms with reasonable advance notice

## 7. Platform Limitations

- The Platform is a technology intermediary; the Company is not a party to, and assumes no liability for, the underlying sale of goods or services between a Buyer and a Seller, except where the Escrow Policy or Buyer Protection provisions expressly apply
- The Company does not guarantee uninterrupted or error-free operation of the Platform
- The Company's aggregate liability to any User is limited as set out in Section 8 (Legal Obligations) and in the applicable transaction-specific policy
- The Platform is provided on an "as available" basis without warranties beyond those that cannot lawfully be excluded

## 8. Legal Obligations

The Company will comply with all Applicable Law governing electronic commerce, consumer protection, and data protection in the jurisdictions in which it operates, and will cooperate with lawful requests from competent authorities.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Suspension or termination of the User's account in accordance with the Account Suspension Policy and Account Termination Policy
- Removal of Content or listings that breach these Terms
- Withholding or reversal of funds implicated in a breach, subject to the Escrow Policy and Wallet Policy
- Referral to law enforcement or regulatory authorities where conduct may be unlawful

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_terms_of_service$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'terms_of_service');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'privacy_policy', $legaldoc_privacy_policy$
# Privacy Policy

*Jedida Marketplace Legal Center — Platform-Wide*
*Related documents: [Data Protection Policy](/legal/data_protection_policy), [Data Retention Policy](/legal/data_retention_policy), [Cookie Policy](/legal/cookie_policy), [Security Policy](/legal/security_policy).*

## 1. Purpose

This Privacy Policy explains what personal data the Platform collects, why it is collected, how it is used, and the choices and rights available to Users in relation to that data.

## 2. Definitions

**Personal Data.** Any information relating to an identified or identifiable natural person.
**Processing.** Any operation performed on personal data, including collection, storage, use, disclosure, and deletion.

Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to all personal data processed by the Company in connection with:

1. account registration and Know-Your-Customer (KYC) verification
2. browsing, search, and transaction activity on the Platform
3. communications sent through the Platform's chat, notification, and support systems
4. location data collected for delivery tracking
5. data collected through cookies and similar technologies (see the Cookie Policy)

## 4. User Rights

- Access a copy of the personal data the Company holds about the User
- Request correction of inaccurate or incomplete personal data
- Request deletion of personal data, subject to legal retention obligations described in the Data Retention Policy
- Object to, or request restriction of, certain processing activities
- Withdraw consent for optional processing (such as marketing communications) at any time
- Lodge a complaint with a competent data protection authority

## 5. User Responsibilities

- Provide accurate personal data and update it when it changes
- Safeguard account credentials to prevent unauthorised access to personal data
- Exercise privacy rights through the designated channels described in Section 12 (Contact Information)
- Refrain from submitting another person's personal data without lawful authority to do so

## 6. Marketplace Responsibilities

- Collect only the personal data reasonably necessary for the purposes described in this Policy
- Apply appropriate technical and organisational safeguards, as detailed in the Security Policy and Data Protection Policy
- Not sell personal data to third parties
- Disclose personal data to third parties only as described in this Policy or with the User's consent
- Notify affected Users and relevant authorities of a qualifying personal data breach without undue delay

## 7. Platform Limitations

- The Company cannot guarantee absolute security of data transmitted over the internet
- Where a User voluntarily discloses personal data in a public listing, review, or chat message, the Company cannot control its subsequent use by third parties who view it
- Certain data must be retained beyond account closure to satisfy legal, tax, or anti-money-laundering obligations, as described in the Data Retention Policy

## 8. Legal Obligations

The Company processes personal data in accordance with Applicable Law, including data protection legislation of general application, and will honour lawful data subject requests within the timeframes such legislation prescribes.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Internal investigation of any suspected unauthorised access to or misuse of personal data
- Restriction of the offending User's or Staff Member's access to personal data systems
- Notification to affected Users and, where required, to a competent authority

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_privacy_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'privacy_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'cookie_policy', $legaldoc_cookie_policy$
# Cookie Policy

*Jedida Marketplace Legal Center — Platform-Wide*
*Related documents: [Privacy Policy](/legal/privacy_policy), [Data Protection Policy](/legal/data_protection_policy).*

## 1. Purpose

This Cookie Policy explains how the Platform uses cookies and similar tracking technologies, and how Users can control them.

## 2. Definitions

**Cookie.** A small text file placed on a User's device that stores information about the User's browsing activity or preferences.

Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to cookies and similar technologies (local storage, pixels, SDK identifiers) deployed:

1. on the Platform's websites and web applications
2. within the Platform's mobile applications
3. by approved third-party analytics and advertisement partners operating on the Platform

## 4. User Rights

- Accept or decline non-essential cookies through the cookie consent banner or device settings
- Withdraw previously given cookie consent at any time
- Request information on the categories of cookies in use and their respective purposes

## 5. User Responsibilities

- Configure browser or device settings if they wish to limit cookie collection, understanding that this may affect Platform functionality
- Review this Policy periodically for updates

## 6. Marketplace Responsibilities

- Categorise cookies as strictly necessary, functional, analytics, or advertising, and disclose each category's purpose and retention period
- Obtain consent for non-essential cookies where required by Applicable Law
- Honour a User's cookie preferences across sessions

## 7. Platform Limitations

- Strictly necessary cookies (for example, session authentication and fraud-prevention cookies) cannot be disabled without impairing core Platform functionality
- Disabling cookies through device settings outside the Platform's own consent tools may not be detected by the Platform

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of a third-party partner's tracking technology from the Platform if it is found to operate outside its disclosed purpose
- Review and, where necessary, revision of consent mechanisms found to be non-compliant

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_cookie_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'cookie_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'marketplace_rules', $legaldoc_marketplace_rules$
# Marketplace Rules

*Jedida Marketplace Legal Center — Platform-Wide*
*Related documents: [Community Guidelines](/legal/community_guidelines), [Fraud Prevention Policy](/legal/fraud_prevention_policy), [Prohibited Products Policy](/legal/prohibited_products_policy).*

## 1. Purpose

These Marketplace Rules define the baseline standards of conduct required of every User and identify the categories of prohibited conduct that apply across all roles on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

These Rules apply to all activity conducted on or through the Platform, including but not limited to conduct relating to:

1. creation and use of accounts, including multiple or fraudulent accounts
2. product listings, orders, reviews, and ratings
3. communications between Users, including chat and support channels
4. use of the Platform's automated systems, including its application programming interfaces and AI features

## 4. User Rights

- Expect that other Users are held to the same standards set out in these Rules
- Report suspected violations through the Platform's reporting tools
- Receive a response to a good-faith report within a reasonable time

## 5. User Responsibilities

- Not create or operate fake, duplicate, or impersonating accounts
- Not send unsolicited bulk messages (spam) or engage in harassment of any User
- Not list, advertise, or facilitate the sale of illegal products, including but not limited to controlled drugs, unlicensed weapons, or child exploitation material
- Not list counterfeit or trademark-infringing goods
- Not use the Platform to facilitate money laundering, terrorist financing, or sanctions evasion
- Not fabricate reviews, ratings, or orders, or manipulate ranking or recommendation systems
- Not exploit, reverse-engineer, or abuse the Platform's systems, bots, or artificial intelligence features, including through automated scraping or denial-of-service activity
- Not misuse the Platform's application programming interfaces outside the API Usage Policy

## 6. Marketplace Responsibilities

- Operate automated and human review systems to detect violations of these Rules
- Apply these Rules consistently across all User roles
- Publish clear reporting channels and investigate reports in good faith
- Maintain records of enforcement actions for audit and appeal purposes

## 7. Platform Limitations

- Automated detection systems, including Tausi AI and Petiti AI, may not identify every violation, and the Company does not warrant complete or continuous detection
- The Company relies in part on User reports and cannot review all Content or activity in real time

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Warnings, listing removal, or feature restriction for first or minor violations
- Account suspension for repeated or serious violations, subject to the Account Suspension Policy
- Immediate termination for violations involving illegal products, fraud, or harm to another User, subject to the Account Termination Policy
- Referral to law enforcement where the violation may constitute a criminal offence

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_marketplace_rules$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'marketplace_rules');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'community_guidelines', $legaldoc_community_guidelines$
# Community Guidelines

*Jedida Marketplace Legal Center — Platform-Wide*
*Related documents: [Marketplace Rules](/legal/marketplace_rules).*

## 1. Purpose

These Community Guidelines describe the standard of respectful, honest, and constructive interaction expected of every User when communicating on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

These Guidelines apply to all User-generated interactions, including:

1. buyer-seller and buyer-delivery chat conversations
2. product reviews, ratings, and questions and answers
3. shop and profile content
4. any public-facing Content a User submits to the Platform

## 4. User Rights

- Communicate with other Users through the Platform's supported channels without fear of harassment
- Receive translations of chat messages where the Platform's language translation feature is enabled
- Flag disrespectful, abusive, or inappropriate Content for review

## 5. User Responsibilities

- Communicate honestly and refrain from making false claims about products, services, or other Users
- Treat other Users, Delivery Partners, and Staff Members with courtesy
- Refrain from posting hateful, discriminatory, sexually explicit, or violent Content
- Refrain from soliciting off-Platform payment or communication where doing so is intended to circumvent Buyer or Seller protections
- Provide honest reviews based on genuine transaction experience

## 6. Marketplace Responsibilities

- Moderate reported Content in a timely and consistent manner
- Provide translation tooling on a best-efforts basis to support cross-language communication
- Preserve a record of moderated Content for audit purposes

## 7. Platform Limitations

- Machine translation may not perfectly convey intent or nuance, and the Company is not liable for translation inaccuracies
- The Company cannot pre-screen all User-generated Content before publication

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of the offending Content
- Formal warning recorded against the User's account
- Suspension of chat or review privileges for repeated violations
- Account suspension or termination for severe or repeated breaches

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_community_guidelines$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'community_guidelines');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'accessibility_policy', $legaldoc_accessibility_policy$
# Accessibility Policy

*Jedida Marketplace Legal Center — Platform-Wide*
*Related documents: [Terms of Service](/legal/terms_of_service).*

## 1. Purpose

This Accessibility Policy sets out the Company's commitment to making the Platform usable by people of all abilities, and the process by which Users can report accessibility barriers.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to the accessibility of:

1. the Platform's web application
2. the Platform's mobile applications
3. transactional communications and notifications sent by the Platform

## 4. User Rights

- Request reasonable accommodation when interacting with Platform support channels
- Report accessibility barriers and receive acknowledgement of the report
- Be informed of the Company's progress in addressing reported barriers, where practicable

## 5. User Responsibilities

- Report accessibility barriers with sufficient detail (page, feature, and assistive technology used) to allow investigation
- Use the Platform in accordance with these Terms while exercising any accommodation provided

## 6. Marketplace Responsibilities

- Take reasonable, ongoing steps toward conformance with recognised accessibility standards such as the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA
- Prioritise remediation of reported barriers that prevent completion of core functions such as checkout, account management, and order tracking
- Provide alternative means of completing critical transactions where a full accessibility remediation is not immediately practicable

## 7. Platform Limitations

- Third-party Content embedded on the Platform, including Seller-supplied product images and descriptions, may not fully conform to these standards
- Achieving full conformance is an ongoing process rather than an instantaneous guarantee

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Not applicable in the same enforcement sense as User-facing policies; this Policy instead commits the Company to a remediation process for reported barriers

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_accessibility_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'accessibility_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'buyer_agreement', $legaldoc_buyer_agreement$
# Buyer Agreement

*Jedida Marketplace Legal Center — Buyer*
*Related documents: [Refund Policy](/legal/refund_policy), [Escrow Policy](/legal/escrow_policy), [Wallet Policy](/legal/wallet_policy), [Dispute Resolution Policy](/legal/dispute_resolution_policy).*

## 1. Purpose

This Buyer Agreement sets out the specific rights and obligations that apply to a User acting in the capacity of a Buyer, supplementing the Terms of Service.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Agreement governs a Buyer's use of the Platform in connection with:

1. browsing listings and completing checkout
2. payments, including manual mobile-money payment verification
3. order cancellation, completion, and (where applicable) deletion of order records
4. refund requests, returns, and chargebacks
5. buyer-seller and buyer-delivery chat communication, including translated messages
6. submission of reviews and ratings
7. dispute initiation and Buyer protection claims under the Escrow Policy
8. use of the marketplace wallet, coupons, and promotional offers
9. calculation and disclosure of applicable taxes
10. purchases from Sellers offering international shipping

## 4. User Rights

- Receive an accurate description of a product or service prior to purchase
- Have payment held in escrow until delivery is confirmed, in accordance with the Escrow Policy
- Request a refund in accordance with the Refund Policy where an Order is not fulfilled as described
- Cancel an eligible Order prior to shipment, in accordance with the Cancellation Policy
- Leave an honest review and rating after a completed Order
- Escalate an unresolved dispute to the Company for review
- Communicate with the Seller and Delivery Partner through the Platform's monitored channels

## 5. User Responsibilities

- Provide accurate delivery and contact information at checkout
- Complete payment through a supported method and, for manual payments, submit accurate proof of payment
- Confirm receipt of delivery promptly so that escrowed funds may be released to the Seller
- Raise disputes in good faith and with supporting evidence
- Not misuse the refund, return, or chargeback process to obtain goods or services without payment
- Pay all taxes and duties applicable to a purchase, including those arising from international purchases

## 6. Marketplace Responsibilities

- Hold Buyer payment in the Escrow Wallet until delivery is confirmed or a dispute is resolved
- Provide a checkout flow that discloses price, applicable fees, and estimated delivery timelines before payment
- Investigate Buyer disputes and manual payment submissions in a timely manner
- Provide a mechanism for Buyers to track Order status and communicate with the Seller and Delivery Partner

## 7. Platform Limitations

- The Company is not the seller of record for products listed by independent Sellers and does not guarantee product quality beyond the protections expressly set out in the Escrow Policy and Refund Policy
- Currency conversion, customs duties, and import taxes on international purchases are the Buyer's responsibility unless otherwise stated at checkout
- Coupons and promotional credits have no cash value and expire in accordance with their stated terms

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Restriction of checkout or refund privileges where a Buyer is found to have submitted fraudulent proof of payment or abused the refund process
- Suspension of the Buyer's account for repeated unfounded chargebacks
- Forfeiture of promotional credit obtained through abuse of coupon or promotion terms

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_buyer_agreement$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'buyer_agreement');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'refund_policy', $legaldoc_refund_policy$
# Refund Policy

*Jedida Marketplace Legal Center — Buyer*
*Related documents: [Return Policy](/legal/return_policy), [Cancellation Policy](/legal/cancellation_policy), [Chargeback Policy](/legal/chargeback_policy), [Escrow Policy](/legal/escrow_policy).*

## 1. Purpose

This Refund Policy defines the circumstances under which a Buyer is entitled to a refund of amounts paid for an Order, and the process for requesting and resolving refund claims.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to all Orders paid for through the Platform's supported payment methods, and addresses:

1. eligible refund circumstances, including non-delivery, damaged goods, and materially inaccurate listings
2. non-refundable categories, including digital products and rendered services, except where defective
3. refunds for late deliveries that exceed the Seller's stated delivery window
4. refunds arising from confirmed fraud
5. refund timelines and the investigation process

## 4. User Rights

- Request a refund within the timeframe stated at checkout or, where none is stated, within fourteen (14) days of the delivery confirmation or the missed delivery date
- Receive a decision on a refund request within a reasonable investigation period
- Escalate a denied refund request to the Dispute Resolution process

## 5. User Responsibilities

- Submit a refund request with supporting evidence, such as photographs of a damaged or incorrect item
- Return a physical product in accordance with the Return Policy where a return is a precondition of the refund
- Cooperate with the Company's investigation, including responding to requests for further information

## 6. Marketplace Responsibilities

- Review refund requests against the evidence provided by the Buyer and the Seller
- Release refunds from the Escrow Wallet promptly upon approval
- Notify both parties of the outcome and the reasoning for the decision

## 7. Platform Limitations

- Digital products that have been accessed or downloaded, and services that have been fully rendered, are non-refundable except where materially defective or not as described
- The Company is not liable for refund delays caused by the Buyer's payment provider
- A refund does not, by itself, resolve a dispute over a Seller's ongoing conduct; separate enforcement action may follow under the Marketplace Rules

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Denial of future refund eligibility for a Buyer found to have submitted fraudulent refund claims
- Reversal of a refund improperly obtained through false evidence
- Account suspension for repeated abuse of the refund process

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_refund_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'refund_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'return_policy', $legaldoc_return_policy$
# Return Policy

*Jedida Marketplace Legal Center — Buyer*
*Related documents: [Refund Policy](/legal/refund_policy), [Product Listing Policy](/legal/product_listing_policy).*

## 1. Purpose

This Return Policy sets out the conditions under which a Buyer may return a physical product to a Seller as a precondition to a refund or exchange.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to physical products purchased through the Platform, and addresses:

1. eligibility windows for initiating a return
2. product condition requirements for an accepted return
3. return shipping responsibility
4. categories of goods that are not eligible for return for hygiene, safety, or perishability reasons

## 4. User Rights

- Initiate a return within the window disclosed on the product listing, or within seven (7) days of delivery where none is disclosed
- Receive confirmation once a returned item has been received and inspected by the Seller
- Receive a refund or exchange promptly following an accepted return

## 5. User Responsibilities

- Return the product in the condition in which it was received, with original packaging where reasonably practicable
- Use a trackable shipping method where required by the Seller's return instructions
- Bear return shipping costs unless the return is due to a Seller error or a defective product

## 6. Marketplace Responsibilities

- Display each Seller's return window and conditions on the relevant product listing
- Mediate disputes over whether a returned item meets the required condition
- Withhold release of escrowed funds pending confirmation of a valid return where applicable

## 7. Platform Limitations

- Perishable goods, made-to-order items, and products marked as final sale on the listing are not eligible for return except where materially defective
- The Company does not itself receive or inspect returned goods; this is the Seller's responsibility, subject to Company oversight in the event of a dispute

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Denial of a return request found to be based on a misrepresented product condition
- Restriction of return privileges for a Buyer found to engage in a pattern of unfounded return claims

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_return_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'return_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'cancellation_policy', $legaldoc_cancellation_policy$
# Cancellation Policy

*Jedida Marketplace Legal Center — Buyer*
*Related documents: [Refund Policy](/legal/refund_policy).*

## 1. Purpose

This Cancellation Policy defines when and how a Buyer or Seller may cancel an Order prior to its completion.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to the cancellation of Orders at any stage prior to delivery confirmation, and addresses:

1. Buyer-initiated cancellation prior to shipment
2. Seller-initiated cancellation due to stock unavailability
3. cancellation of grouped cart checkouts
4. the effect of cancellation on escrowed funds

## 4. User Rights

- Cancel an Order free of charge at any time before the Seller marks it as shipped
- Receive a full refund to the original payment method or platform wallet upon a valid cancellation
- Be notified promptly if a Seller cancels an Order due to unavailability

## 5. User Responsibilities

- Cancel in good faith and not as a means of circumventing a legitimate Order obligation after shipment has occurred
- Communicate promptly with the Seller where a cancellation request follows a change in delivery details

## 6. Marketplace Responsibilities

- Release escrowed funds back to the Buyer promptly upon a valid cancellation
- Record cancellation reasons for Seller performance monitoring
- Provide a clear cancellation control within the Order management interface

## 7. Platform Limitations

- Once an Order has been marked as shipped, cancellation is no longer available and the Buyer must instead pursue a return or refund
- Cancellation is not available for services that have already commenced or digital products that have already been delivered

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Performance monitoring and, for repeated unjustified Seller-side cancellations, restriction of the Seller's listing privileges
- Restriction of checkout privileges for a Buyer found to abuse cancellation to avoid legitimate obligations

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_cancellation_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'cancellation_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'chargeback_policy', $legaldoc_chargeback_policy$
# Chargeback Policy

*Jedida Marketplace Legal Center — Buyer*
*Related documents: [Refund Policy](/legal/refund_policy), [Fraud Prevention Policy](/legal/fraud_prevention_policy), [Payment Policy](/legal/payment_policy).*

## 1. Purpose

This Chargeback Policy sets out how the Company handles a Buyer's chargeback or payment dispute filed with a card issuer or payment provider in respect of a Platform transaction.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to any chargeback, reversal, or payment dispute initiated outside the Platform's own refund process, including:

1. card-network chargebacks
2. mobile-money reversal requests
3. bank-initiated payment disputes

## 4. User Rights

- Be notified when a chargeback is filed against an Order the Buyer placed
- Have the Company's investigation findings considered by the payment provider where the Company submits representations
- Continue to use the Platform's own refund process as an alternative to a chargeback

## 5. User Responsibilities

- Attempt to resolve a payment concern through the Platform's Refund Policy before filing a chargeback, except where the payment provider's rules require otherwise
- Provide the Company with information reasonably requested to respond to a chargeback
- Refrain from filing a chargeback for an Order that has already been refunded through the Platform

## 6. Marketplace Responsibilities

- Respond to chargeback notifications from payment providers within the applicable deadline
- Investigate the underlying Order and provide evidence to the payment provider where the chargeback appears unfounded
- Recover, where permitted by Applicable Law and the relevant payment provider's rules, amounts paid out to a Seller that are later reversed by a successful chargeback found to be fraudulent

## 7. Platform Limitations

- The Company does not control the outcome of a chargeback, which is determined by the Buyer's payment provider or card network
- A successful chargeback may result in suspension of the associated account pending investigation

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Suspension of the Buyer's account for a pattern of chargebacks inconsistent with legitimate Order concerns ("friendly fraud")
- Recovery action against a Buyer found to have obtained goods and a refund through a fraudulent chargeback

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_chargeback_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'chargeback_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'seller_agreement', $legaldoc_seller_agreement$
# Seller Agreement

*Jedida Marketplace Legal Center — Seller*
*Related documents: [Product Listing Policy](/legal/product_listing_policy), [Commission Policy](/legal/commission_policy), [KYC Verification Policy](/legal/kyc_verification_policy), [Prohibited Products Policy](/legal/prohibited_products_policy).*

## 1. Purpose

This Seller Agreement sets out the specific rights and obligations that apply to a User approved to operate a Shop on the Platform, supplementing the Terms of Service.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Agreement governs a Seller's use of the Platform in connection with:

1. Shop creation and ownership
2. completion of Know-Your-Customer (KYC) verification prior to activation
3. product uploads, including images, videos, descriptions, pricing, and inventory
4. discounts and promotional listings
5. advertising through the Platform's ad system
6. Seller subscription plans
7. withdrawal of available balance and commission deductions
8. applicable taxes on sales
9. refund and delivery obligations owed to Buyers
10. standards of chat conduct with Buyers
11. protection of Buyer data accessed through the Shop
12. Shop suspension, re-verification, and termination

## 4. User Rights

- Operate a Shop with a shareable storefront link once approved
- Set prices, discounts, and promotional terms for listed products, subject to the Product Listing Policy
- Receive settlement of available balance in accordance with the Payment Policy and Wallet Policy, net of applicable commission
- Dispute a Buyer claim through the Platform's dispute process before funds are released or reversed
- Access performance and sales analytics for the Seller's own Shop

## 5. User Responsibilities

- Complete KYC verification, including submission of a valid identity document and, where applicable, business registration documents, before activating a Shop
- List only products the Seller is legally entitled to sell, with accurate descriptions, images, and pricing
- Maintain sufficient inventory accuracy to avoid Order cancellation due to unavailability
- Not list counterfeit, replica, or trademark-infringing goods
- Fulfil confirmed Orders within the stated processing time and hand off to a Delivery Partner or shipping method promptly
- Honour the Buyer-facing Refund Policy and Return Policy for products sold through the Shop
- Pay the commission and any subscription fees applicable to the Seller's plan
- Report and remit applicable sales taxes in accordance with the Tax Policy
- Communicate with Buyers professionally and only through the Platform's monitored channels
- Protect any Buyer data accessed in the course of fulfilling an Order and use it solely for that purpose

## 6. Marketplace Responsibilities

- Review KYC submissions and activate or reject Shops within a reasonable timeframe
- Provide listing, inventory, and order-management tooling for Sellers
- Deduct commission transparently and disclose the applicable rate before a sale is confirmed
- Release settled funds in accordance with the Payment Policy and Wallet Policy
- Investigate Buyer complaints against a Shop and apply enforcement consistently with the Marketplace Rules

## 7. Platform Limitations

- The Company does not guarantee any minimum level of sales or Platform visibility for a Shop
- The Company may feature, rank, or de-rank listings using automated systems, including Tausi AI, based on quality, demand, and trust signals
- A Shop's access to the Platform may be suspended pending investigation of a Buyer complaint without prior notice where warranted by risk of harm

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of non-compliant listings
- Suspension of the Shop pending investigation, in accordance with the Account Suspension Policy
- Withholding of escrowed funds related to a disputed Order pending resolution
- Termination of the Shop and forfeiture of Platform access for serious or repeated violations, including sale of counterfeit or prohibited goods

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_seller_agreement$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'seller_agreement');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'product_listing_policy', $legaldoc_product_listing_policy$
# Product Listing Policy

*Jedida Marketplace Legal Center — Seller*
*Related documents: [Seller Agreement](/legal/seller_agreement), [Prohibited Products Policy](/legal/prohibited_products_policy), [AI Generated Content Policy](/legal/ai_generated_content_policy).*

## 1. Purpose

This Product Listing Policy sets out the standards a Seller must meet when creating and maintaining product listings on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to every listing published on the Platform, and addresses:

1. accuracy of titles, descriptions, and specifications
2. image and video quality and authenticity requirements
3. pricing transparency, including disclosure of currency and applicable fees
4. categorisation and use of the Platform's listing templates
5. use of AI-assisted listing tools, including Colline, to prepare listings for review

## 4. User Rights

- Use the Platform's listing templates and AI-assisted drafting tools to prepare listings for submission
- Edit or remove a listing at any time, subject to fulfilment obligations for existing Orders
- Receive a reason where a listing is rejected or removed during review

## 5. User Responsibilities

- Ensure images and videos accurately represent the product offered, and are either the Seller's own or used with rights to do so
- Disclose material product specifications, including condition (new or used) and any defects
- Price listings in a manner that is not deceptive, including avoiding hidden mandatory fees not disclosed at listing level
- Update inventory quantity promptly to avoid overselling
- Categorise listings accurately to support Buyer search and discovery

## 6. Marketplace Responsibilities

- Review submitted listings, whether AI-assisted or manually created, before they go live, in accordance with the Platform's moderation workflow
- Provide clear listing templates and category structures
- Remove or flag listings that appear to violate this Policy, the Prohibited Products Policy, or the Restricted Products Policy

## 7. Platform Limitations

- AI-assisted listing tools generate suggested content for Seller review; the Seller remains solely responsible for the accuracy of the published listing
- Automated moderation may not detect every non-compliant listing prior to publication

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Rejection or removal of a non-compliant listing
- Formal warning recorded against the Shop for repeated inaccurate listings
- Suspension of listing privileges for a pattern of deceptive listings

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_product_listing_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'product_listing_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'prohibited_products_policy', $legaldoc_prohibited_products_policy$
# Prohibited Products Policy

*Jedida Marketplace Legal Center — Seller*
*Related documents: [Restricted Products Policy](/legal/restricted_products_policy), [Marketplace Rules](/legal/marketplace_rules), [Fraud Prevention Policy](/legal/fraud_prevention_policy).*

## 1. Purpose

This Prohibited Products Policy identifies categories of products and services that may never be listed, advertised, or sold on the Platform under any circumstances.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to every listing, advertisement, and transaction on the Platform, and prohibits, without limitation:

1. illegal drugs and controlled substances not lawfully permitted for retail sale
2. firearms, ammunition, explosives, and other weapons where prohibited by Applicable Law
3. stolen goods
4. counterfeit or unauthorised replica goods
5. child sexual abuse material and any content sexualising minors
6. materials promoting terrorism or violent extremism
7. human beings, human organs, or endangered wildlife and derived products
8. items that infringe a third party's intellectual property rights

## 4. User Rights

- Report a suspected prohibited listing through the Platform's reporting tools
- Expect prompt removal of a reported prohibited listing upon verification

## 5. User Responsibilities

- Not list, advertise, or attempt to sell any product or service falling within a prohibited category
- Cooperate with an investigation into a listing suspected of violating this Policy

## 6. Marketplace Responsibilities

- Maintain and publish an illustrative (non-exhaustive) list of prohibited categories
- Deploy automated screening, including fraud-detection systems, to detect prohibited listings prior to and after publication
- Remove confirmed prohibited listings immediately upon detection

## 7. Platform Limitations

- The categories listed in this Policy are illustrative and not exhaustive; a product may be prohibited under Applicable Law even where not expressly named here
- Automated detection systems cannot guarantee that every prohibited listing is identified before publication

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Immediate removal of the listing
- Immediate suspension of the Shop pending investigation
- Termination of the Shop and permanent ban from re-registration for confirmed violations
- Referral to law enforcement, particularly for listings involving weapons, drugs, exploitation material, or trafficking

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_prohibited_products_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'prohibited_products_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'restricted_products_policy', $legaldoc_restricted_products_policy$
# Restricted Products Policy

*Jedida Marketplace Legal Center — Seller*
*Related documents: [Prohibited Products Policy](/legal/prohibited_products_policy), [Product Listing Policy](/legal/product_listing_policy).*

## 1. Purpose

This Restricted Products Policy identifies categories of products that may be listed only subject to additional verification, disclosure, or regulatory conditions.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to product categories that are lawful to sell but subject to heightened Platform controls, including:

1. age-restricted goods, such as alcohol and tobacco products where locally lawful
2. certain agricultural inputs, such as regulated pesticides or veterinary products
3. health, beauty, and consumable products requiring appropriate labelling
4. electronics and vehicles subject to safety or registration disclosures

## 4. User Rights

- List a restricted-category product once the applicable verification or disclosure condition has been met
- Appeal a rejection of a restricted-category listing with supporting documentation

## 5. User Responsibilities

- Provide any additional documentation, licence, or certification the Platform requires for a restricted category before the listing is published
- Include all disclosures required for the category, such as age restrictions, usage warnings, or expiry dates
- Comply with Applicable Law governing the sale of the restricted category in the Buyer's jurisdiction

## 6. Marketplace Responsibilities

- Define the categories subject to restriction and the corresponding verification requirements
- Review restricted-category listings before publication
- Apply age-verification or disclosure prompts at checkout where required by the category

## 7. Platform Limitations

- The Company may decline to permit a restricted category in a given jurisdiction where compliance cannot be reasonably verified
- Meeting a restricted-category requirement does not exempt the Seller from Applicable Law in the Buyer's jurisdiction

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of a restricted listing published without the required verification or disclosure
- Suspension of the Shop's ability to list further restricted-category products
- Escalation to the Prohibited Products Policy enforcement track where the restriction was used to conceal an outright prohibited item

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_restricted_products_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'restricted_products_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'vendor_subscription_policy', $legaldoc_vendor_subscription_policy$
# Vendor Subscription Policy

*Jedida Marketplace Legal Center — Seller*
*Related documents: [Seller Agreement](/legal/seller_agreement), [Commission Policy](/legal/commission_policy), [Marketplace Fees Policy](/legal/marketplace_fees_policy).*

## 1. Purpose

This Vendor Subscription Policy sets out the terms applicable to paid Seller subscription plans offered on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to optional paid plans that grant a Seller enhanced Platform features, and addresses:

1. subscription tiers and their included features
2. billing cycles and renewal
3. upgrade, downgrade, and cancellation of a plan
4. the effect of subscription lapse on active listings

## 4. User Rights

- Select, upgrade, downgrade, or cancel a subscription plan at any time, effective as described in the plan's terms
- Receive notice in advance of a subscription price change
- Receive the features associated with the Seller's active plan for the duration of the billing period paid for

## 5. User Responsibilities

- Pay subscription fees when due through an accepted payment method
- Monitor the Shop's subscription status to avoid unintended feature loss upon expiry

## 6. Marketplace Responsibilities

- Clearly disclose the features, price, and billing cycle of each subscription tier before purchase
- Provide advance notice of price changes to active subscribers
- Process cancellations without imposing undisclosed penalties

## 7. Platform Limitations

- Subscription fees are generally non-refundable for the current billing period once the period has commenced, except where required by Applicable Law
- Downgrading or cancelling a subscription may result in loss of access to tier-specific features, including enhanced listing limits or promotional placement

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Suspension of tier-specific features for non-payment
- Reversion to the free tier upon subscription lapse, without removal of existing compliant listings unless they exceed the free tier's limits

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_vendor_subscription_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'vendor_subscription_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'commission_policy', $legaldoc_commission_policy$
# Commission Policy

*Jedida Marketplace Legal Center — Seller*
*Related documents: [Marketplace Fees Policy](/legal/marketplace_fees_policy), [Payment Policy](/legal/payment_policy), [Wallet Policy](/legal/wallet_policy).*

## 1. Purpose

This Commission Policy sets out how the Platform calculates and deducts its commission from Seller sales.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to every completed Order processed through the Platform, and addresses:

1. the applicable commission rate by product category or Seller plan
2. the point at which commission is calculated and deducted
3. interaction between commission and coupon or promotional discounts
4. commission treatment of refunded or cancelled Orders

## 4. User Rights

- Be informed of the applicable commission rate before listing a product
- View a breakdown of commission deducted from each completed sale in the Shop's transaction history

## 5. User Responsibilities

- Price listings with awareness that the disclosed commission will be deducted from the sale proceeds
- Raise any discrepancy in a commission calculation within the timeframe stated in the Dispute Resolution Policy

## 6. Marketplace Responsibilities

- Publish the applicable commission rate for each product category and Seller plan
- Deduct commission transparently at the point of settlement and reflect it in the Seller's transaction records
- Refund or waive commission on an Order that is fully refunded to the Buyer

## 7. Platform Limitations

- Commission rates may vary by category, promotional period, or subscription tier, and are subject to change with reasonable prior notice
- Commission already earned on a completed and non-refunded Order is not waived retroactively by a subsequent policy change

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Recovery of underpaid commission identified through audit
- Suspension of settlement for a Shop found to structure transactions to circumvent commission, including directing Buyers to pay off-Platform

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_commission_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'commission_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'marketplace_fees_policy', $legaldoc_marketplace_fees_policy$
# Marketplace Fees Policy

*Jedida Marketplace Legal Center — Seller*
*Related documents: [Commission Policy](/legal/commission_policy), [Payment Policy](/legal/payment_policy), [Vendor Subscription Policy](/legal/vendor_subscription_policy).*

## 1. Purpose

This Marketplace Fees Policy sets out fees, other than sales commission, that may apply to a Seller's or Buyer's use of the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to ancillary fees that may be charged in connection with:

1. seller upgrade verification fees
2. withdrawal or payout processing fees
3. promotional placement and advertisement fees
4. currency conversion fees on cross-border transactions

## 4. User Rights

- Be informed of any applicable fee before incurring it
- Receive a receipt or transaction record reflecting each fee charged

## 5. User Responsibilities

- Pay disclosed fees through an accepted payment method
- Review the fee schedule applicable to the User's role and plan before initiating a transaction that incurs a fee

## 6. Marketplace Responsibilities

- Publish a current fee schedule accessible from the Legal Center and relevant in-app screens
- Provide advance notice of material changes to the fee schedule
- Ensure fees are calculated accurately and reflected in the User's transaction history

## 7. Platform Limitations

- Third-party payment providers may impose their own processing fees in addition to Platform fees, which the Company does not control
- Currency conversion fees reflect prevailing market rates at the time of transaction and may fluctuate

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Correction of an incorrectly charged fee upon verification
- Suspension of the relevant feature (for example, promotional placement) for non-payment of an associated fee

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_marketplace_fees_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'marketplace_fees_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'delivery_partner_agreement', $legaldoc_delivery_partner_agreement$
# Delivery Partner Agreement

*Jedida Marketplace Legal Center — Delivery*
*Related documents: [Shipping Policy](/legal/shipping_policy), [Delivery Policy](/legal/delivery_policy), [KYC Verification Policy](/legal/kyc_verification_policy).*

## 1. Purpose

This Delivery Partner Agreement sets out the specific rights and obligations that apply to a User approved to provide delivery services on the Platform, supplementing the Terms of Service.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Agreement governs a Delivery Partner's use of the Platform in connection with:

1. identity and vehicle verification prior to activation
2. background checks where required by the Company or Applicable Law
3. acceptance, collection, and handling of Orders
4. use of GPS tracking during an active delivery
5. provision of proof of delivery
6. handling of delivery disputes and late-delivery claims
7. cancellation of an accepted delivery
8. ratings received from Buyers and Sellers
9. payment for completed deliveries
10. insurance coverage, where provided, for goods in transit
11. standards of communication and professional conduct

## 4. User Rights

- Accept or decline an available delivery request, subject to the Platform's fairness and performance policies
- Receive the disclosed delivery fee upon confirmed completion of a delivery
- Dispute a low rating or delivery complaint believed to be unfounded
- Access support in the event of a safety incident during a delivery

## 5. User Responsibilities

- Complete identity and vehicle verification, including submission of a valid driving permit and vehicle documents where applicable, before accepting deliveries
- Undergo any background check the Company requires as a condition of activation
- Handle packages with reasonable care and avoid tampering with their contents
- Keep GPS location sharing enabled for the duration of an active delivery
- Provide verifiable proof of delivery, such as a recipient confirmation, photograph, or code
- Communicate promptly and professionally with Buyers and Sellers regarding delivery status
- Report an inability to complete a delivery as early as reasonably possible

## 6. Marketplace Responsibilities

- Verify Delivery Partner identity and, where applicable, vehicle and background information before activation
- Provide real-time tracking and proof-of-delivery tooling
- Process delivery fee payments promptly upon confirmed completion
- Investigate delivery disputes and late-delivery claims fairly, considering GPS and timestamp records
- Provide a reporting channel for safety incidents

## 7. Platform Limitations

- The Company is not the employer of a Delivery Partner, who provides services on an independent basis unless a separate written agreement states otherwise
- Insurance coverage for goods in transit, where offered, is subject to the terms and limits disclosed at the time of activation and does not cover loss caused by the Delivery Partner's wilful misconduct or gross negligence
- GPS tracking accuracy depends on device and network conditions outside the Company's control

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Formal warning for a first instance of late delivery without reasonable cause
- Suspension of delivery assignment privileges for a pattern of late or failed deliveries
- Termination of Delivery Partner status for package tampering, fraud, or unsafe conduct
- Referral to law enforcement for theft or other criminal conduct

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_delivery_partner_agreement$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'delivery_partner_agreement');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'shipping_policy', $legaldoc_shipping_policy$
# Shipping Policy

*Jedida Marketplace Legal Center — Delivery*
*Related documents: [Delivery Policy](/legal/delivery_policy), [Delivery Partner Agreement](/legal/delivery_partner_agreement), [Refund Policy](/legal/refund_policy).*

## 1. Purpose

This Shipping Policy sets out the standards governing how products are packaged, dispatched, and transported from a Seller to a Buyer or handed to a Delivery Partner.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to the shipping stage of an Order, from Seller dispatch until handover to a Delivery Partner or carrier, and addresses:

1. packaging standards to prevent damage in transit
2. disclosure of estimated dispatch and delivery timeframes
3. use of Platform-integrated delivery versus Seller-arranged shipping
4. shipment tracking information

## 4. User Rights

- Receive an estimated dispatch and delivery timeframe at checkout
- Receive tracking information once an Order has shipped, where tracking is supported for the shipping method used
- Raise a claim under the Refund Policy where an Order is not dispatched within the disclosed timeframe

## 5. User Responsibilities

- Dispatch Orders within the timeframe disclosed on the listing
- Package products adequately to withstand ordinary transit conditions
- Provide accurate tracking or handover information to the Platform where available

## 6. Marketplace Responsibilities

- Display estimated shipping timelines to Buyers at checkout based on Seller and Delivery Partner data
- Provide tracking visibility to Buyers where the Platform's integrated delivery service is used
- Monitor Seller dispatch performance for consistent delay

## 7. Platform Limitations

- Shipping timelines are estimates and may be affected by factors outside the Company's control, including weather, traffic, and customs processing for international purchases
- Where a Seller arranges shipping independently of the Platform's integrated delivery service, the Company's visibility into shipment status may be limited to information the Seller provides

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Performance flags against a Shop for a pattern of late dispatch
- Removal of a Shop's ability to use a shipping method associated with repeated damage claims

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_shipping_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'shipping_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'delivery_policy', $legaldoc_delivery_policy$
# Delivery Policy

*Jedida Marketplace Legal Center — Delivery*
*Related documents: [Shipping Policy](/legal/shipping_policy), [Delivery Partner Agreement](/legal/delivery_partner_agreement).*

## 1. Purpose

This Delivery Policy sets out the standards governing the final-mile delivery of an Order from a Delivery Partner or carrier to the Buyer.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to the final delivery stage of an Order, and addresses:

1. delivery attempt procedures and re-attempt windows
2. proof-of-delivery requirements
3. handling of failed or refused deliveries
4. delivery to an alternate recipient at the Buyer's address

## 4. User Rights

- Receive notice of an impending delivery attempt where the Platform's tracking feature supports it
- Refuse a delivery that is visibly damaged or does not match the Order
- Request a re-attempt within a reasonable window following a failed delivery attempt not caused by the Buyer

## 5. User Responsibilities

- Provide accurate, accessible delivery information at checkout
- Be reasonably available to receive the Order during the delivery window communicated by the Platform
- Inspect a delivered Order promptly and report any discrepancy without undue delay

## 6. Marketplace Responsibilities

- Require Delivery Partners to record proof of delivery for each completed Order
- Provide a mechanism for Buyers to report a failed, refused, or disputed delivery
- Coordinate re-attempts or returns to the Seller for Orders that cannot be delivered

## 7. Platform Limitations

- Repeated failed delivery attempts due to Buyer unavailability may result in the Order being returned to the Seller, subject to the Return Policy and Refund Policy
- The Company cannot guarantee delivery within a specific time of day unless expressly stated for a given service tier

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Investigation of a delivery marked complete but disputed by the Buyer, using GPS and proof-of-delivery records
- Corrective action against a Delivery Partner found to have falsified proof of delivery

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_delivery_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'delivery_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'administrator_agreement', $legaldoc_administrator_agreement$
# Administrator Agreement

*Jedida Marketplace Legal Center — Admin & Staff*
*Related documents: [Staff Agreement](/legal/staff_agreement), [Data Protection Policy](/legal/data_protection_policy), [Security Policy](/legal/security_policy).*

## 1. Purpose

This Administrator Agreement sets out the responsibilities, permissions, and conduct standards applicable to individuals granted administrative access to the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Agreement governs the exercise of administrative access by defined roles, each with responsibilities scoped to its function:

1. Super Admin — full platform configuration authority, including Legal Center publication, financial settings, and the ability to grant or revoke other administrative roles
2. Role Admin — administrative functions delegated by a Super Admin within a defined permission area
3. Support Staff — handling of User inquiries and non-financial account issues
4. Finance Staff — review of payments, withdrawals, and commission records
5. Moderators and Content Moderators — review and removal of listings and Content violating Platform policy
6. Chat Moderators — review of flagged chat communications for policy violations
7. AI Supervisors — oversight of automated decisions made by Tausi AI and Petiti AI, including override authority
8. KYC Officers — review and determination of identity and business verification submissions
9. Payment Officers — verification of manual payment submissions and escrow release decisions
10. Delivery Managers — oversight of Delivery Partner verification and performance
11. Advertisement Managers — review and approval of paid advertisement placements

## 4. User Rights

- Exercise the permissions assigned to the individual's specific administrative role, and no broader permissions than assigned
- Access the systems, logs, and tools reasonably necessary to perform the role's function
- Escalate a decision beyond the individual's authority to a Super Admin

## 5. User Responsibilities

- Exercise administrative access solely for legitimate Platform administration purposes
- Not access, disclose, or use User data, financial records, or account information beyond what is necessary to perform the assigned role
- Maintain the confidentiality of administrative credentials and Platform systems
- Apply Platform policies consistently and document the basis for enforcement decisions
- Escalate matters outside the scope of the individual's role

## 6. Marketplace Responsibilities

- Grant administrative access only to individuals who have agreed to this Agreement
- Maintain an audit log of administrative actions, as reflected in the Platform's settings audit trail
- Review and, where warranted, revoke administrative access that is misused

## 7. Platform Limitations

- Administrative access does not create an employment relationship by itself; the underlying relationship is governed by a separate employment or engagement agreement where applicable
- An Administrator's authority is limited to the permissions technically and formally assigned to that Administrator's role

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Immediate revocation of administrative access for unauthorised use of User data or financial systems
- Disciplinary action under the individual's separate employment or engagement terms
- Referral to law enforcement where misuse of administrative access may constitute a criminal offence, such as fraud or unauthorised computer access

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_administrator_agreement$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'administrator_agreement');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'staff_agreement', $legaldoc_staff_agreement$
# Staff Agreement

*Jedida Marketplace Legal Center — Admin & Staff*
*Related documents: [Administrator Agreement](/legal/administrator_agreement), [Data Protection Policy](/legal/data_protection_policy).*

## 1. Purpose

This Staff Agreement sets out the standards of conduct applicable to individuals engaged by the Company in a non-administrative operational capacity in support of the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Agreement governs Staff Members' use of Platform systems in the course of their duties, and addresses:

1. access to User support tools
2. handling of User communications and complaints
3. confidentiality of User and business information
4. use of internal tools and dashboards

## 4. User Rights

- Access the systems reasonably necessary to perform assigned duties
- Escalate a matter beyond the Staff Member's authority to the relevant Administrator role
- Receive training on the Platform's policies relevant to the Staff Member's function

## 5. User Responsibilities

- Use Platform systems solely for the performance of assigned duties
- Maintain the confidentiality of User data and internal business information, both during and after engagement with the Company
- Treat Users professionally and in accordance with the Community Guidelines
- Report suspected policy violations or security concerns through the appropriate internal channel

## 6. Marketplace Responsibilities

- Provide Staff Members with access scoped to their function
- Maintain a record of Staff access to sensitive systems
- Provide a channel for Staff Members to report concerns, including in relation to a Super Admin or Administrator's conduct

## 7. Platform Limitations

- This Agreement governs use of Platform systems and does not itself constitute the individual's employment or engagement contract, which is addressed separately
- Staff access may be suspended pending investigation without implying a finding of wrongdoing

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Revocation of system access for unauthorised use
- Disciplinary action under the individual's separate employment or engagement terms
- Referral to law enforcement where conduct may be unlawful

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_staff_agreement$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'staff_agreement');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'kyc_verification_policy', $legaldoc_kyc_verification_policy$
# KYC Verification Policy

*Jedida Marketplace Legal Center — Trust & Safety*
*Related documents: [Identity Verification Policy](/legal/identity_verification_policy), [AML (Anti-Money Laundering) Policy](/legal/aml_policy), [Fraud Prevention Policy](/legal/fraud_prevention_policy).*

## 1. Purpose

This Know-Your-Customer (KYC) Verification Policy sets out the identity and business verification standards a User must satisfy to access Seller, Delivery Partner, or elevated Platform privileges.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to verification required before activation of a Seller Shop, a Delivery Partner profile, or an equivalent elevated role, and addresses:

1. accepted forms of identification, including national identity cards, passports, and driving permits
2. business verification documents, including business registration certificates and company registration numbers
3. tax documentation, where required for a given role or jurisdiction
4. selfie or liveness verification to confirm the submitted identity document belongs to the applicant
5. verification of business ownership for Shops registered to a company rather than an individual

## 4. User Rights

- Be informed of the specific documents required for the role sought
- Receive a decision on a submitted verification within a reasonable review period
- Receive a stated reason where a submission is rejected
- Resubmit corrected documentation following a rejection

## 5. User Responsibilities

- Submit genuine, current, and unaltered identification and business documents
- Ensure a selfie or liveness submission clearly and visibly matches the submitted identification document
- Update KYC information promptly if it changes, including changes to business ownership or registration status
- Not submit another person's identity documents

## 6. Marketplace Responsibilities

- Review submissions through a combination of automated checks and manual review by KYC Officers
- Reject submissions that are illegible, incomplete, expired, or inconsistent
- Provide an appeals path for a rejected submission
- Store verification documents securely and use them solely for verification and legal compliance purposes, in accordance with the Data Protection Policy

## 7. Platform Limitations

- Approval of a KYC submission confirms document validity as reasonably assessable by the Platform's review process; it does not constitute a guarantee of the User's subsequent conduct
- The Company may require re-verification at any time, including where a document has expired or where risk indicators warrant it

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Rejection of a submission found to be falsified, altered, or belonging to another person
- Immediate suspension of the associated account pending investigation
- Permanent ban from re-registration and, where warranted, referral to law enforcement for identity fraud

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_kyc_verification_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'kyc_verification_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'identity_verification_policy', $legaldoc_identity_verification_policy$
# Identity Verification Policy

*Jedida Marketplace Legal Center — Trust & Safety*
*Related documents: [KYC Verification Policy](/legal/kyc_verification_policy), [Security Policy](/legal/security_policy), [Account Suspension Policy](/legal/account_suspension_policy).*

## 1. Purpose

This Identity Verification Policy sets out the standards and methods used to confirm that a User is who they claim to be, both at registration and at defined trust checkpoints thereafter.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to identity confirmation at:

1. initial account registration
2. escalation to a Seller, Delivery Partner, or administrative role
3. password reset and account-recovery requests
4. high-risk transactions flagged by the Platform's fraud-detection systems

## 4. User Rights

- Be informed of the identity verification method applicable to the action being taken
- Use an alternative verification method offered by the Platform where a primary method is unavailable to the User

## 5. User Responsibilities

- Provide accurate identity information and respond truthfully to verification prompts
- Keep recovery contact details, such as a verified email address and phone number, current

## 6. Marketplace Responsibilities

- Apply verification checkpoints proportionate to the risk of the action being taken
- Protect verification data in accordance with the Security Policy and Data Protection Policy
- Provide a support pathway for a User locked out following a failed verification attempt

## 7. Platform Limitations

- No identity verification method is infallible, and the Company does not guarantee that verification will detect every instance of impersonation
- Verification checkpoints may introduce delay to protect account security

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Temporary account lock following repeated failed verification attempts, as a security measure rather than a punitive one
- Investigation and, where warranted, suspension of an account confirmed to have been accessed through impersonation

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_identity_verification_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'identity_verification_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'aml_policy', $legaldoc_aml_policy$
# AML (Anti-Money Laundering) Policy

*Jedida Marketplace Legal Center — Trust & Safety*
*Related documents: [Fraud Prevention Policy](/legal/fraud_prevention_policy), [Payment Policy](/legal/payment_policy), [KYC Verification Policy](/legal/kyc_verification_policy).*

## 1. Purpose

This Anti-Money Laundering (AML) Policy sets out the Company's measures to detect, prevent, and report the use of the Platform for money laundering, terrorist financing, or sanctions evasion.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to all payment, escrow, and withdrawal activity on the Platform, and addresses:

1. customer due diligence performed through the KYC Verification Policy
2. monitoring of transaction patterns for indicators of layering, structuring, or unusual volume
3. screening against applicable sanctions and politically exposed persons lists, where required by Applicable Law
4. reporting of suspicious activity to competent authorities where legally required

## 4. User Rights

- Be informed, where legally permissible, that a transaction has been delayed pending compliance review
- Provide additional information requested to resolve a compliance hold

## 5. User Responsibilities

- Not use the Platform, including its Escrow Wallet or marketplace wallet, to launder proceeds of crime or finance unlawful activity
- Provide accurate source-of-funds information where requested in connection with a compliance review
- Cooperate with a compliance investigation

## 6. Marketplace Responsibilities

- Apply risk-based customer due diligence proportionate to transaction volume and User role
- Monitor for and escalate suspicious transaction patterns to designated compliance personnel
- File reports with competent financial intelligence or regulatory authorities where required by Applicable Law
- Freeze or delay a transaction where reasonably necessary to complete a compliance review

## 7. Platform Limitations

- The Company may be legally prohibited from disclosing the existence or details of a suspicious activity report to the User concerned ("tipping off")
- Compliance holds may delay settlement of otherwise legitimate transactions pending review

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Freezing of the implicated Escrow Wallet or marketplace wallet balance pending investigation
- Permanent account termination for confirmed money laundering, terrorist financing, or sanctions violations
- Mandatory reporting to competent authorities where required by Applicable Law

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_aml_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'aml_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'fraud_prevention_policy', $legaldoc_fraud_prevention_policy$
# Fraud Prevention Policy

*Jedida Marketplace Legal Center — Trust & Safety*
*Related documents: [AML (Anti-Money Laundering) Policy](/legal/aml_policy), [Chargeback Policy](/legal/chargeback_policy), [Account Suspension Policy](/legal/account_suspension_policy).*

## 1. Purpose

This Fraud Prevention Policy describes the measures the Company employs to detect and prevent fraudulent activity on the Platform, and the obligations of Users in preventing fraud.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to fraud risk across the Platform's transactional and account systems, including:

1. payment and manual-payment-proof fraud
2. fake order and fake review fraud
3. account takeover and credential-stuffing attacks
4. seller-side non-delivery fraud
5. delivery-side proof-of-delivery fraud
6. promotional and coupon abuse

## 4. User Rights

- Be notified of confirmed fraudulent activity affecting the User's account
- Dispute a fraud determination through the Appeals process

## 5. User Responsibilities

- Not engage in, assist, or knowingly benefit from fraudulent activity on the Platform
- Safeguard account credentials to reduce the risk of account takeover
- Report suspected fraud encountered on the Platform promptly

## 6. Marketplace Responsibilities

- Deploy automated fraud-detection systems, including AI-assisted risk scoring, alongside manual review by Payment Officers and Moderators
- Investigate reported and system-flagged fraud in a timely manner
- Reverse or withhold funds implicated in confirmed fraud, subject to the Escrow Policy and Wallet Policy

## 7. Platform Limitations

- Automated fraud detection may generate false positives, for which the Appeals process is available
- No fraud-detection system can guarantee prevention of all fraudulent activity

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Immediate suspension of an account implicated in confirmed fraud
- Forfeiture of funds derived from confirmed fraudulent activity, to the extent permitted by Applicable Law
- Referral to law enforcement for conduct that may constitute a criminal offence

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_fraud_prevention_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'fraud_prevention_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'security_policy', $legaldoc_security_policy$
# Security Policy

*Jedida Marketplace Legal Center — Trust & Safety*
*Related documents: [Cybersecurity Policy](/legal/cybersecurity_policy), [Data Protection Policy](/legal/data_protection_policy), [Privacy Policy](/legal/privacy_policy).*

## 1. Purpose

This Security Policy describes the technical and organisational measures the Company applies to protect the Platform and the data it processes.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to the security of Platform infrastructure, applications, and data, and addresses:

1. access controls for administrative and staff systems
2. encryption of data in transit and, where applicable, at rest
3. password and authentication requirements for User accounts
4. vulnerability management and security testing

## 4. User Rights

- Enable available account security features, such as strong password requirements and session management
- Be notified of a security incident that affects the User's personal data, in accordance with Applicable Law

## 5. User Responsibilities

- Use a strong, unique password for the User's account and refrain from sharing credentials
- Report suspected security vulnerabilities to the Company through a responsible disclosure channel rather than exploiting them
- Keep the User's own devices reasonably secure when accessing the Platform

## 6. Marketplace Responsibilities

- Apply role-based access control to limit administrative and staff access to what each role requires
- Encrypt sensitive data in transit and apply industry-standard safeguards to data at rest
- Monitor for and respond to security incidents, including unauthorised access attempts
- Conduct periodic review of security controls

## 7. Platform Limitations

- No system can be guaranteed completely secure, and the Company does not warrant that the Platform is immune to all forms of attack
- Security depends in part on Users maintaining the confidentiality of their own credentials

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Immediate revocation of access implicated in a security incident
- Investigation and remediation of a reported vulnerability
- Notification to affected Users and authorities as required by Applicable Law following a qualifying breach

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_security_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'security_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'cybersecurity_policy', $legaldoc_cybersecurity_policy$
# Cybersecurity Policy

*Jedida Marketplace Legal Center — Trust & Safety*
*Related documents: [Security Policy](/legal/security_policy), [API Usage Policy](/legal/api_usage_policy), [Fraud Prevention Policy](/legal/fraud_prevention_policy).*

## 1. Purpose

This Cybersecurity Policy sets out the Company's approach to identifying, preventing, and responding to cyber threats directed at the Platform, complementing the Security Policy.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to threats originating from outside the Platform's ordinary User base, including:

1. unauthorised intrusion attempts, including exploitation of application vulnerabilities
2. distributed denial-of-service and other availability attacks
3. phishing and social-engineering attacks impersonating the Platform
4. abuse of the Platform's application programming interfaces to extract data at scale

## 4. User Rights

- Report a suspected phishing attempt or impersonation of the Platform
- Be informed of confirmed communications impersonating the Platform, where practicable

## 5. User Responsibilities

- Verify that communications purporting to be from the Platform originate from official channels before acting on them
- Not attempt to probe, scan, or exploit Platform systems outside an authorised responsible-disclosure engagement
- Report credential compromise suspected to result from a phishing attempt

## 6. Marketplace Responsibilities

- Maintain monitoring and incident-response capability for cyber threats directed at the Platform
- Apply rate limiting and abuse detection to the Platform's application programming interfaces, as further described in the API Usage Policy
- Coordinate with hosting and infrastructure providers to mitigate large-scale attacks
- Take down confirmed phishing or impersonation infrastructure where within the Company's ability to do so

## 7. Platform Limitations

- The Company cannot control third-party infrastructure used by attackers to impersonate the Platform, such as look-alike domains hosted elsewhere
- Complete prevention of all cyber-attacks cannot be guaranteed

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Legal action against confirmed unauthorised intrusion attempts, to the extent permitted by Applicable Law
- Referral to law enforcement and relevant computer emergency response teams for significant incidents

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_cybersecurity_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'cybersecurity_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'data_protection_policy', $legaldoc_data_protection_policy$
# Data Protection Policy

*Jedida Marketplace Legal Center — Trust & Safety*
*Related documents: [Privacy Policy](/legal/privacy_policy), [Data Retention Policy](/legal/data_retention_policy), [Security Policy](/legal/security_policy).*

## 1. Purpose

This Data Protection Policy sets out the principles the Company applies when processing personal data, supplementing the Privacy Policy with the Company's internal governance commitments.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to all processing of personal data across the Platform's systems, and addresses:

1. the lawful bases relied upon for processing personal data
2. data minimisation and purpose limitation
3. cross-border transfer of personal data where the Platform's infrastructure is hosted outside a User's home jurisdiction
4. vendor and sub-processor due diligence

## 4. User Rights

- Exercise the data subject rights described in the Privacy Policy
- Request information about the safeguards applied to a cross-border transfer of the User's personal data

## 5. User Responsibilities

- Provide accurate personal data and update it as required
- Direct requests concerning personal data to the channels described in Section 12 (Contact Information) of the Privacy Policy

## 6. Marketplace Responsibilities

- Process personal data only for disclosed, legitimate purposes and no longer than necessary, subject to the Data Retention Policy
- Apply appropriate safeguards to any cross-border transfer of personal data
- Conduct due diligence on third-party processors that handle personal data on the Company's behalf
- Maintain records of processing activities sufficient to demonstrate compliance

## 7. Platform Limitations

- Certain processing is required to comply with Applicable Law, such as AML and tax obligations, and cannot be limited by User objection
- The Company's ability to guarantee a particular cross-border safeguard may depend on the receiving jurisdiction's legal framework

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Internal remediation of a process found to be non-compliant with this Policy
- Notification of affected Users and authorities following a qualifying personal data breach, in accordance with Applicable Law

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_data_protection_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'data_protection_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'data_retention_policy', $legaldoc_data_retention_policy$
# Data Retention Policy

*Jedida Marketplace Legal Center — Trust & Safety*
*Related documents: [Data Protection Policy](/legal/data_protection_policy), [Privacy Policy](/legal/privacy_policy), [AML (Anti-Money Laundering) Policy](/legal/aml_policy).*

## 1. Purpose

This Data Retention Policy sets out how long the Company retains different categories of data collected in connection with the Platform, and the basis for each retention period.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to data retained following account closure or the completion of a transaction, and addresses retention of:

1. account and profile data
2. transaction and payment records required for tax and audit purposes
3. KYC and identity verification documents required for AML compliance
4. chat and communication logs retained for dispute-resolution purposes
5. system and security logs

## 4. User Rights

- Request deletion of personal data that is not subject to a legal retention obligation
- Be informed of the retention period applicable to a specific category of the User's data upon request

## 5. User Responsibilities

- Understand that closing an account does not immediately erase data subject to a legal retention obligation

## 6. Marketplace Responsibilities

- Retain financial and tax-relevant records for the period required by Applicable tax law, typically not less than the statutory limitation period in the relevant jurisdiction
- Retain KYC and AML-relevant records for the period required by Applicable financial-crime law
- Retain dispute-relevant communications for a period sufficient to resolve disputes and defend legal claims
- Securely delete or anonymise data once no retention obligation or legitimate purpose remains

## 7. Platform Limitations

- Backup systems may retain deleted data for a limited residual period before permanent removal from backup media
- Data shared with a third-party processor is retained according to that processor's own retention schedule, subject to contractual limits imposed by the Company

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Not applicable in the User-enforcement sense; internal audit governs the Company's own compliance with stated retention periods

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_data_retention_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'data_retention_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'payment_policy', $legaldoc_payment_policy$
# Payment Policy

*Jedida Marketplace Legal Center — Payments & Finance*
*Related documents: [Escrow Policy](/legal/escrow_policy), [Wallet Policy](/legal/wallet_policy), [Commission Policy](/legal/commission_policy).*

## 1. Purpose

This Payment Policy sets out the payment methods supported on the Platform and the process by which payments are verified, settled, and, where applicable, rejected.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to all payment activity on the Platform, and addresses:

1. manual payment methods requiring Buyer-submitted proof of payment
2. mobile money payment methods
3. card payments, where enabled
4. bank transfers, where enabled
5. future integration of additional payment gateways
6. verification of submitted payment proof
7. settlement of funds to a Seller's available balance
8. commission deduction at settlement
9. handling of payment failures and pending payments
10. rejection of unverifiable payment submissions

## 4. User Rights

- Be informed of the payment methods available at checkout, including any applicable to the Buyer's location
- Receive confirmation once a payment has been verified
- Receive a stated reason where a payment submission is rejected

## 5. User Responsibilities

- Submit accurate and unaltered proof of payment for manual payment methods
- Complete payment within the timeframe required to hold an Order, after which the Order may be released
- Not submit fraudulent, duplicated, or manipulated payment evidence

## 6. Marketplace Responsibilities

- Hold verified Buyer payment in the Escrow Wallet pending delivery confirmation, as further described in the Escrow Policy
- Review manual payment submissions promptly through automated checks and Payment Officer review
- Settle verified funds to a Seller's available balance net of applicable commission, in accordance with the Commission Policy
- Notify both parties of payment verification outcomes

## 7. Platform Limitations

- The Company is not liable for delays caused by a third-party payment provider, mobile money operator, or bank
- A pending payment does not guarantee an Order will be fulfilled; verification may still result in rejection where evidence is insufficient

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Rejection of unverifiable or fraudulent payment submissions
- Suspension of checkout privileges for a Buyer found to submit fraudulent payment evidence
- Referral to law enforcement for confirmed payment fraud

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_payment_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'payment_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'escrow_policy', $legaldoc_escrow_policy$
# Escrow Policy

*Jedida Marketplace Legal Center — Payments & Finance*
*Related documents: [Payment Policy](/legal/payment_policy), [Wallet Policy](/legal/wallet_policy), [Refund Policy](/legal/refund_policy), [Dispute Resolution Policy](/legal/dispute_resolution_policy).*

## 1. Purpose

This Escrow Policy sets out how Buyer payment is held, protected, and released through the Platform's Escrow Wallet, and the Buyer protection this arrangement provides.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to every Order paid for through the Platform, and addresses:

1. the point at which a Buyer's payment enters escrow
2. conditions for release of escrowed funds to a Seller
3. conditions for return of escrowed funds to a Buyer
4. handling of escrowed funds during an active dispute

## 4. User Rights

- Have payment for an Order held in escrow rather than transferred directly to the Seller upon payment
- Request return of escrowed funds where an Order is not fulfilled as agreed
- Be informed of the status of escrowed funds relating to an active Order

## 5. User Responsibilities

- Confirm receipt of a satisfactory Order promptly so that escrowed funds may be released to the Seller
- Raise a dispute before, or promptly after, any automatic release trigger where the Order is unsatisfactory

## 6. Marketplace Responsibilities

- Hold Buyer payment in a pooled Escrow Wallet distinct from the Company's own operating funds
- Release escrowed funds to the Seller upon Buyer confirmation of delivery, or automatically after a defined confirmation window absent a dispute
- Return escrowed funds to the Buyer where a refund is approved under the Refund Policy
- Withhold release of escrowed funds for the duration of an active, good-faith dispute

## 7. Platform Limitations

- Escrow protects the payment for a given Order; it does not itself guarantee product quality beyond the protections stated in the Refund Policy
- The automatic release window is disclosed in the Order confirmation and, once elapsed without a dispute, results in release of funds to the Seller

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Freezing of escrowed funds implicated in a fraud investigation
- Reversal of an improper release obtained through fraudulent delivery confirmation, to the extent recoverable

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_escrow_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'escrow_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'wallet_policy', $legaldoc_wallet_policy$
# Wallet Policy

*Jedida Marketplace Legal Center — Payments & Finance*
*Related documents: [Escrow Policy](/legal/escrow_policy), [Payment Policy](/legal/payment_policy), [AML (Anti-Money Laundering) Policy](/legal/aml_policy).*

## 1. Purpose

This Wallet Policy sets out the terms applicable to the Platform's internal marketplace wallet, used for Seller available balances, Buyer store credit, and withdrawals.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to the marketplace wallet feature, and addresses:

1. crediting of a Seller's available balance following settlement
2. crediting of Buyer store credit from refunds, promotions, or cancellations
3. withdrawal of available balance to an external payment method
4. wallet transaction history and statements

## 4. User Rights

- View a real-time balance and transaction history for the User's wallet
- Withdraw available balance in accordance with the withdrawal process and any applicable processing time
- Dispute a wallet transaction believed to be incorrect

## 5. User Responsibilities

- Provide accurate external payment details for withdrawal
- Report a suspected unauthorised wallet transaction promptly

## 6. Marketplace Responsibilities

- Credit the wallet accurately and promptly following a qualifying transaction
- Process withdrawal requests within the disclosed processing timeframe, subject to identity verification
- Maintain a complete and accurate transaction history accessible to the wallet holder

## 7. Platform Limitations

- Wallet balances are not bank deposits and are not separately interest-bearing unless expressly stated
- Withdrawal processing times may be extended where additional verification is required under the AML Policy or Fraud Prevention Policy

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Freezing of a wallet balance implicated in a fraud or compliance investigation
- Reversal of a wallet credit found to have been obtained fraudulently

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_wallet_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'wallet_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'tax_policy', $legaldoc_tax_policy$
# Tax Policy

*Jedida Marketplace Legal Center — Payments & Finance*
*Related documents: [Payment Policy](/legal/payment_policy), [Seller Agreement](/legal/seller_agreement), [Commission Policy](/legal/commission_policy).*

## 1. Purpose

This Tax Policy sets out the respective tax responsibilities of the Company, Sellers, and Buyers in connection with transactions conducted on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to taxes potentially arising from Platform transactions, including:

1. sales, value-added, or consumption taxes applicable to a listed product or service
2. income tax on a Seller's or Delivery Partner's earnings from the Platform
3. customs duties and import taxes on international purchases
4. withholding obligations, where applicable under Applicable Law

## 4. User Rights

- Receive a transaction record sufficient to support the User's own tax filings
- Be informed where the Platform applies or collects a tax on the User's behalf

## 5. User Responsibilities

- Determine and remit any tax for which the User is personally responsible under Applicable Law, including income tax on Platform earnings
- Provide accurate tax identification information where required for a Seller's KYC verification
- Pay customs duties and import taxes applicable to an international purchase, unless otherwise stated at checkout

## 6. Marketplace Responsibilities

- Apply and disclose any tax the Platform is legally required to collect at the point of sale
- Provide transaction records to support Seller and Buyer tax compliance
- Report information to tax authorities where required by Applicable Law

## 7. Platform Limitations

- The Company does not provide individualised tax advice; Users should consult a qualified tax professional for guidance specific to their circumstances
- Tax treatment varies by jurisdiction and product category and may change with Applicable Law

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Not applicable in the direct User-enforcement sense; failure to meet a personal tax obligation is a matter between the User and the relevant tax authority, though the Company will cooperate with lawful information requests

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_tax_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'tax_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'promotional_campaign_policy', $legaldoc_promotional_campaign_policy$
# Promotional Campaign Policy

*Jedida Marketplace Legal Center — Marketing*
*Related documents: [Advertisement Policy](/legal/advertisement_policy), [Buyer Agreement](/legal/buyer_agreement).*

## 1. Purpose

This Promotional Campaign Policy sets out the rules governing coupons, discounts, and other promotional campaigns run on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to promotional mechanisms available to Sellers and the Company, including:

1. Seller-created coupons and discount codes
2. Platform-wide promotional campaigns
3. time-limited flash sales and featured placements
4. referral or loyalty incentives, where offered

## 4. User Rights

- Redeem an active, eligible coupon or promotion in accordance with its stated terms
- Be informed of a promotion's eligibility conditions and expiry before redemption

## 5. User Responsibilities

- Use a coupon or promotional code only for its intended purpose and only where the User meets its stated eligibility conditions
- Not create multiple accounts to claim a promotion intended for one-time use per User

## 6. Marketplace Responsibilities

- Disclose the terms, eligibility conditions, and expiry of a promotion clearly before redemption
- Apply promotions consistently to all qualifying Users
- Prevent, through automated controls, redemption beyond a promotion's stated limits

## 7. Platform Limitations

- Promotional credit has no cash value and cannot be exchanged for cash except where required by Applicable Law
- The Company may end a promotional campaign early where necessary to prevent abuse, subject to honouring redemptions already validly made

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Cancellation of a coupon or promotional credit obtained through ineligible or fraudulent redemption
- Suspension of promotional eligibility for a User found to abuse promotional mechanisms

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_promotional_campaign_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'promotional_campaign_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'advertisement_policy', $legaldoc_advertisement_policy$
# Advertisement Policy

*Jedida Marketplace Legal Center — Marketing*
*Related documents: [Promotional Campaign Policy](/legal/promotional_campaign_policy), [Product Listing Policy](/legal/product_listing_policy).*

## 1. Purpose

This Advertisement Policy sets out the standards applicable to paid advertisement placements purchased by Sellers on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to paid promotional placements within the Platform, and addresses:

1. eligibility for advertisement placement
2. content standards for advertised listings
3. review and approval of advertisement submissions
4. billing for advertisement placements

## 4. User Rights

- Purchase an available advertisement placement for an eligible, compliant listing
- Receive performance data for an active advertisement campaign, where such reporting is offered

## 5. User Responsibilities

- Ensure an advertised listing complies with the Product Listing Policy and Marketplace Rules
- Pay for advertisement placements through an accepted payment method
- Not use misleading claims in advertisement creative

## 6. Marketplace Responsibilities

- Review advertisement submissions before placement, including through automated moderation and Advertisement Manager review
- Disclose the pricing model and placement mechanics for advertisement inventory
- Remove an advertisement found to violate this Policy or applicable Marketplace Rules

## 7. Platform Limitations

- Advertisement placement does not guarantee a particular sales outcome
- The Company may decline an advertisement submission at its reasonable discretion, including where the underlying listing is under review

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of a non-compliant advertisement without refund of the associated fee where the violation lies with the advertised Content
- Suspension of advertising privileges for repeated policy violations

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_advertisement_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'advertisement_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'intellectual_property_policy', $legaldoc_intellectual_property_policy$
# Intellectual Property Policy

*Jedida Marketplace Legal Center — Intellectual Property*
*Related documents: [Trademark Policy](/legal/trademark_policy), [Copyright Policy](/legal/copyright_policy), [DMCA-style Copyright Complaint Procedure](/legal/dmca_copyright_complaint_procedure).*

## 1. Purpose

This Intellectual Property Policy sets out the Company's and Users' respective rights in intellectual property created, submitted, or displayed on the Platform.

## 2. Definitions

**Licence Grant.** By submitting Content to the Platform, a User grants the Company a worldwide, non-exclusive, royalty-free licence to host, display, reproduce, and distribute that Content solely for the purposes of operating, promoting, and improving the Platform.

Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to intellectual property rights arising in connection with the Platform, and addresses:

1. ownership of the Platform's own software, branding, and design
2. the licence a User grants the Company in Content the User submits
3. respect for third-party intellectual property rights in listings and Content
4. the process for reporting suspected infringement

## 4. User Rights

- Retain ownership of original Content the User submits to the Platform, subject to the licence granted to the Company below
- Report suspected infringement of the User's own intellectual property through the DMCA-style Copyright Complaint Procedure or, for trademarks, the Trademark Policy

## 5. User Responsibilities

- Submit only Content the User owns or is authorised to use
- Not upload, list, or otherwise use another party's intellectual property without authorisation

## 6. Marketplace Responsibilities

- Provide a reporting mechanism for suspected intellectual property infringement
- Remove Content found, following review, to infringe a third party's intellectual property rights
- Not claim ownership of User-submitted Content beyond the licence described below

## 7. Platform Limitations

- The Company grants no warranty that Platform features (including AI-assisted tools) will not incidentally produce output resembling existing third-party material; responsibility for verifying rights in submitted or generated Content rests with the submitting User
- A takedown in response to a complaint does not itself constitute a legal determination of infringement

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of infringing Content upon verification
- Suspension or termination of an account responsible for repeated confirmed infringement
- Referral to the DMCA-style Copyright Complaint Procedure for formal copyright disputes

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_intellectual_property_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'intellectual_property_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'trademark_policy', $legaldoc_trademark_policy$
# Trademark Policy

*Jedida Marketplace Legal Center — Intellectual Property*
*Related documents: [Prohibited Products Policy](/legal/prohibited_products_policy), [Intellectual Property Policy](/legal/intellectual_property_policy), [Copyright Policy](/legal/copyright_policy).*

## 1. Purpose

This Trademark Policy sets out how the Company protects its own trademarks and how it addresses reports of trademark infringement involving listings on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to use of trademarks on or in connection with the Platform, and addresses:

1. use of the Company's own marks, including the "Jedida Marketplace" name and logo
2. use of third-party brand names and logos in product listings
3. counterfeit goods bearing a trademark without authorisation
4. reporting of suspected trademark infringement

## 4. User Rights

- Use the Company's marks solely as permitted by these Terms or a separate written licence
- Report a listing suspected of infringing the reporting party's registered trademark

## 5. User Responsibilities

- Not use the Company's name, logo, or other marks to imply endorsement or affiliation without written authorisation
- List a branded product only where the Seller is an authorised reseller or otherwise entitled to use the brand in connection with the goods offered
- Provide, when reporting infringement, evidence of the reporting party's trademark rights

## 6. Marketplace Responsibilities

- Investigate trademark complaints supported by adequate evidence of rights ownership
- Remove listings confirmed to infringe a valid trademark, including counterfeit goods
- Maintain a record of trademark complaints and their resolution

## 7. Platform Limitations

- The Company does not pre-clear every listing against global trademark registries prior to publication
- A trademark complaint that lacks sufficient evidence of ownership may be declined pending further substantiation

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of the infringing listing
- Suspension of the Shop for confirmed repeated trademark infringement, particularly involving counterfeit goods
- Referral to the Prohibited Products Policy enforcement track for counterfeit goods

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_trademark_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'trademark_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'copyright_policy', $legaldoc_copyright_policy$
# Copyright Policy

*Jedida Marketplace Legal Center — Intellectual Property*
*Related documents: [DMCA-style Copyright Complaint Procedure](/legal/dmca_copyright_complaint_procedure), [Intellectual Property Policy](/legal/intellectual_property_policy).*

## 1. Purpose

This Copyright Policy sets out the Company's respect for copyright and the standards applicable to copyrighted Content on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to copyrighted material appearing in listings, reviews, chat, and other Content on the Platform, and addresses:

1. ownership of copyright in User-submitted Content
2. use of licensed or stock material in listings
3. the relationship between this Policy and the formal complaint procedure for takedown requests

## 4. User Rights

- Retain copyright in original Content submitted to the Platform, subject to the licence granted to the Company as described in the Intellectual Property Policy
- Submit a takedown request under the DMCA-style Copyright Complaint Procedure where the User's copyrighted work is used without authorisation

## 5. User Responsibilities

- Use only material the User owns, has licensed, or is otherwise authorised to use, including product photography and video
- Attribute or license stock material in accordance with the terms under which it was obtained

## 6. Marketplace Responsibilities

- Respond to substantiated copyright complaints through the formal complaint procedure
- Remove Content confirmed to infringe a valid copyright

## 7. Platform Limitations

- The Company is an intermediary hosting User-submitted Content and relies on the formal complaint procedure to identify and act on specific infringement claims
- Removal in response to a complaint does not constitute a judicial determination of infringement

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of infringing Content
- Suspension or termination of an account responsible for repeated confirmed copyright infringement (a "repeat infringer" policy)

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_copyright_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'copyright_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'dmca_copyright_complaint_procedure', $legaldoc_dmca_copyright_complaint_procedure$
# DMCA-style Copyright Complaint Procedure

*Jedida Marketplace Legal Center — Intellectual Property*
*Related documents: [Copyright Policy](/legal/copyright_policy), [Intellectual Property Policy](/legal/intellectual_property_policy).*

## 1. Purpose

This Copyright Complaint Procedure sets out the process by which a rights holder may request removal of Content from the Platform on the basis of copyright infringement, modelled on the notice-and-takedown approach of the U.S. Digital Millennium Copyright Act and comparable frameworks.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Procedure applies to formal copyright complaints submitted regarding Content hosted on the Platform, and addresses:

1. the required contents of a valid takedown notice
2. the Company's response upon receipt of a valid notice
3. the process for a User to submit a counter-notice disputing a takedown
4. restoration of Content following a valid counter-notice absent further legal action

## 4. User Rights

- Submit a takedown notice identifying the copyrighted work, the infringing Content's location, and a good-faith statement of unauthorised use
- Submit a counter-notice where the User believes Content was removed in error or misidentification
- Receive notice of a takedown or counter-notice affecting the User's Content

## 5. User Responsibilities

- Submit a takedown notice only in a good-faith belief that use of the material is unauthorised
- Submit a counter-notice only in a good-faith belief that the Content was removed or disabled as a result of mistake or misidentification
- Provide accurate contact information and, where required, consent to the jurisdiction described in Section 13 (Governing Law)

## 6. Marketplace Responsibilities

- Designate a contact point for receipt of copyright complaints, as set out in Section 12 (Contact Information)
- Expeditiously remove or disable access to Content identified in a facially valid notice
- Notify the affected User and provide an opportunity to submit a counter-notice
- Restore Content following a valid counter-notice unless the original complainant initiates further action within the timeframe this Procedure allows

## 7. Platform Limitations

- The Company does not adjudicate the underlying merits of a copyright dispute; its role is limited to processing notices and counter-notices in accordance with this Procedure
- A knowingly false notice or counter-notice may expose the submitting party to liability under Applicable Law

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal of Content identified in a valid, unrebutted notice
- Termination of a repeat infringer's account in accordance with the Copyright Policy

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_dmca_copyright_complaint_procedure$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'dmca_copyright_complaint_procedure');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'ai_usage_policy', $legaldoc_ai_usage_policy$
# AI Usage Policy

*Jedida Marketplace Legal Center — Technology*
*Related documents: [AI Generated Content Policy](/legal/ai_generated_content_policy), [Fraud Prevention Policy](/legal/fraud_prevention_policy).*

## 1. Purpose

This AI Usage Policy explains how the Platform's artificial intelligence systems — Tausi AI and Petiti AI — operate, the functions they perform, and the limits placed on automated decision-making.

## 2. Definitions

**Tausi AI.** The Platform's AI system responsible for personalised recommendations, fraud detection support, and marketplace analytics.
**Petiti AI.** The Platform's AI system responsible for content moderation support, listing assistance, and administrative automation, including publication of certain informational pages.

Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to the Platform's AI-driven features, and addresses:

1. Tausi AI's role in personalised product recommendations and marketplace analytics
2. Petiti AI's role in content moderation, listing assistance, and platform administration support
3. fraud detection and risk scoring performed by automated systems
4. AI-assisted customer support and advertisement optimisation
5. the availability of human review for AI-influenced decisions

## 4. User Rights

- Understand, at a general level, when a recommendation, moderation decision, or risk flag has been influenced by an AI system
- Request human review of a significant automated decision, such as an account suspension driven substantially by an AI risk score
- Opt out of personalised recommendations where the Platform provides a setting to do so

## 5. User Responsibilities

- Not attempt to manipulate or deceive the Platform's AI systems, including through coordinated fake activity intended to distort recommendations or risk scores
- Use AI-assisted tools, such as listing or chat translation assistance, as a drafting aid rather than a substitute for the User's own accuracy obligations

## 6. Marketplace Responsibilities

- Apply human oversight to AI systems through the AI Supervisor administrative role, including override authority for erroneous automated decisions
- Monitor AI systems for bias and accuracy, and correct identified issues on an ongoing basis
- Disclose the general categories of decisions influenced by AI systems in this Policy and, where applicable, at the point of the relevant feature

## 7. Platform Limitations

- AI-generated recommendations, risk scores, and moderation decisions are probabilistic and may be inaccurate in individual cases; the Appeals process addresses such cases
- AI systems are trained and tuned on an ongoing basis and their behaviour may change over time as they are improved

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Suspension of a User's access to an AI-assisted feature found to be abused
- Reversal of an automated decision found, on human review, to have been made in error

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_ai_usage_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'ai_usage_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'ai_generated_content_policy', $legaldoc_ai_generated_content_policy$
# AI Generated Content Policy

*Jedida Marketplace Legal Center — Technology*
*Related documents: [AI Usage Policy](/legal/ai_usage_policy), [Product Listing Policy](/legal/product_listing_policy), [Copyright Policy](/legal/copyright_policy).*

## 1. Purpose

This AI Generated Content Policy sets out the standards applicable to Content that is generated, or substantially assisted, by an AI system on the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to Content produced with AI assistance, including:

1. product listing descriptions drafted with the assistance of Colline, the Platform's listing assistant
2. informational pages published by Petiti AI in its administrative capacity
3. AI-assisted translation of chat messages
4. AI-assisted customer support responses

## 4. User Rights

- Know that a page or message has been produced or substantially assisted by an AI system, where the Platform discloses this (for example, pages published by Petiti AI are labelled as such)
- Request human review of AI-generated Content that a User believes to be inaccurate or inappropriate

## 5. User Responsibilities

- Review and verify AI-assisted listing content before publication; the submitting Seller remains responsible for its accuracy
- Not rely on AI-generated translations as a substitute for professional translation in contexts requiring legal or contractual precision

## 6. Marketplace Responsibilities

- Label Content published autonomously by an AI system where practicable, as is done for Petiti-authored pages
- Apply moderation review to AI-generated Content prior to or shortly after publication
- Correct or remove AI-generated Content found to be inaccurate or non-compliant

## 7. Platform Limitations

- AI-generated Content may contain inaccuracies, and the Company does not warrant its complete accuracy
- Machine translation may not perfectly preserve meaning, tone, or legal nuance

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Removal or correction of inaccurate or non-compliant AI-generated Content
- Restriction of AI-assisted feature access for a User found to misuse it to generate deceptive Content

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_ai_generated_content_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'ai_generated_content_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'api_usage_policy', $legaldoc_api_usage_policy$
# API Usage Policy

*Jedida Marketplace Legal Center — Technology*
*Related documents: [Third-party Integration Policy](/legal/third_party_integration_policy), [Cybersecurity Policy](/legal/cybersecurity_policy), [Marketplace Rules](/legal/marketplace_rules).*

## 1. Purpose

This API Usage Policy sets out the terms under which a User or third party may access the Platform's application programming interfaces.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to any programmatic access to the Platform, and addresses:

1. issuance and use of API credentials
2. rate limits and fair-use thresholds
3. permitted and prohibited uses of API access
4. data obtained through the API

## 4. User Rights

- Access the API functions made available to the User's role, subject to applicable rate limits
- Receive reasonable notice of a material change to an API that a User's integration depends on, where practicable

## 5. User Responsibilities

- Keep API credentials confidential and not share them with unauthorised parties
- Use the API only for its documented purpose and not to circumvent Platform features, rate limits, or fees
- Comply with rate limits and avoid activity that degrades Platform performance for other Users
- Handle data obtained through the API in accordance with the Privacy Policy and Data Protection Policy

## 6. Marketplace Responsibilities

- Document available API endpoints and their intended use
- Apply rate limiting and monitoring to detect abuse
- Suspend API credentials associated with abusive or unauthorised activity

## 7. Platform Limitations

- API access may be modified, rate-limited, or discontinued where necessary for security, stability, or business reasons
- The Company does not warrant uninterrupted API availability

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Revocation of API credentials for violation of this Policy
- Suspension of the associated account for large-scale scraping, denial-of-service activity, or unauthorised data extraction

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_api_usage_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'api_usage_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'third_party_integration_policy', $legaldoc_third_party_integration_policy$
# Third-party Integration Policy

*Jedida Marketplace Legal Center — Technology*
*Related documents: [API Usage Policy](/legal/api_usage_policy), [Privacy Policy](/legal/privacy_policy), [Security Policy](/legal/security_policy).*

## 1. Purpose

This Third-party Integration Policy sets out the standards applicable to third-party services, plugins, or applications that connect with the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to integrations between the Platform and external services, including:

1. payment gateway integrations
2. shipping and logistics integrations
3. analytics and advertising partner integrations
4. any future application-marketplace or plugin ecosystem

## 4. User Rights

- Be informed of which third-party integrations process the User's data and for what purpose, as disclosed in the Privacy Policy
- Decline optional third-party integrations where the Platform offers a choice to do so

## 5. User Responsibilities

- Review the terms of a third-party integration the User elects to enable, where the User has a choice in the matter
- Not use a third-party integration to circumvent Platform fees or policies

## 6. Marketplace Responsibilities

- Conduct due diligence on a third-party integration before enabling it on the Platform
- Disclose the categories of data shared with an integrated third party
- Discontinue an integration found to compromise User security or data protection

## 7. Platform Limitations

- The Company is not responsible for the independent acts or omissions of a third-party service provider once data has been transferred in accordance with disclosed terms
- Availability of a specific third-party integration is not guaranteed on an ongoing basis

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Suspension of an integration found to violate this Policy or applicable data protection requirements
- Removal of a third-party partner that fails a security or compliance review

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_third_party_integration_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'third_party_integration_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'account_suspension_policy', $legaldoc_account_suspension_policy$
# Account Suspension Policy

*Jedida Marketplace Legal Center — Account & Disputes*
*Related documents: [Account Termination Policy](/legal/account_termination_policy), [User Appeals Policy](/legal/user_appeals_policy), [Fraud Prevention Policy](/legal/fraud_prevention_policy).*

## 1. Purpose

This Account Suspension Policy sets out the circumstances under which the Company may temporarily suspend a User's account and the process for review and reinstatement.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to temporary suspension of account access, and addresses:

1. grounds for suspension, including suspected policy violation, fraud risk, or an unresolved compliance requirement
2. the notice provided to a suspended User
3. the process for requesting reinstatement
4. the effect of suspension on pending Orders and escrowed funds

## 4. User Rights

- Receive notice of a suspension and, where the circumstances permit disclosure, the general reason for it
- Request review of a suspension through the User Appeals Policy
- Have pending Orders and escrowed funds handled fairly during a suspension, consistent with the Escrow Policy

## 5. User Responsibilities

- Respond to a request for information issued in connection with a suspension review
- Refrain from creating a new account to circumvent a suspension

## 6. Marketplace Responsibilities

- Suspend an account only on a reasonable basis connected to a suspected policy violation, fraud risk, or compliance requirement
- Provide a path to review and, where warranted, reinstatement
- Complete a suspension review within a reasonable period

## 7. Platform Limitations

- Where risk of harm or fraud is significant, the Company may suspend an account before completing a full investigation, followed promptly by review
- Suspension pending an active law-enforcement or regulatory inquiry may be extended beyond the Company's ordinary review timeframe

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Escalation from suspension to termination where an investigation confirms a serious or repeated violation
- Reinstatement, including release of any withheld funds, where an investigation does not confirm the suspected violation

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_account_suspension_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'account_suspension_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'account_termination_policy', $legaldoc_account_termination_policy$
# Account Termination Policy

*Jedida Marketplace Legal Center — Account & Disputes*
*Related documents: [Account Suspension Policy](/legal/account_suspension_policy), [User Appeals Policy](/legal/user_appeals_policy).*

## 1. Purpose

This Account Termination Policy sets out the circumstances under which the Company may permanently terminate a User's account, and the process for a User to voluntarily close an account.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to permanent termination of account access, and addresses:

1. Company-initiated termination for confirmed serious or repeated policy violations
2. voluntary account closure initiated by a User
3. the effect of termination on open Orders, listings, and escrowed or wallet funds
4. re-registration following termination

## 4. User Rights

- Close the User's own account voluntarily, subject to resolution of open Orders, disputes, and outstanding balances
- Receive the stated grounds for a Company-initiated termination
- Appeal a Company-initiated termination through the User Appeals Policy

## 5. User Responsibilities

- Resolve or transfer responsibility for open Orders before requesting voluntary closure
- Not attempt to re-register following a termination imposed for fraud, illegal activity, or serious harm to another User

## 6. Marketplace Responsibilities

- Terminate an account only following a suspension review confirming a serious or repeated violation, or in response to a legal requirement
- Settle any undisputed available balance owed to the User upon termination, subject to applicable holds under the AML Policy or an active dispute
- Retain records related to the terminated account in accordance with the Data Retention Policy

## 7. Platform Limitations

- Termination for cause does not entitle the User to a refund of fees or commission already properly earned by the Company prior to termination
- The Company may decline re-registration by a previously terminated User where the original grounds for termination remain relevant

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Not applicable beyond the termination itself; termination is the enforcement outcome under this Policy for confirmed serious or repeated violations of other Platform policies

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_account_termination_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'account_termination_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'user_appeals_policy', $legaldoc_user_appeals_policy$
# User Appeals Policy

*Jedida Marketplace Legal Center — Account & Disputes*
*Related documents: [Account Suspension Policy](/legal/account_suspension_policy), [Account Termination Policy](/legal/account_termination_policy), [Dispute Resolution Policy](/legal/dispute_resolution_policy).*

## 1. Purpose

This User Appeals Policy sets out the process by which a User may request review of an enforcement decision, including a suspension, termination, listing removal, or automated determination.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to appeals of Company-initiated enforcement decisions, and addresses:

1. how to submit an appeal
2. the information an appeal should include
3. the review process and typical response timeframe
4. the outcome options available on review

## 4. User Rights

- Submit an appeal of an enforcement decision within a reasonable period of being notified of it
- Receive a substantive response to a good-faith appeal
- Have an appeal reviewed by a Staff Member or Administrator who was not the sole decision-maker in the original action, where reasonably practicable

## 5. User Responsibilities

- Submit an appeal in good faith with relevant supporting information
- Refrain from submitting repetitive appeals of the same decision absent new material information

## 6. Marketplace Responsibilities

- Provide an accessible channel for submitting an appeal, as set out in Section 12 (Contact Information)
- Review appeals fairly and within a reasonable timeframe
- Communicate the outcome of an appeal and the reasoning behind it

## 7. Platform Limitations

- An appeal does not automatically suspend enforcement of the original decision pending review, except where the Company determines suspension of enforcement is appropriate
- Some decisions, particularly those made to comply with a legal obligation, may not be reversible through this process

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Not applicable in the same sense as User-facing enforcement policies; this Policy instead governs the Company's own review obligations

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_user_appeals_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'user_appeals_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'dispute_resolution_policy', $legaldoc_dispute_resolution_policy$
# Dispute Resolution Policy

*Jedida Marketplace Legal Center — Account & Disputes*
*Related documents: [Arbitration Policy](/legal/arbitration_policy), [User Appeals Policy](/legal/user_appeals_policy), [Escrow Policy](/legal/escrow_policy).*

## 1. Purpose

This Dispute Resolution Policy sets out the process for resolving disputes between Users, and between a User and the Company, arising from use of the Platform.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to disputes arising from Platform transactions and account decisions, including:

1. buyer-seller disputes over an Order
2. buyer-delivery disputes over a delivery
3. disputes over a Company enforcement decision, following the User Appeals Policy
4. disputes between a User and the Company regarding these Terms or a subordinate policy

## 4. User Rights

- Raise a dispute through the Platform's dispute tools before escalating outside the Platform
- Receive a decision supported by the evidence submitted by both parties
- Escalate an unresolved dispute with the Company to arbitration or, where arbitration does not apply, to a competent court, as described in the Arbitration Policy

## 5. User Responsibilities

- Attempt resolution through the Platform's own dispute process before pursuing an external remedy, except where Applicable Law prevents this requirement from applying
- Submit truthful, relevant evidence in support of a dispute
- Comply with a dispute decision, including any resulting fund release or reversal

## 6. Marketplace Responsibilities

- Provide an accessible internal dispute-resolution process for Order and delivery disputes
- Review disputes impartially based on the evidence submitted by both parties, including chat records, GPS and delivery data, and payment evidence
- Implement the outcome of a dispute decision, including release or return of escrowed funds

## 7. Platform Limitations

- The Company's internal dispute process is not a substitute for a court or arbitral tribunal and does not bind either party's external legal rights beyond what is stated in the Arbitration Policy
- Disputes involving allegations of criminal conduct are referred to law enforcement rather than resolved solely through this internal process

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Enforcement action against a party found, through the dispute process, to have acted in bad faith or breached these Terms

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_dispute_resolution_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'dispute_resolution_policy');

INSERT INTO legal_documents (doc_type, content_md, version, is_current)
SELECT 'arbitration_policy', $legaldoc_arbitration_policy$
# Arbitration Policy

*Jedida Marketplace Legal Center — Account & Disputes*
*Related documents: [Dispute Resolution Policy](/legal/dispute_resolution_policy), [Terms of Service](/legal/terms_of_service).*

## 1. Purpose

This Arbitration Policy sets out how a dispute between a User and the Company that is not resolved through the Dispute Resolution Policy may be referred to binding arbitration.

## 2. Definitions


Unless the context otherwise requires, the following terms used throughout this document and across the Jedida Marketplace Legal Center carry the meanings below:

- **Platform / Marketplace** — "Jedida Marketplace" refers to the online marketplace, mobile applications, application programming interfaces, and all associated websites and services operated by the Company.
- **Company / Operator / "We"** — "Ancient of Days Technologies", the owner and operator of Jedida Marketplace, a technology company that provides the infrastructure through which independent Sellers, Buyers, and Delivery Partners transact.
- **User** — Any natural or legal person who accesses or uses the Platform in any capacity, including as a Buyer, Seller, Delivery Partner, Administrator, Staff Member, or visitor.
- **Buyer** — A registered User who purchases, or seeks to purchase, products or services listed on the Platform.
- **Seller** — A registered User who has been approved to list and sell products or services through a Shop on the Platform.
- **Delivery Partner** — A registered User who has been approved to provide product collection, transportation, and delivery services on the Platform.
- **Shop** — A Seller's storefront within the Platform, comprising its listings, branding, and transaction history.
- **Content** — Any text, image, video, audio, data, or other material submitted to, generated on, or displayed through the Platform.
- **Escrow Wallet** — The pooled custodial account maintained by the Company into which Buyer payments are held pending confirmation of delivery, as further described in the Escrow Policy.
- **Order** — A confirmed transaction between a Buyer and a Seller for the purchase of one or more products or services listed on the Platform.
- **Applicable Law** — Any statute, regulation, treaty, or binding legal instrument of competent jurisdiction that applies to the operation of the Platform or the conduct of a User.

## 3. Scope

This Policy applies to unresolved disputes between a User and the Company arising from these Terms or a subordinate policy, and addresses:

1. the circumstances in which arbitration applies, as distinct from disputes between two Users
2. the process for initiating arbitration
3. the seat, language, and rules applicable to arbitration where invoked
4. the relationship between arbitration and a User's right to pursue a claim in a small-claims or equivalent court where Applicable Law preserves that right

## 4. User Rights

- Pursue a qualifying claim in a small-claims or equivalent court instead of arbitration where Applicable Law preserves that option
- Be represented by counsel of the User's choosing in an arbitration proceeding, at the User's own cost unless the arbitral rules or Applicable Law provide otherwise
- Receive a reasoned, binding decision from the arbitrator

## 5. User Responsibilities

- Attempt resolution through the Dispute Resolution Policy before initiating arbitration
- Comply with the applicable arbitral rules and any procedural timelines they impose

## 6. Marketplace Responsibilities

- Participate in good faith in an arbitration properly initiated under this Policy
- Bear arbitration costs in accordance with the applicable arbitral rules and, where required by Applicable Law, in a manner that does not make arbitration cost-prohibitive for the User

## 7. Platform Limitations

- This Policy does not apply to disputes between two Users, which are addressed under the Dispute Resolution Policy, nor does it limit a User's non-waivable statutory rights under Applicable Law
- Arbitration under this Policy is conducted on an individual basis; class or representative arbitration is not available except where Applicable Law requires otherwise

## 8. Legal Obligations

The Company will operate this policy in a manner consistent with Applicable Law, including consumer protection, electronic commerce, and data protection legislation of general application in the jurisdictions in which the Jedida Marketplace operates. Nothing in this document limits a right that Applicable Law makes non-waivable.

## 9. Enforcement

The Company enforces this document through a combination of automated monitoring (including Tausi AI and Petiti AI where applicable), review by the relevant Administrator or Staff role described in the Administrator Agreement, and User reporting. Enforcement action is applied proportionately to the nature and severity of the conduct concerned, and is documented in the Platform's internal audit records.

## 10. Violations

- Not applicable; this Policy is a dispute-resolution mechanism rather than a conduct standard

## 11. Appeals

A User who disagrees with a decision made under this document may request review in accordance with the [User Appeals Policy](/legal/user_appeals_policy). Submitting an appeal does not, by itself, suspend the decision under review unless the Company determines that suspension is appropriate pending the outcome.

## 12. Contact Information

**Ancient of Days Technologies**, operating as **Jedida Marketplace**

- Registered Address: [To be Updated]
- Company Registration Number: [To be Updated]
- Tax Identification Number: [To be Updated]
- General Support: support@jedidamarketplace.com
- Legal & Compliance: legal@jedidamarketplace.com
- Data Protection Officer: dpo@jedidamarketplace.com
- Copyright Complaints (see the DMCA-style Copyright Complaint Procedure): copyright@jedidamarketplace.com

*Contact details marked [To be Updated] must be completed with Ancient of Days Technologies's actual registration and address information before publication; they are placeholders and not verified business information.*

## 13. Governing Law

This document is governed by, and construed in accordance with, the laws of the Republic of Uganda, without regard to its conflict-of-law principles, save to the extent that the mandatory consumer-protection or data-protection law of a User's own jurisdiction applies notwithstanding this choice of law. *[The Company's governing-law jurisdiction is stated here based on the Platform's principal place of operation and should be confirmed by Ancient of Days Technologies and its legal counsel before publication — To be Updated if incorrect.]*

## 14. Effective Date

This document takes effect on **1 August 2026** and applies to all use of the Jedida Marketplace on or after that date.

## 15. Version Number

Version **1.0**. Every subsequent amendment is published as a new version with its own effective date; prior versions remain available on request for reference purposes.

## 16. Acceptance Clause

By creating an account, accessing, or otherwise using the Jedida Marketplace, the User acknowledges having read and understood this document and agrees to be bound by it. Continued use of the Jedida Marketplace following publication of an amended version constitutes acceptance of the amendment.

$legaldoc_arbitration_policy$, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'arbitration_policy');
