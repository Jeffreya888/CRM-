// Privacy policy and terms of service text. Bracketed fields such as
// [Legal company name] are filled in by the owner; {email} is replaced with SUPPORT_EMAIL.
import type { LegalSection } from './LegalDoc';

export const PRIVACY_INTRO = [
  'This Privacy Policy explains how [Legal company name] ("Flight Ready", "we", "us" or "our") collects, uses, shares and protects personal information when you visit our website, use the Flight Ready mobile and web applications, or otherwise interact with us (together, the "Service").',
  'Flight Ready is business software for detailing companies that service aircraft, vehicles and watercraft. If you are a customer of a detailing company that uses Flight Ready, that company decides what information it keeps about you; see "Customer data controlled by detailing companies" below.',
];

export const PRIVACY: LegalSection[] = [
  {
    title: 'Who we are',
    body: [
      'The Service is operated by [Legal company name], [Business address]. You can reach us at {email}.',
      'For information you provide to us directly as a subscriber (for example, your account and billing details), we act as the business responsible for that information. For records that a detailing company stores in the Service about its own customers, crew and assets, we act as a service provider (processor) on that company’s behalf.',
    ],
  },
  {
    title: 'Information we collect',
    body: [
      'We collect the following categories of information:',
      [
        'Account information: your name, email address, phone number (optional), password (stored only as a secure hash), profile photo, and security settings such as two-step sign-in status and the devices you have signed in from.',
        'Company information: your company name, address, logo, time zone, business types, services, prices, tax settings, branches and team membership, roles and permissions.',
        'Customer and asset records: information your company enters about its customers and contacts (names, emails, phone numbers, addresses, notes, consent to texts), and about the aircraft, vehicles and watercraft it services (such as tail numbers, makes, models, sizes, locations and access notes).',
        'Work records and photos: jobs, schedules, checklists, condition reports, signatures, before/after and damage photos, quotes, invoices, payments, expenses, receipts, supplies, equipment, timesheets and pay information entered by your company.',
        'Payment information: when a detailing company accepts card payments, payments are processed by Stripe. Card numbers are entered directly with Stripe and are never stored on our servers. We receive payment status, amounts, fees and limited card details (such as brand and last four digits) from Stripe.',
        'Subscription information: subscriptions are purchased on our website (billed by Stripe) or through the Apple App Store or Google Play (managed through RevenueCat). We receive your subscription status, plan, renewal dates and transaction identifiers, but not your full payment card details.',
        'Messages: the content, recipients and delivery status of emails and text messages sent through the Service (for example, invoices, reminders and replies from customers), and messages you send to our support team.',
        'Device information: push notification tokens, device type and operating system version, app version, IP address and sign-in timestamps, used to deliver notifications and to keep accounts secure.',
      ],
      'Analytics and advertising: we do not use third-party analytics, advertising or tracking SDKs in the Service, and we do not track you across other companies’ apps or websites.',
    ],
  },
  {
    title: 'How we use information',
    body: [
      'We use personal information to:',
      [
        'Provide, operate and maintain the Service, including scheduling, documentation, quoting, invoicing, payments, messaging and reporting features.',
        'Create and secure accounts, verify email addresses, support two-step sign-in, detect suspicious activity and send security alerts.',
        'Process subscriptions and the platform fee on payments processed through the Service.',
        'Send the emails, texts and push notifications that you or your company configure, and service messages about your account.',
        'Respond to support requests and communicate with you about the Service, including changes to these terms or policies.',
        'Maintain, debug and improve the reliability, performance and safety of the Service.',
        'Comply with legal obligations, enforce our Terms of Service and protect the rights, property and safety of our users and the public.',
      ],
      'We do not sell personal information, and we do not share personal information for cross-context behavioral advertising.',
    ],
  },
  {
    title: 'How we share information',
    body: [
      'We share personal information only as described below:',
      [
        'Within your company: information in a company workspace is visible to that company’s team members according to the roles and permissions the company sets.',
        'With customers of a detailing company: when a company sends a quote, invoice, report or portal link, the recipient can see the information that company chose to include.',
        'With service providers that help us run the Service, under contracts that limit their use of the information: Supabase (database, authentication, file storage and hosting), Stripe (payment processing and Stripe Connect payouts), RevenueCat, Apple and Google (in-app subscriptions), Resend (email delivery), Telnyx (text message delivery), Expo (push notification delivery) and Anthropic (AI reading of receipt photos and photo condition reports — only the photos you or your customers choose to check are sent).',
        'With integrations your company chooses to connect, such as scheduling software, according to that company’s instructions.',
        'For legal reasons: if required by law, subpoena or other legal process, or when we believe in good faith that disclosure is necessary to protect rights, property or safety, or to investigate fraud or security issues.',
        'In a business transfer: in connection with a merger, acquisition, financing or sale of assets, subject to this Privacy Policy.',
      ],
    ],
  },
  {
    title: 'Customer data controlled by detailing companies',
    body: [
      'Each detailing company that uses Flight Ready controls the records it stores about its own customers, contacts, crew and assets ("Customer Data"). We process Customer Data only to provide the Service to that company and as it instructs, and we keep each company’s data separated from every other company’s data.',
      'If you are a customer of a detailing company and want to access, correct or delete information about you, please contact that company directly. If you contact us, we will forward your request to the company and assist it as required by law.',
    ],
  },
  {
    title: 'Text messages and SMS consent',
    body: [
      'Detailing companies can send text messages to their customers through the Service (for example, appointment reminders, on-our-way notices, invoices and replies). Companies may text only customers who have agreed to receive texts from them. Message frequency varies. Message and data rates may apply.',
      'Reply STOP to any message to opt out of further texts from that company, or HELP for help. Opt-outs are honored automatically. Mobile numbers and SMS consent are never sold or shared with third parties for their marketing purposes.',
    ],
  },
  {
    title: 'Data retention',
    body: [
      'We keep personal information for as long as the account or company workspace is active, and afterwards as needed to provide the Service, comply with legal, tax and accounting obligations, resolve disputes and enforce our agreements.',
      'When a company workspace or account is deleted, we delete or anonymize the associated data within a reasonable period, except where we must keep it for legal reasons. Residual copies in encrypted backups are overwritten on our normal backup cycle.',
    ],
  },
  {
    title: 'Account deletion and data export',
    body: [
      'You can delete your account at any time from Account in the app. If you are the only owner of a company, deleting your account also deletes that company’s workspace and its records. Deleting your account does not cancel an App Store or Google Play subscription; manage or cancel it in your store account settings. Cancel a web subscription in Settings → Manage billing before deleting your account.',
      'Company owners can export their company’s data (spreadsheets of records and job photos) at any time from Settings. We recommend exporting before deleting an account.',
    ],
  },
  {
    title: 'Security',
    body: [
      'We use administrative, technical and physical safeguards designed to protect personal information, including encryption in transit, database-level separation between companies, role-based permissions, optional and enforceable two-step sign-in, new-device alerts and access controls on our systems.',
      'No method of transmission or storage is completely secure. Please use a strong, unique password, enable two-step sign-in and never share your password or verification codes — we will never ask for them.',
    ],
  },
  {
    title: 'Your privacy rights',
    body: [
      'Depending on where you live, you may have the right to:',
      [
        'Know what personal information we collect, use and disclose, and request access to or a copy of it.',
        'Correct inaccurate personal information.',
        'Delete personal information, subject to legal exceptions.',
        'Receive your information in a portable format.',
        'Object to or restrict certain processing, and withdraw consent where processing is based on consent.',
        'Not be discriminated against for exercising these rights.',
      ],
      'California residents: we do not sell or share personal information as those terms are defined under the California Consumer Privacy Act (CCPA), and we do not use sensitive personal information for purposes that require a right to limit. Residents of the European Economic Area, the United Kingdom and Switzerland may also lodge a complaint with their local data protection authority. Where the GDPR applies, we process information to perform our contract with you, for our legitimate interests in operating and securing the Service, to comply with legal obligations, and with your consent where required.',
      'To exercise a right, email {email}. We will verify your request using information associated with your account and respond within the time required by law. You may use an authorized agent where permitted by law. If your request concerns Customer Data held by a detailing company, we will refer you to that company.',
    ],
  },
  {
    title: 'International data transfers',
    body: [
      'We are based in the United States and our service providers may process information in the United States and other countries. Where required, we rely on appropriate safeguards, such as standard contractual clauses, for transfers of personal information from the EEA, UK or Switzerland.',
    ],
  },
  {
    title: 'Children',
    body: [
      'The Service is intended for businesses and is not directed to children under 16. We do not knowingly collect personal information from children under 16. If you believe a child has provided us personal information, contact {email} and we will delete it.',
    ],
  },
  {
    title: 'Changes to this policy',
    body: [
      'We may update this Privacy Policy from time to time. We will post the updated version with a new "Last updated" date and, for material changes, notify account owners by email or in the app before the changes take effect.',
    ],
  },
  {
    title: 'Contact us',
    body: [
      'Questions or requests about this Privacy Policy can be sent to {email} or by mail to [Legal company name], [Business address].',
    ],
  },
];

export const TERMS_INTRO = [
  'These Terms of Service ("Terms") are a legal agreement between you and [Legal company name] ("Flight Ready", "we", "us" or "our") and govern your use of the Flight Ready website, mobile and web applications and related services (the "Service"). By creating an account or using the Service you agree to these Terms and to our Privacy Policy. If you use the Service on behalf of a company, you agree to these Terms on its behalf and confirm that you have authority to do so.',
];

export const TERMS: LegalSection[] = [
  {
    title: 'The Service',
    body: [
      'Flight Ready is business management software for detailing companies that care for aircraft, vehicles and watercraft. It includes tools for scheduling, job documentation, quotes, invoices, payments, customer communication, recurring care, supplies, team management and reporting, along with built-in SOPs (step-by-step service guides), price guides, FAA registry lookup and AI photo condition reports. We may add, change or remove features over time.',
    ],
  },
  {
    title: 'Accounts and company responsibility',
    body: [
      'You must be at least 18 years old and provide accurate information to create an account. You are responsible for keeping your credentials secure, for all activity under your account, and for notifying us promptly at {email} of any unauthorized use.',
      'The owner of a company workspace is responsible for the people it invites, the roles and permissions it assigns, and their use of the Service. Each company is responsible for its relationships with its own customers and staff, including its prices, the work it performs, the accuracy of its records and compliance with laws that apply to its business.',
    ],
  },
  {
    title: 'Subscriptions and automatic renewal',
    body: [
      'Paid plans (Solo, Team and Fleet) are offered as auto-renewing subscriptions, billed monthly or yearly, and purchased either on our website or through the Apple App Store or Google Play. Prices are shown before purchase and may vary by country and by where you buy.',
      'Web subscriptions are billed to your card by our payment processor, Stripe. They renew automatically at the same price and for the same period until you cancel. You can change your plan, update your card, see invoices or cancel at any time in Settings → Manage billing; cancellation takes effect at the end of the current billing period and you keep access until then. If you subscribe on the web during your free trial, you are first charged when the trial ends. Except where required by law, payments are non-refundable.',
      'For subscriptions purchased in the iPhone or Android app:',
      [
        'Payment is charged to your Apple ID or Google Play account when you confirm the purchase.',
        'Your subscription renews automatically at the same price and for the same period unless auto-renew is turned off at least 24 hours before the end of the current period.',
        'Your account is charged for renewal within 24 hours before the end of the current period.',
        'You can manage your subscription and turn off auto-renewal in your App Store or Google Play account settings after purchase.',
        'Cancellation takes effect at the end of the current billing period; you keep access until then. Refunds are handled by Apple or Google under their policies.',
        'Any unused portion of a free trial is forfeited when you purchase a subscription.',
      ],
      'Apple and Google are not parties to these Terms and have no obligation to provide maintenance or support for the Service.',
    ],
  },
  {
    title: 'Free trial',
    body: [
      'New companies receive a 14-day free trial with access to every feature. No payment details are required to start the trial. When the trial ends, you need an active subscription to continue adding and changing records; your existing data remains available to view and export.',
    ],
  },
  {
    title: 'Payments and the platform fee',
    body: [
      'Companies can accept card payments from their customers (for example, invoices, quote deposits and care plans) through Stripe Connect. To do so you must create a Stripe account and accept Stripe’s terms, including the Stripe Connected Account Agreement. Stripe, not Flight Ready, processes and settles those payments.',
      'For each payment processed through the Service, we charge a platform fee based on your plan at the time of the payment: 1.5% on Solo, 1% on Team and 0.5% on Fleet. The platform fee is deducted automatically from the payment and is separate from, and in addition to, Stripe’s processing fees. Payments you record yourself (such as cash, checks or transfers made outside the Service) do not incur a platform fee. We may change the platform fee with at least 30 days’ notice.',
      'You are responsible for your own taxes, refunds, chargebacks and disputes with your customers, and for the accuracy of the amounts you charge.',
    ],
  },
  {
    title: 'Messaging',
    body: [
      'You may send emails and text messages to your customers through the Service only where you have the right to do so. You must obtain and keep records of any consent required by law (including the Telephone Consumer Protection Act and carrier rules) before sending text messages, honor opt-out requests such as STOP, and not send spam or unlawful content. Plans include a monthly text allowance; additional texts can be purchased.',
    ],
  },
  {
    title: 'Acceptable use',
    body: [
      'You agree not to:',
      [
        'Use the Service for unlawful, fraudulent, harassing or deceptive purposes, or to infringe anyone’s rights.',
        'Upload malicious code, or attempt to probe, scan, disrupt or gain unauthorized access to the Service, other accounts or other companies’ data.',
        'Reverse engineer, copy, resell or create a competing product from the Service, except as permitted by law.',
        'Share accounts or circumvent plan limits, seats or security controls.',
        'Upload content you do not have the right to use, or sensitive information not needed to run your business (such as full card numbers or government ID numbers in notes).',
      ],
    ],
  },
  {
    title: 'Your data',
    body: [
      'You and your company retain all rights to the data you put into the Service ("Customer Data"). You grant us a limited license to host, process, transmit and display Customer Data only as needed to provide, secure and support the Service and as described in our Privacy Policy. We act as your service provider for Customer Data and keep it separated from other companies’ data.',
      'You are responsible for having the rights and consents needed to store Customer Data in the Service. Company owners can export Customer Data at any time while the account is active.',
    ],
  },
  {
    title: 'Aviation and service disclaimer',
    body: [
      'Flight Ready is a business management tool. It does not provide aircraft maintenance, inspection or airworthiness advice, and nothing in the Service replaces the aircraft, vehicle, vessel or product manufacturer’s manuals, instructions or approved procedures, or applicable regulations.',
      'The built-in SOPs (service guides) and price guides are general guidance only. Always follow the manufacturer’s manual and the owner or operator’s requirements, use products approved for the surface being treated, and rely on qualified personnel. Suggested prices are estimates and are not a promise of any price or profit; you set your own prices. AI photo condition reports are automated estimates that can be wrong; confirm the condition in person before quoting or starting work. FAA registry details come from public FAA data that may be out of date; confirm registration details with the owner or operator. You are solely responsible for the work your company performs and for its safety and quality.',
    ],
  },
  {
    title: 'Intellectual property',
    body: [
      'The Service, including its software, design, SOPs, price guides and other content we provide, is owned by [Legal company name] or its licensors and is protected by intellectual property laws. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable right to use the Service for your internal business purposes during your subscription. If you send us feedback, we may use it without obligation to you.',
    ],
  },
  {
    title: 'Third-party services',
    body: [
      'The Service works with third-party services such as Stripe, Apple, Google, RevenueCat, email and text message providers and optional integrations. Your use of those services is governed by their own terms and privacy policies, and we are not responsible for them.',
    ],
  },
  {
    title: 'Suspension and termination',
    body: [
      'You may stop using the Service and delete your account at any time. We may suspend or terminate access if you materially breach these Terms, fail to pay amounts due, create risk or legal exposure for us or others, or if required by law. Where reasonable we will give notice and an opportunity to export your data. Sections that by their nature should survive termination (including payment obligations, disclaimers, limitation of liability, indemnity and governing law) survive.',
    ],
  },
  {
    title: 'Disclaimers',
    body: [
      'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE". TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT, AND ANY WARRANTY THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE OR THAT DATA WILL NEVER BE LOST. Keep your own copies of important records using the export feature.',
    ],
  },
  {
    title: 'Limitation of liability',
    body: [
      'TO THE FULLEST EXTENT PERMITTED BY LAW, FLIGHT READY AND ITS AFFILIATES, OFFICERS, EMPLOYEES AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA OR GOODWILL, OR FOR DAMAGE TO ANY AIRCRAFT, VEHICLE, VESSEL OR OTHER PROPERTY, ARISING OUT OF OR RELATED TO THE SERVICE. OUR TOTAL LIABILITY FOR ALL CLAIMS RELATED TO THE SERVICE WILL NOT EXCEED THE GREATER OF THE AMOUNTS YOU PAID FOR THE SERVICE AND PLATFORM FEES IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR ONE HUNDRED U.S. DOLLARS (US$100). Some jurisdictions do not allow certain limitations, so some of these may not apply to you.',
    ],
  },
  {
    title: 'Indemnity',
    body: [
      'You will defend, indemnify and hold harmless Flight Ready and its affiliates, officers and employees from any claims, damages, losses and expenses (including reasonable attorneys’ fees) arising from your company’s services and work, your Customer Data, your messages to customers, your use of the Service in violation of these Terms, or your violation of any law or third-party right.',
    ],
  },
  {
    title: 'Governing law and disputes',
    body: [
      'These Terms are governed by the laws of the State of [State], without regard to its conflict-of-laws rules. Any dispute arising from these Terms or the Service will be brought exclusively in the state or federal courts located in [State], and you and we consent to their jurisdiction. Before filing a claim, each party agrees to try to resolve the dispute informally by contacting the other for at least 30 days.',
    ],
  },
  {
    title: 'Changes to these Terms',
    body: [
      'We may update these Terms from time to time. We will post the updated Terms with a new "Last updated" date and, for material changes, notify account owners by email or in the app before they take effect. Continuing to use the Service after the changes take effect means you accept the updated Terms.',
    ],
  },
  {
    title: 'General',
    body: [
      'These Terms, together with the Privacy Policy, are the entire agreement between you and us about the Service. If any provision is found unenforceable, the rest remains in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them in connection with a merger, acquisition or sale of assets.',
    ],
  },
  {
    title: 'Contact',
    body: [
      'Questions about these Terms can be sent to {email} or by mail to [Legal company name], [Business address].',
    ],
  },
];
