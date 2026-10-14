# Triplem VIP Build 010 Deployment

Build 010 is based on Build 009 and uses forward-only database changes. Do not run the consolidated `Assets/sql/triplem_full_schema.sql` against the existing live database.

## 1. Run the new SQL migrations in order

Run these files against the live database, in this exact order:

1. `migrations/144_build010_secure_photo_maintenance.sql`
2. `migrations/145_build010_depreciation_model.sql`

The first migration adds protected photo-maintenance RPCs. The second extends Depreciation Assets additively and creates the owner-isolated units-of-production usage ledger.

Neither migration performs installation-time deletion of existing users, financial records, assets, depreciation history, or storage objects.

## 2. Deploy the new Edge Function

From the project root, after Supabase CLI login/linking:

```powershell
npx.cmd supabase functions deploy photo-maintenance --no-verify-jwt
```

`--no-verify-jwt` is required because Triplem VIP uses its existing custom application session token in the `X-Session-Token` header and validates authorization again through protected database RPCs.

Do not place Supabase access tokens or service-role/secret keys in source code. The function reads its privileged key from the Supabase Edge Function environment.

## 3. Deploy the changed frontend files

Upload the changed web files with their existing directory structure. `index.html` contains Build 010 cache revisions for the modified browser modules.

## 4. Post-deployment checks

Confirm company-logo deletion, Admin unused-photo discovery/deletion, Expense transaction detail/PDF, loan PDF selection, Bitcoin wallet menu, Notes presentation, all depreciation methods, Assets/Depreciation PDF reports, and each active theme.
