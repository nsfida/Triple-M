<div align="center">
<img src="Assets/logo/logo.png" alt="Triplem VIP Logo" width="120" />
Triplem VIP
Private accounting, finance, inventory and business operations in one protected workspace
![Website](https://img.shields.io/badge/Website-triplem.vip-2457D6?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Layered-111827?style=for-the-badge)
Triplem VIP is a private personal and business finance workspace designed to bring accounting records, wallets, expenses, loans, assets, installments, inventory, Bitcoin utilities, reports, subscriptions, messaging and support into one coherent browser-based application.
Live Website · Security Overview · Interactive Demo · Founder
</div>
---
Table of Contents
About Triplem VIP
Project Philosophy
Core Capabilities
Application Modules
Multi-Currency Architecture
Regional Pricing
Security Architecture
Authentication and Account Recovery
Permissions and Data Isolation
Live Support and Aziz
Web Push Notifications
Themes and Interface Design
Responsive Experience
Offline and Performance Design
Progressive Web App
Reports and Exports
SEO and Public Content
Technology Stack
Frontend Architecture
Backend Architecture
Repository Structure
Currency Registry
Database Migrations
Edge Functions
Local Development
Testing
Build and Maintenance Utilities
Deployment Principles
Security Disclosure
Privacy and Sensitive Information
Public Repository Safety
Browser Compatibility
Accessibility
Project Status
Contributing
Support
Founder
License and Usage
---
About Triplem VIP
Triplem VIP is a browser-based accounting and finance platform for individuals and businesses that need more structure than a spreadsheet without fragmenting daily work across numerous disconnected applications.
The project combines financial record keeping, operational management, secure account access, reporting, communication and support within a single interface.
The live application is available at:
https://triplem.vip/
Triplem VIP is designed around several practical principles:
financial information should remain organized by account and owner;
common tasks should be available from one workspace;
mobile and desktop experiences should remain coherent;
security should be layered rather than dependent on one control;
user-selected themes should apply consistently across the application;
currency presentation should be centrally governed;
database changes should be forward-only and migration-based;
existing production data should be preserved during application evolution;
support should be available directly from the product experience.
---
Project Philosophy
Triplem VIP is built around the idea that everyday finance software should be both disciplined and approachable.
Instead of treating expenses, wallets, loans, inventory, installments, assets and reports as unrelated utilities, the application places them inside a shared financial workspace.
The project emphasizes:
Privacy
User data is separated by ownership rules and protected through application and database controls.
Clarity
Balances, transactions, schedules and operational information are presented through dedicated modules instead of one undifferentiated ledger.
Continuity
The system is designed for long-lived production data. New functionality is added through incremental migrations and backward-compatible application changes wherever practical.
Personalization
Users can configure company information, account branding, currency preferences and visual themes.
Portability
The application is browser-first, responsive, installable as a Progressive Web App and usable across modern desktop and mobile environments.
Layered Security
Authentication, Smart PIN controls, optional Authenticator App 2FA, Passkeys/WebAuthn-compatible workflows, recovery mechanisms, trusted-device concepts, database isolation and protected server functions work together rather than relying on a single defensive layer.
---
Core Capabilities
Triplem VIP includes a broad set of finance and operational tools.
Area	Purpose
Dashboard	Consolidated financial overview and account summaries
Expenses	Expense records, account activity and transaction history
Wallets	Cash, bank, card and custom financial accounts
Transfers	Wallet-to-wallet movements with synchronized balances
Loans	Money given, money taken, repayments and outstanding balances
Installments	Structured payment plans, schedules and due tracking
Assets	Asset records, value tracking and management
Depreciation	Depreciation-aware asset workflows
Inventory	Catalogs, stock, brands, variants, sales and customers
Bitcoin	Bitcoin wallet-related tools, balances and transaction views
Notes	Notes and reminder-enabled records
Reports	PDF reports, statements and data exports
Messages	Authenticated in-app communication
Notifications	Account, reminder, message and support alerts
Subscriptions	Trial, plan, renewal and account-access lifecycle
Team Access	Multi-user business access with permission controls
Live Support	Visitor support, AI guidance and human-agent handoff
Administration	Authorized account, support and platform management
---
Application Modules
Dashboard
The Dashboard is the primary financial overview.
It is designed to present important values without requiring users to open every section individually. Dashboard data is loaded through modular application logic and is connected to the user's available finance domains.
The dashboard respects the active account context, selected currencies, permissions and current theme.
---
Expenses and Wallets
The Expenses area serves as a central transaction workspace.
Users can work with different account types such as cash, bank, card and other supported account categories.
Typical workflows include:
creating and renaming accounts;
adding account balances;
recording expenses;
reviewing transaction history;
transferring funds between wallets;
maintaining custom account logos;
filtering and searching financial activity;
exporting account-level information.
Wallet and expense data is designed to remain associated with the authenticated owner.
---
Loans
The Loans module supports both directions of lending activity.
It can represent:
money given to others;
money received back;
loans taken;
repayments;
open balances;
settlement progress;
wallet-linked loan activity.
Supporting calculations are separated into reusable frontend helpers where appropriate.
---
Installments
The Installments module provides structured payment-plan management.
It supports scheduled financial obligations and gives users visibility into upcoming and completed payment activity.
The database evolution history includes dedicated installment schedule, down-payment and reminder functionality.
---
Assets
The Assets module provides a dedicated place for managing financial or business assets.
Functionality includes asset records, custom labels and depreciation-aware workflows.
Asset calculations are supported by specialized frontend logic rather than being scattered throughout the interface.
---
Inventory
Inventory is one of the larger operational areas in Triplem VIP.
Its architecture covers:
categories;
brands;
sub-brands;
product lines;
variants;
stock;
units and selling modes;
product metadata;
customers;
sales;
drafts;
product barcodes;
catalog editing;
inventory summaries.
Inventory functionality is split into dedicated modules so stock, sales, overlays and barcode-related behavior can evolve independently.
---
Bitcoin
Triplem VIP includes a dedicated Bitcoin section.
The interface can display Bitcoin balances, wallet-related information and USD-equivalent values while keeping BTC and fiat currency rendering distinct.
The application treats BTC as its own currency definition with the Bitcoin symbol and precision rules appropriate to Bitcoin.
Sensitive client-side Bitcoin material is intended to remain under browser-side control rather than being treated like an ordinary server-side account credential.
Users should always apply standard cryptocurrency security practices and independently protect their own wallet material.
---
Notes and Reminders
Notes provide a lightweight place for contextual records inside the same workspace.
The Notes module also integrates reminder behavior so operational or financial notes can become actionable rather than remaining static text.
---
Messaging
Triplem VIP includes authenticated in-app messaging.
Messaging is distinct from general notifications so conversations can be handled as conversations while reminders and system events remain in the notification experience.
The project includes live synchronization logic and dedicated support for user/admin communication.
---
Administration
Administrative capabilities are separated from ordinary account activity and protected by additional authorization logic.
Administrative functionality includes areas such as:
account management;
access-plan administration;
support operations;
analytics;
storage-management workflows;
authorized data-management tools;
account recovery assistance;
live-support operations.
Sensitive administrative implementation details are intentionally not documented in this public README.
---
Multi-Currency Architecture
Triplem VIP uses a centralized currency registry rather than defining symbols independently throughout each page.
The registry is located at:
```text
Assets/config/currencies.json
```
The current application registry defines:
Currency	Code	Display Symbol	Symbol Font
US Dollar	USD	`$`	Normal application font
Pakistani Rupee	PKR	`Rs.`	Normal application font
Saudi Riyal	SAR	`$`	Dedicated SAR symbol font
UAE Dirham	AED	`~`	Dedicated AED symbol font
Bitcoin	BTC	`₿`	Normal application font
The important architectural rule is that symbol appearance is determined by currency identity, not by the symbol character alone.
USD and SAR deliberately share the `$` character in the current product design, but they do not share the same font treatment.
A `$` must therefore never be interpreted as SAR merely because the character is `$`.
Currency rendering helpers receive or resolve the currency code and apply the correct presentation from the registry.
---
Regional Pricing
The public site can adapt billing presentation according to a visitor's region.
The registry currently maps regional billing defaults as follows:
Region	Billing Currency
Pakistan	PKR
Saudi Arabia	SAR
United Arab Emirates	AED
Other supported regions	USD fallback unless separately configured
The landing page also contains a region selector so visitors can intentionally preview another supported regional context.
Current selectable examples include:
USA;
UK;
India;
UAE;
Saudi Arabia;
Pakistan;
Russia;
China.
A region appearing in the selector does not automatically imply that the platform has a distinct billing currency for that country.
Where a region does not have an explicitly configured billing currency, the application uses the configured fallback.
This avoids presenting unsupported or invented pricing.
---
Security Architecture
Security is treated as a cross-cutting system rather than a single login screen.
The project includes multiple layers of protection, including:
account authentication;
session validation;
Smart PIN controls;
lockout and retry protections;
optional Authenticator App two-factor authentication;
Passkey/WebAuthn-compatible account-security flows;
account recovery options;
trusted-browser concepts;
permission-based module access;
owner-isolated data access;
Row Level Security policies;
protected database functions;
controlled administrative operations;
Web Push consent controls;
security-focused migrations;
protected server-side Edge Functions;
security disclosure metadata.
The public security overview is available at:
https://triplem.vip/Security/
No application can reasonably be described as invulnerable. Security requires continuous review, dependency maintenance, configuration discipline and responsible deployment.
---
Authentication and Account Recovery
Triplem VIP contains a multi-layer account-security experience.
The frontend authentication modules include dedicated areas for:
```text
Assets/app/auth/
├── 01-auth-session.js
├── 02-auth-welcome-trial.js
├── 03-two-factor.js
├── 04-account-recovery.js
├── 05-account-security.js
└── 06-auth-ui.js
```
Supported account-security concepts include:
Standard Sign-In
Primary account authentication and session establishment.
Remember Me
Optional remembered-session behavior for a faster return experience where permitted by account settings.
Smart PIN
An additional quick-access protection layer with lockout-aware behavior.
Authenticator App 2FA
Optional time-based one-time-password authentication compatible with standard authenticator applications.
Recovery Codes
Recovery-oriented mechanisms designed to provide an alternative path when a configured authentication method is unavailable.
Passkeys / WebAuthn
Modern browser and device authentication support through a dedicated WebAuthn Edge Function and frontend account-security workflow.
Trusted Browser
An optional recovery/sign-in convenience concept tied to explicit account-security configuration.
Administrative Recovery Assistance
Controlled administrative mechanisms exist for legitimate account-recovery cases where self-service recovery is unavailable.
Sensitive operational recovery procedures are intentionally excluded from public documentation.
---
Permissions and Data Isolation
Triplem VIP is a multi-user application.
Financial records are designed around account ownership.
The database architecture includes owner identifiers, permission-aware application functions and Row Level Security policies.
A central design principle is:
> A normal authenticated account should operate on its own financial data unless a deliberately authorized administrative workflow is being used.
Permissions are also used to determine which application sections are available to an account.
This allows different users or team members to receive access appropriate to their role without exposing every application module by default.
---
Live Support and Aziz
Triplem VIP includes a live visitor-support system.
The support experience combines:
visitor chat;
AI-assisted guidance;
human support agents;
conversation routing;
transfers;
message state;
support records;
agent handoff;
closure workflows;
multilingual conversation support.
The AI assistant is named Aziz.
Aziz is intended to answer questions about Triplem VIP using controlled application context.
A particularly important rule is that Aziz should describe currency support from the same authoritative currency registry used by the application rather than claiming arbitrary unsupported currencies.
When AI assistance cannot reliably continue, the live-support architecture supports handoff to a human agent.
Server-side support logic is located in:
```text
supabase/functions/aziz-live-support/
```
No AI provider credentials or server secrets should ever be committed to a public repository.
---
Web Push Notifications
Triplem VIP includes opt-in Web Push support for appropriate browsers and devices.
Notification use cases can include:
security notices;
account activity;
messages;
reminders;
support activity;
other authorized product events.
The frontend notification module is located at:
```text
Assets/app/notifications/01-web-push.js
```
Server-side push delivery is handled through a dedicated Edge Function.
Browser permission is requested through the application's consent experience rather than being assumed.
Notification presentation is also integrated with the application's theme system.
---
Themes and Interface Design
Triplem VIP uses a theme-aware design system.
The interface includes glass-inspired surfaces, rounded containers, contextual overlays, responsive cards, theme-aware buttons and animated interaction patterns.
The application supports multiple visual experiences rather than forcing a single appearance.
Theme logic is centralized in:
```text
Assets/app/core/07-theme.js
```
Theme-sensitive UI includes:
dashboard cards;
navigation;
dialogs and overlays;
charts;
forms;
dropdowns;
transaction panels;
account settings;
security interfaces;
notification permission cards;
admin interfaces;
messaging;
support windows.
A core UI rule is that overlays should inherit the active authenticated-user theme instead of applying unrelated fixed colors.
---
Responsive Experience
Triplem VIP is designed for desktop and mobile browsers.
Responsive behavior covers:
navigation;
dashboards;
financial cards;
data lists;
overlays;
authentication;
messaging;
live support;
inventory;
account settings;
charts and reports;
notifications.
Mobile layouts are not treated as merely scaled-down desktop screens.
Several interaction patterns are adapted specifically for smaller screens so controls remain reachable and financial information remains legible.
---
Offline and Performance Design
Performance is an important part of the application architecture.
The frontend has been modularized into domain-specific scripts to reduce maintenance complexity and support selective work.
The application also includes offline-aware synchronization logic:
```text
Assets/app/core/08-offline-sync.js
```
Where supported by the workflow, browser-side state can temporarily preserve actions during connectivity interruptions and synchronize them after connectivity returns.
The project also contains lazy-query and paging-related database improvements, particularly for larger finance and inventory domains.
Performance considerations include:
modular script loading;
domain-specific data requests;
lazy loading;
paging;
cached public configuration;
selective refresh behavior;
service-worker support;
reduced unnecessary full-page reloads.
---
Progressive Web App
Triplem VIP includes Progressive Web App support.
Relevant files include:
```text
service-worker.js
site.webmanifest
```
The web manifest defines Triplem VIP as a finance, business and productivity application and supports standalone installation behavior on compatible platforms.
The PWA layer is intended to improve:
installability;
startup experience;
browser integration;
resource caching;
mobile usability.
---
Reports and Exports
Reporting is built into the finance workflow.
Dedicated modules include:
```text
Assets/app/reports/
├── 01-pdf.js
└── 02-exports.js
```
Depending on the module and available data, users can generate or export financial information such as:
statements;
transaction records;
account reports;
summaries;
printable records;
business documents.
Company information and branding can be incorporated into supported report outputs.
---
SEO and Public Content
Triplem VIP includes a dedicated public SEO content area:
```text
seo/
├── accounting-setup.html
├── accounting-software.html
├── expense-tracking.html
├── finance-software.html
├── index.html
├── security-and-support.html
└── triplem.html
```
Additional discoverability resources include:
```text
robots.txt
sitemap.xml
llms.txt
humans.txt
```
The main landing page includes structured metadata intended to improve search-engine understanding of the product and its capabilities.
Public SEO content should remain factual and should not claim unsupported capabilities.
---
Technology Stack
Triplem VIP is deliberately lightweight at the application shell.
Layer	Technology
Frontend	HTML5, CSS3, JavaScript
Backend Platform	Supabase
Database	PostgreSQL
Database Security	Row Level Security + controlled functions
Server Functions	Supabase Edge Functions
Authentication Extensions	TOTP, WebAuthn/Passkey-related flows
Push	Web Push architecture through Edge Functions
PWA	Service Worker + Web Manifest
Testing	Node.js built-in test runner
Runtime Requirement	Node.js 18+ for project tooling
Public Hosting	Browser-deployable static application
Production Site	triplem.vip
The project does not depend on a large frontend framework for its primary application shell.
Instead, functionality is divided into ordered JavaScript modules and CSS layers.
---
Frontend Architecture
The frontend is organized by responsibility.
Major application directories include:
```text
Assets/app/
├── admin/
├── ai/
├── analytics/
├── assets/
├── auth/
├── bitcoin/
├── core/
├── expenses/
├── installments/
├── inventory/
├── landing/
├── lib/
├── loans/
├── messaging/
├── notes/
├── notifications/
├── reports/
├── ui/
└── utils/
```
This structure separates application domains while retaining a classic browser-global loading model.
Core Layer
The core area contains foundational runtime behavior such as:
analytics bootstrap;
currency registry;
configuration;
shared state;
element references;
data-entry APIs;
metadata helpers;
application loading;
theming;
offline synchronization;
dashboard summaries.
Domain Layer
Financial and operational functionality is kept in dedicated folders.
For example:
```text
Assets/app/expenses/
Assets/app/loans/
Assets/app/assets/
Assets/app/installments/
Assets/app/inventory/
Assets/app/bitcoin/
Assets/app/notes/
```
UI Layer
Common rendering and event binding are separated into:
```text
Assets/app/ui/
```
Boot Layer
Final initialization is coordinated through:
```text
Assets/app/boot.js
```
Important
The project uses an intentional script load order.
Do not arbitrarily reorder frontend scripts in `index.html`.
Several modules depend on globals initialized by earlier modules.
---
Backend Architecture
The backend is based on Supabase and PostgreSQL.
The backend architecture uses:
PostgreSQL tables;
incremental SQL migrations;
Row Level Security;
stored functions/RPCs;
owner-aware financial records;
controlled administrative functions;
Edge Functions for server-only workloads.
The frontend should never be given server-secret credentials.
Operations requiring privileged secrets belong in protected server-side environments.
---
Repository Structure
A simplified repository map is shown below.
```text
Triplem VIP/
│
├── index.html
├── package.json
├── service-worker.js
├── site.webmanifest
├── robots.txt
├── sitemap.xml
├── llms.txt
├── humans.txt
├── CNAME
│
├── Assets/
│   ├── app/
│   │   ├── admin/
│   │   ├── ai/
│   │   ├── analytics/
│   │   ├── assets/
│   │   ├── auth/
│   │   ├── bitcoin/
│   │   ├── core/
│   │   ├── expenses/
│   │   ├── installments/
│   │   ├── inventory/
│   │   ├── landing/
│   │   ├── lib/
│   │   ├── loans/
│   │   ├── messaging/
│   │   ├── notes/
│   │   ├── notifications/
│   │   ├── reports/
│   │   ├── ui/
│   │   └── utils/
│   │
│   ├── config/
│   │   └── currencies.json
│   │
│   ├── logo/
│   ├── sounds/
│   ├── sql/
│   ├── style/
│   │   └── fonts/
│   └── mobile_app/
│
├── Demo/
├── Founder/
├── Security/
├── docs/
├── migrations/
├── scripts/
├── seo/
├── supabase/
│   └── functions/
└── tests/
```
---
Currency Registry
The currency registry is one of the central configuration files in the project.
```text
Assets/config/currencies.json
```
Each currency can define public metadata such as:
```json
{
  "code": "USD",
  "name": "US Dollar",
  "symbol": "$",
  "font": {
    "family": "inherit",
    "file": null
  },
  "decimals": 2,
  "enabled": true
}
```
Currency-specific symbol fonts are referenced only where needed.
For example, specialized symbol fonts currently live under:
```text
Assets/style/fonts/
```
Adding a New Currency
Adding a new currency is intentionally configuration-driven at the frontend level, but a production finance system must consider more than UI display.
A new currency may require review of:
`currencies.json`;
formatting precision;
symbol font requirements;
billing eligibility;
regional billing mapping;
user currency selectors;
PDF/report formatting;
server validation;
database constraints;
historical records;
Aziz support context;
regression tests.
Do not assume that adding one JSON entry is sufficient to make a new currency safe for persistent financial records.
Frontend availability and database acceptance should remain aligned.
---
Database Migrations
Database changes are maintained in:
```text
migrations/
```
The project has a long incremental migration history covering authentication, permissions, finance domains, inventory, security hardening, subscriptions, messaging, live support, notifications, two-factor authentication, WebAuthn and regional billing.
Migration Philosophy
For a live production financial application:
avoid destructive resets;
avoid replacing the production database with a development schema;
preserve existing users;
preserve existing financial records;
prefer additive or carefully transformational migrations;
make access-policy changes explicit;
test migration order;
maintain backward compatibility where practical;
review data constraints before introducing new currencies or account types;
keep privileged SQL out of the browser.
Full Schema
The repository contains schema/build tooling for development and reference purposes.
Do not assume that a complete schema file should be executed against an existing production database.
Production updates should normally use the specific incremental migration required for that release.
---
Edge Functions
Server-side Edge Functions are located in:
```text
supabase/functions/
```
Current functional areas include:
```text
account-security-webauthn/
aziz-live-support/
push-notifications/
```
account-security-webauthn
Supports server-side components of WebAuthn/Passkey-compatible account-security workflows.
aziz-live-support
Provides server-side functionality for Aziz and live-support integration.
push-notifications
Handles privileged server-side Web Push delivery behavior.
Secret Handling
Edge Functions may require environment secrets.
Those values must be configured in the deployment platform and must never be committed into source control.
This README intentionally does not document secret values, tokens, production identifiers or confidential environment configuration.
---
Local Development
Requirements
Install:
Node.js 18 or newer;
npm;
a modern browser;
Supabase CLI when database or Edge Function work is required.
Confirm Node.js:
```bash
node --version
```
Install project tooling if dependencies are later added:
```bash
npm install
```
The current package scripts are intentionally lightweight.
---
Run Tests
From the project root:
```bash
npm test
```
This executes:
```bash
node --test tests/critical-paths.test.js
```
---
Build the Consolidated Schema Reference
Where required for maintenance:
```bash
npm run build:schema
```
This invokes:
```bash
node scripts/build_full_schema_sql.js
```
Treat generated full-schema output as a development/reference artifact unless a deployment procedure explicitly requires otherwise.
---
Static Local Hosting
Because Triplem VIP is browser-based, the public frontend can be served through any suitable local static server.
For example, if you already have a static server available:
```bash
npx serve .
```
or:
```bash
python -m http.server 8080
```
Then open the displayed local URL in a browser.
Some production features require configured backend services and will not function fully in an isolated static-only environment.
---
Testing
The repository includes critical-path tests under:
```text
tests/critical-paths.test.js
```
Run:
```bash
npm test
```
Critical-path testing is intended to protect important project assumptions such as:
frontend integration;
security-sensitive flows;
module loading;
live-support behavior;
important UI contracts;
configuration consistency.
Testing should be performed after every production-affecting modification.
Recommended Release Validation
In addition to automated tests, manually verify:
landing page;
region selector;
signup;
sign-in;
Remember Me;
Smart PIN;
Authenticator App 2FA;
Passkey/WebAuthn flow where supported;
account recovery;
currency rendering;
USD versus SAR `$` font behavior;
Dashboard;
Expenses;
wallet creation;
transfers;
Loans;
Installments;
Assets;
Inventory;
Bitcoin;
Notes;
PDF/report export;
Messages;
Web Push;
Aziz;
human-agent handoff;
subscription screens;
mobile layouts;
desktop layouts;
every available user theme.
---
Build and Maintenance Utilities
Maintenance scripts live in:
```text
scripts/
```
They include utilities for:
schema generation;
JavaScript domain analysis;
modularization;
script splitting;
stylesheet splitting;
currency utility splitting;
SEO optimization;
modularization verification.
These scripts are development tools.
Review their behavior before running them against files containing unpublished work.
---
Deployment Principles
Triplem VIP is a live financial application.
Production deployment should be conservative.
Frontend Deployment
Deploy only reviewed files that changed in the intended release.
Avoid replacing unrelated production files without need.
Database Deployment
Apply only the required incremental migration for the release.
Before running SQL in production:
review the migration;
confirm it is intended for the current schema state;
ensure it does not unexpectedly remove data;
verify compatibility with existing users;
create an appropriate database backup according to your operational policy.
Edge Function Deployment
Redeploy an Edge Function only when its source changed or its server configuration requires an update.
Example Supabase CLI workflow:
```bash
npx supabase login
npx supabase link
npx supabase functions deploy <function-name>
```
Never place an access token directly into documentation, screenshots, commits, shell-history examples or issue reports.
Cache Busting
The project may use query-string revisions on CSS and JavaScript resources.
When updating files that are aggressively cached by browsers or service workers, ensure the release strategy causes clients to receive the intended new assets.
Service Worker
Changes to service-worker-controlled assets should be validated carefully because cached older versions can otherwise survive a deployment.
---
Security Disclosure
Triplem VIP publishes a standard security contact file at:
```text
/.well-known/security.txt
```
Security researchers should use the current contact details published there or the official website.
Please report vulnerabilities responsibly.
Do not publicly disclose an exploitable vulnerability before the maintainer has had a reasonable opportunity to investigate and remediate it.
---
Privacy and Sensitive Information
Financial software repositories require disciplined secret handling.
Never commit:
database passwords;
service-role keys;
personal access tokens;
API secrets;
AI-provider secrets;
private cryptographic keys;
Web Push private keys;
recovery codes;
production session tokens;
administrator credentials;
private customer information;
exported production databases;
unredacted support transcripts containing personal data;
private Bitcoin keys or seed phrases.
Client-accessible public configuration and true server secrets are not interchangeable.
A value being used by JavaScript does not automatically make every backend credential safe to publish.
---
Public Repository Safety
Before making any branch public, perform an independent secret scan.
Recommended checks include:
```bash
git grep -n -i "password"
git grep -n -i "secret"
git grep -n -i "service_role"
git grep -n -i "access_token"
git grep -n -i "private_key"
```
Also consider dedicated scanners such as:
GitHub Secret Scanning;
Gitleaks;
TruffleHog.
Do not rely solely on keyword searches.
Secrets may exist in:
previous commits;
deleted files still present in Git history;
ZIP archives;
SQL dumps;
screenshots;
logs;
documentation;
`.env` files;
test fixtures.
If a secret has ever been committed publicly, removing it from the latest commit is not sufficient.
Rotate the credential.
---
Browser Compatibility
Triplem VIP targets modern browsers with support for contemporary web APIs.
Recommended current browsers include:
Google Chrome;
Microsoft Edge;
Safari;
Firefox;
current Chromium-based mobile browsers.
Some functionality depends on browser capabilities.
Examples include:
WebAuthn/Passkeys;
Web Push;
service workers;
PWA installation;
clipboard/security APIs;
camera/barcode-related browser capabilities.
Feature availability can therefore differ by browser, device and operating system.
---
Accessibility
The application uses semantic HTML, labeled controls, responsive layouts and icon-assisted navigation in many areas.
Accessibility should remain part of ongoing development.
When adding new components:
provide accessible labels;
maintain keyboard navigation;
avoid color-only meaning;
preserve sufficient contrast;
manage focus inside overlays;
use semantic buttons for actions;
provide screen-reader text where visual controls require it;
test zoom and smaller screens;
avoid inaccessible custom controls where native controls are sufficient.
---
Project Status
Triplem VIP is an actively developed production project.
The application has evolved through numerous incremental releases covering:
multi-user architecture;
ownership isolation;
finance domain separation;
inventory expansion;
performance improvements;
subscription lifecycle;
live support;
AI-assisted support;
Web Push;
Authenticator App 2FA;
account recovery;
Passkeys/WebAuthn;
regional billing;
centralized currency rendering;
theme consistency.
Because the project is live, repository code and production deployment may move at different times.
Always confirm the intended release before applying migrations or deploying server functions.
---
Contributing
Triplem VIP is maintained as a production application.
Before proposing changes:
understand the affected domain;
preserve existing user data;
avoid unrelated redesigns;
maintain theme compatibility;
maintain mobile and desktop behavior;
preserve currency-rendering rules;
avoid weakening Row Level Security;
avoid exposing privileged credentials;
add database changes through incremental migrations;
run the critical-path tests;
manually test the affected workflow;
document deployment requirements.
Coding Principles
Prefer:
small, focused changes;
explicit currency codes;
shared helpers;
configuration-driven behavior;
owner-aware backend operations;
theme variables instead of fixed colors;
reusable domain modules;
graceful network failure;
backward-compatible database evolution.
Avoid:
hard-coded production secrets;
duplicated currency symbol logic;
global fonts for currency-specific glyphs;
destructive database resets;
bypassing RLS from the client;
arbitrary script reordering;
large unrelated refactors inside hotfixes.
---
Support
For product information and current support options, visit:
https://triplem.vip/
Triplem VIP also provides live visitor support directly through the website.
For security-specific communication, use the current channels published in:
https://triplem.vip/.well-known/security.txt
---
Founder
Triplem VIP was founded by Nadeem Shahzad Fida.
Founder information and the project's background are available at:
https://triplem.vip/Founder/
---
License and Usage
This repository does not currently include a root `LICENSE` file.
Unless a separate license is added by the copyright owner, public visibility of the source code should not be interpreted as a grant of unrestricted permission to copy, redistribute, sublicense, rebrand or commercially reuse the project.
All applicable rights remain with their respective owner unless explicitly stated otherwise.
---
<div align="center">
Triplem VIP
One private workspace for finance, operations, records and support.
Visit triplem.vip
</div>
