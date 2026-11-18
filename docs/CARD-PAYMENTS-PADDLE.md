# Pro by card — Paddle setup (2026-11-17)

Paddle is the Merchant of Record: it sells the plan, charges the card, adds sales tax/VAT where
required, renews automatically and pays out to you. Triplem VIP never sees card numbers.
Bank transfer keeps working exactly as before. The Microsoft Store edition stays bank-transfer only.

## What is in this update

| Part | File |
|---|---|
| Database (new tables + functions) | `migrations/231_paddle_card_payments.sql`, `233_card_payment_quantity.sql` (quantity), `234_card_signup.sql` (card at sign-up), `235_card_billing_switch.sql` (on/off switch) |
| Admin switch (Main Admin) | Admin › **Card Payments** (`Assets/app/billing/02-card-billing-admin.js`) |
| Sign-up panel (card first for Pro) | `Assets/app/auth/02-auth-welcome-trial.js` |
| Server function (webhook, billing portal, invoices) | `supabase/functions/paddle-billing/index.ts` |
| Card option in Plan & Subscription | `Assets/app/billing/01-card-payments.js` (+ styles in `Assets/style/75-account-panels.css`) |
| Paddle allowed in the Content-Security-Policy | `index.html`, `_headers` |
| Terms, Refund Policy, Privacy Policy | `Assets/app/core/04-trial-terms.js`, `seo/*.html` |

## Steps (test mode first)

1. **Database** — Supabase › SQL Editor: run `migrations/231_paddle_card_payments.sql`, then `234_card_signup.sql` (it includes 233).
2. **Secrets** — Supabase › Edge Functions › Secrets (type them there yourself; never send them to anyone):
   - `PADDLE_API_KEY` — Paddle › Developer tools › Authentication › API keys › New API key
     (permissions: Customer portal sessions *write*, Transactions *read*).
   - `PADDLE_ENV` = `sandbox`
   - `PADDLE_PRICE_IDS` = `pri_01m7mthdxc6wg8873h23chyt0w,pri_01m7mtjy48nw8pzvef7dxfq0be`
   - `PADDLE_TEST_USERNAMES` = the Triplem VIP username(s) you test with, e.g. `khawrai_pro`
     (in test mode no other account gets Pro from a test card).
   - `PADDLE_WEBHOOK_SECRET` — from step 4.
3. **Deploy the function**: `npx supabase functions deploy paddle-billing --no-verify-jwt`
4. **Notifications** — Paddle › Developer tools › Notifications › New destination:
   - URL: `https://<your-project>.supabase.co/functions/v1/paddle-billing?route=webhook`
   - Events: `transaction.completed`, `subscription.created`, `subscription.updated`,
     `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`,
     `adjustment.created`, `adjustment.updated`
   - Copy its **secret key** into `PADDLE_WEBHOOK_SECRET` (step 2).
5. **Website** — upload the files of this update.
6. **Try it** — on the test account's browser open `https://triplem.vip/?cardtest=1` once (shows the
   card option while in test mode; `?cardtest=0` hides it again). Plan & Subscription › Credit / debit
   card › Pay by card. Test card: `4242 4242 4242 4242`, any future date, any CVC.
   Pro is extended within seconds; the Card billing card shows the payment, invoice and
   Manage billing. Refund it from Paddle › Transactions to check that the time is removed.

## Going live (after Paddle approves the account)

1. In the **live** dashboard (vendors.paddle.com) create the same product and two prices, a
   client-side token, an API key and a notification destination (same URL and events).
2. Supabase secrets: `PADDLE_ENV=production`, the live `PADDLE_API_KEY`, live `PADDLE_WEBHOOK_SECRET`,
   live `PADDLE_PRICE_IDS`. `PADDLE_TEST_USERNAMES` is ignored in production.
3. In `Assets/app/billing/01-card-payments.js` set `env: "production"`, the live `token` and the
   live price ids, then upload it. The card option then shows for every eligible user, and the
   sign-up panel offers card payment first for Pro Monthly / Pro Yearly.
4. In Paddle (live), set the maximum quantity of both prices to 1 (Catalog › Products › price › Quantity).

## Safety

- Pro is only switched on by the server after a signed Paddle notification, never by the browser.
- Each notification is processed once; a payment is recorded once; unknown prices and unmatched
  payments are recorded and reported to administrators (Notifications), not credited.
- Plans with paid team seats keep bank transfer for now.

## Switching card payments on (2026-11-18)

Card payments start **off**: users see the card option with a "Coming soon" tag and pay by bank
transfer. After Paddle approves the account:

1. Sign in as the Main Admin, unlock the Admin Security Key, open **Admin › Card Payments**.
2. Optional first check: put your own test username in **Test accounts**, enter your password,
   **Save**; pay once with that account, check Pro, refund it in Paddle.
3. Choose **On**, enter your password, **Save**. Every eligible user now pays by card by default;
   bank transfer stays available. **Off** returns everyone to bank transfer at once.
