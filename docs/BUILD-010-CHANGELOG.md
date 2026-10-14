# Triplem VIP Build 010 Changelog

Build 010 is based exclusively on Build 009.

## Themes
- Red theme rebuilt as a distinct deep-crimson/ruby theme while preserving the centralized Build 009 theme-token architecture.

## Account and Admin photo maintenance
- Added user-facing company-logo deletion in Account Settings.
- Deleting the active company logo clears the database reference and restores Triplem VIP default-logo behavior.
- Added Admin unused-photo discovery and protected deletion for the existing company-logo storage workflow.
- Storage deletion is revalidated server-side immediately before removal to avoid deleting a photo that has become referenced.

## Notes
- Reworked note cards into a paper-note visual language with ruled-paper detail, folded/torn-edge cues and pencil/reminder treatments while remaining theme-aware.
- Enhanced note overlay styling to match the revised Notes experience.

## Expenses
- Transaction History rows are clickable and open a dedicated transaction detail overlay.
- Detail overlay shows amount, account, business transaction date, exact recorded timestamp when available, tax and notes.
- Replaced separate Edit/Delete transaction controls with a single actions menu containing Edit, Download PDF and Delete.
- Added branded single-transaction PDF export.
- Top-Up Records retain their existing actions and are not incorrectly routed through the expense-spend PDF resolver.

## Loans
- Enhanced loan detail overlay.
- Added PDF selection workflow supporting one or multiple selected loan transactions.
- Added branded selected-transaction loan PDF export.

## Bitcoin
- Consolidated wallet create/import/access choices into a single wallet-access dropdown.
- Refined wallet workspace layout and send/receive surfaces for a more compact, focused experience.

## Assets and Depreciation Assets
- Retained normal Assets compatibility and aligned Assets/Depreciation report presentation.
- Rebuilt Depreciation Assets around explicit accounting assumptions: cost, residual value, in-service date, useful life, carrying amount and accumulated depreciation.
- Added straight-line, diminishing-balance and units-of-production methods.
- Added owner-isolated units-of-production usage entries.
- Added disposal proceeds and gain/loss presentation.
- Preserved existing depreciation records and historical depreciation rows; existing assets remain straight-line by default unless explicitly changed.
- Unified Depreciation Assets PDF presentation with the standard Triplem VIP report language.

## Data safety and security
- Added two forward-only migrations. No installation-time user, financial-record, asset, depreciation-history or storage deletion is performed.
- Added protected `photo-maintenance` Edge Function for storage-object cleanup.
- Privileged storage credentials remain server-side.
- New depreciation usage records use ownership enforcement, RLS, existing team-mutation enforcement where available, backup coverage and offline-sync coverage.
