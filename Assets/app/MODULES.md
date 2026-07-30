# Triple-M frontend modules

Classic multi-script globals (same pattern as `domain-ledger.js` / `inventory-catalog.js`).
**Load order in `index.html` must not be changed** — concatenation of these files equals the former `script.js`.

## Backups (not linked)

- `Assets/app/script.monolith.js` — full pre-split JS
- `Assets/style/styles.monolith.css` — full pre-split CSS
- `Assets/app/script.js` / `Assets/style/styles.css` — stubs only (do not link)

## CSS (`Assets/style/01-…12-`)

Contiguous slices of the old `styles.css` in original cascade order. Linked from `index.html` in numeric order.

## JS load order (after `lib/` + domain-ledger + inventory-catalog)

1. `core/01-config-constants.js`
2. `core/02-state.js`
3. `core/03-els.js`
4. `auth/01-auth-session.js`
5. `core/04-entries-api.js`
6. `utils/01-currency-money.js`
7. `core/05-meta-helpers.js`
8. `inventory/01-inventory-meta-stock.js`
9. `inventory/02-inventory-sales-drafts.js`
10. `inventory/03-inventory-overlays.js`
11. `expenses/01-expenses-wallets.js`
12. `ui/01-render-navigation.js`
13. `installments/01-installments.js`
14. `loans/01-loans-payments.js`
15. `reports/01-pdf.js`
16. `reports/02-exports.js`
17. `expenses/02-transfers.js`
18. `ui/02-bindings.js`
19. `landing/01-landing.js`
20. `auth/02-auth-welcome-trial.js`
21. `bitcoin/01-bitcoin.js`
22. `notes/01-notes.js`
23. `admin/01-admin.js`
24. `messaging/01-messaging.js`
25. `boot.js`

## Feature map

| Folder | Responsibility |
|--------|----------------|
| `lib/` | Existing UMD helpers (tax, loan-math, permissions, admin-backup) |
| `core/` | CONFIG, state, els, entry persistence, meta helpers |
| `utils/` | Currency / money formatting |
| `auth/` | Session, guest, trial, welcome |
| `inventory/` | Stock, sales drafts, overlays (`inventory-catalog.js` stays separate) |
| `expenses/` | Wallets + transfers |
| `loans/` | Loan create/payment/edit |
| `installments/` | Installment UI glue |
| `reports/` | PDF + exports |
| `ui/` | renderAll / navigation + mid bindings |
| `landing/` | Marketing / landing |
| `bitcoin/` | BTC wallets |
| `notes/` | Notes + reminders |
| `admin/` | Admin users, RAW, backup UI |
| `messaging/` | In-app messaging |
| `boot.js` | Final DOM-ready + `boot()` |

Manifests / symbol inventory: `Assets/app/_modularization/`.

## Smoke checklist (manual)

- [ ] Landing + login / Remember Me / Smart PIN
- [ ] Create first wallet (Add Account) + top-up + expense
- [ ] Wallet-to-wallet transfer (both balances update)
- [ ] Loan with wallet link
- [ ] Inventory category open / add item / sale
- [ ] Notes + reminder
- [ ] Bitcoin panel opens
- [ ] PDF download from a section
- [ ] Admin RAW Edit + Download SQL (protected admin)
- [ ] Mobile layout of expenses / inventory
