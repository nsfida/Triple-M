# Triplem VIP Build 011 Changelog

Build 011 is a frontend refinement release designed to be deployed on top of Build 010 after migrations 144/145 and the `photo-maintenance` Edge Function are already live.

## Expenses
- Transaction action menus are now rendered as elevated viewport-level menus and cannot be clipped inside transaction tables/cards.
- Existing clickable transaction-detail overlay remains intact.
- PDF actions use a dedicated PDF document icon instead of a generic download arrow.

## Filters
- Non-Expenses finance and inventory filters now use quieter, cleaner theme-aware backgrounds and borders.
- Active filter chips retain clear selected-state contrast without heavy background plates.

## Notes
- Rebuilt the visual treatment again around a cleaner paper-note aesthetic.
- Removed the exaggerated handwriting/notebook appearance.
- Added restrained ruled-paper texture, torn-paper lower edge, folded corner, compact pencil accent, improved spacing, and theme-aware paper surfaces.
- Note create/detail/edit surfaces use the same refined paper treatment while preserving readability in every theme.

## Admin Storage / Photo Compression
- Unused storage photos can now be selected individually.
- Added Select All for unused photos.
- Delete action removes only selected unused candidates.
- Server-side Build 010 reference revalidation remains authoritative before deletion.
- Photo names and metadata are now denser and less visually oversized.

## Loans
- Fixed the Select Transactions PDF modal so it always appears in front of the loan-details overlay.
- Loan timeline transactions are now clickable.
- Added a dedicated loan transaction-detail overlay with type, counterpart, transaction date, exact recorded timestamp, remaining balance, notes, Edit, PDF and Delete actions.
- Replaced separate row Edit/Delete buttons with one elevated ellipsis menu containing Edit, Download PDF and Delete.
- Loan row menus use the same clipping-safe viewport portal behavior as Expenses.

## PDF Icons
- PDF/report actions across Expenses, Wallets, Loans, Assets, Bitcoin, Installments and Inventory now use `fa-file-pdf`.
- Genuine non-PDF file downloads such as recovery-key text files retain the regular download icon.

## Validation
- Changed JavaScript files pass `node --check`.
- Critical-path suite: 90/90 tests passing.
- No new SQL migration required.
- No Edge Function redeployment required.
