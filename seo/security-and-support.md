# Triplem VIP Security, 2FA, Account Recovery & Live Support

> Understand Triplem VIP security, 2FA, recovery, trusted browsers, visitor/in-app support and Triplem AI privacy: administrator-gated access, Vault-stored Gemini keys and workspace-only data retrieval.

Canonical page: https://triplem.vip/seo/security-and-support.html
Last updated: 2026-09-11

## Layered account protection with human support that respects the security boundary.

Triplem VIP combines hashed account credentials, optional Authenticator App 2FA, protected Smart PIN and recovery, explicit Web Push consent, visitor Live Support and authenticated in-app care while keeping each trust boundary deliberately separate.

## Verification without exposing existing permanent secrets.

Current account authentication separates passwords, sessions, Remember Me persistence and workspace ownership into distinct security controls.

### Password hashing and managed users

Current password authentication verifies PostgreSQL pgcrypto-backed bcrypt hashes. Password changes replace the stored hash rather than disclosing the old permanent secret.

- One-way bcrypt verification
- No normal readable-password account view
- Password replacement rather than recovery of the old secret
### Opaque, revocable sessions

Application sessions are server-side records with expiry and revocation state. The active browser credential is represented by a server-side hash rather than stored as a readable live token.

- Expiry and revocation state
- Logout can revoke active access
- Session boundary remains distinct from user identity
### Protected Remember Me

When chosen, returning credentials are stored in an AES-GCM encrypted browser envelope using Web Crypto and a non-exportable IndexedDB key.

- AES-GCM browser envelope
- Non-exportable local key
- Durable persistence removed when not requested
### Owner-scoped workspace

Financial records remain associated with the authorized account context and database access path instead of becoming public client state.

- Account-aware data access
- Database ownership controls
- Support access remains a separate boundary
## A second factor is verified before a normal session is created.

When enabled, a correct password creates only a short-lived challenge. A valid Authenticator code or unused recovery code is still required before full workspace entry.

### AES-256 encrypted TOTP secret

The Authenticator enrollment secret is encrypted server-side with pgcrypto because restricted verification code must be able to reproduce TOTP values.

### Hashed recovery codes

Recovery codes are normalized, bound to the user and stored as SHA-256 hashes rather than readable copies.

### Short-lived challenges

2FA login challenges expire and carry attempt controls, reducing the usefulness of a stale challenge token.

### Consumed recovery codes

A recovery code that verifies successfully is marked consumed so the same value cannot be reused.

## Recovery is structured around verification and replacement, not disclosure.

Smart PIN protection, 2FA recovery and administrator-issued temporary passwords use separate guarded paths.

Smart PIN verification uses a username-bound SHA-256 hash and server-managed failure counters with progressive lockout tiers. Normal user profile responses do not expose the stored Smart PIN hash.

When 2FA is enabled, supported Smart PIN and password recovery can verify an Authenticator code or an unused recovery code. Where administrator-assisted recovery is needed, an authorized administrator can issue a high-entropy temporary password that replaces the old hash, revokes previous sessions and forces creation of a new permanent password before ordinary workspace entry.

## Public visitor care and authenticated user support are deliberately different channels.

Support can guide a visitor or registered user without requiring disclosure of passwords, Smart PINs, Authenticator secrets or recovery codes.

### Public Live Support

A visitor support session uses a guest capability rather than pretending the visitor is an authenticated account holder.

### Authenticated Agent context

Representative actions remain tied to authenticated support context and assignment rules.

### Transfer continuity

Conversation transfers use explicit states while keeping the inquiry history attached to the same support thread.

### Authenticated in-app support

Registered businesses and individuals can use private in-app support messaging through a separate signed-in support channel where enabled.

### AI-to-Agent support

Automated guidance can assist product questions while privileged actions remain behind normal authorization boundaries.

### Core secrets stay private

Support does not require a permanent password, Smart PIN, Authenticator enrollment secret or recovery code.

## A device permission and an account preference should not be synchronized the same way.

Push subscriptions belong to a browser or device, while a visual theme can safely follow an authenticated account across browsers.

### Notification preference

The consent prompt is remembered locally after presentation. Users can later change the browser-level notification switch without altering another device.

### Workspace theme

The selected theme is stored in the existing authenticated account settings and restored after sign-in elsewhere without changing finance records.

## Formal Accounting can be enabled only for the users who need it.

The main administrator controls whether the Accounting workspace appears for each user, adding a role-aware boundary around double-entry books, journals, receivables, payables, reconciliation, tax and reports.

### Per-user enablement

Accounting can be turned on for a user whose work requires formal books without exposing the module to every account automatically.

### Hidden when disabled

When Accounting access is off, the Accounting tab is not shown for that user and the related permission path remains restricted.

### Posted-history controls

Inside Accounting, posted journals are protected from ordinary editing and the owner can use Books Lock Date to protect finalized periods.

Enabling Accounting does not silently rewrite legacy Expenses, Wallets, Inventory, Assets or Loans into journal entries. The present separation preserves existing user records and workflows while formal Accounting can be introduced deliberately.

## Explore the wider Triplem VIP workspace beyond formal Accounting.

Loans, assets, notes and Bitcoin tools remain first-class operational modules and are not removed when Accounting ERP is introduced.

### Loan management

Given, taken, repayments and settlement history.

### Assets & depreciation

Acquisition, income, costs, depreciation, book value and reports.

### Notes & reminders

Searchable notes and scheduled follow-ups.

### Bitcoin wallet tools

Watch-only, client-side wallet access, history and PDFs.

## Clear answers at the trust boundary.

These answers distinguish hashing, encryption, authentication, browser permissions and support access.

No. Current password authentication verifies pgcrypto-backed bcrypt hashes. Recovery replaces the hash rather than revealing the existing permanent password.

The TOTP secret is encrypted server-side with AES-256 and is decrypted only inside restricted verification functions that need it.

The server stores SHA-256 hashes bound to the account rather than readable recovery-code copies. A successfully used code is consumed.

No support workflow requires disclosure of a permanent password, Smart PIN, Authenticator enrollment secret or recovery code.

Browser push subscriptions are device-specific permissions, while a visual theme is an account presentation preference that can be restored after authentication.

The Technical Security & Infrastructure page explains database, session, permission, 2FA, Smart PIN, Live Support, offline and Bitcoin trust boundaries in more detail.

## AI access is permissioned, key-isolated and workspace-scoped.

### Admin eligibility

Main Admin controls which users may access Triplem AI; it is not automatically enabled for every existing or new account.

### Gemini key in Vault

An eligible user supplies their own supported Gemini API key. The secret is stored server-side through Supabase Vault and only a mask is returned for display.

### Own workspace only

AI workspace search derives its owner boundary from the authenticated session and has no parameter for selecting another user or tenant.

### Draft before write

AI-created financial activity is staged as an isolated Draft first, so balances, VAT, stock and live reports remain unchanged until explicit finalization.

## International finance for India, Europe and users worldwide.

Triplem VIP is designed for international personal and business finance. Current supported currencies include AED, SAR, PKR, USD, EUR, INR and BTC where applicable, while regional subscription pricing can present a locally supported billing currency.

### India with INR

Users in India can work with Indian Rupee (INR / ₹) across supported multi-currency finance workflows and regional subscription pricing.

### Euro-region support

Users in Belgium and other countries where the euro is used can work with EUR / € in supported finance workflows and regional subscription pricing.

### Need another currency?

Triplem VIP is built to serve users in any country. If your currency is not currently available, contact Triplem VIP and support can review adding it for your country.

Currency availability can expand as user demand grows. USD remains the regional default where another supported local billing currency does not apply. Tax, reporting and statutory requirements still depend on the user’s jurisdiction.

## Continue with the guide that matches your next decision.

The public guides use the same product, security and workflow vocabulary so visitors can move between topics without changing visual context.

### Explore more Triplem VIP guidance

Read related finance, setup and security material, or return to the main Triplem VIP experience.

Technical Security & Infrastructure · Accounting ERP · Accounting software · Expense tracking · Finance software
