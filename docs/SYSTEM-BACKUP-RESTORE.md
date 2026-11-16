# System Backup & Restore (Main Admin) — version 2, 2026-11-17

Main Admin > **Backup** menu > **System Backup & Restore**. Only the protected Main Admin sees it, and every
server call checks that account again (`app_require_protected_admin`, including the Admin Security Key gate).
An ordinary user, a non-protected admin, or a call without a session is refused by the database itself.

Version 2 adds:

- a clearer folder layout;
- 10 plain SQL files that rebuild the database on a new Supabase project;
- optional encrypted sign-in credentials, so users can still sign in after a restore to a new project;
- a choice between two restore modes (only new records, or new plus changed records), with undo;
- restoring only some accounts or categories;
- a per-account consistent snapshot;
- a local "Check a backup file" tool.

Older (version 1) backups still open, validate, preview and restore.

## Deploy

1. **SQL editor:** run `migrations/229_system_backup_v2_credentials_and_restore_all.sql` once.
   - It is additive and safe to run again.
   - It needs 212 and the later migrations, which are already deployed.
   - It creates one new table, `app_system_restore_undo`, which has RLS on and no API access.
   - It adds and replaces functions only. No existing table or record is changed.
   Then run `migrations/230_system_backup_classify_external_tables.sql`. It only re-declares the catalogue so
   three production tables that no migration created (`audit_log`, `profiles`, `user_permissions`) are
   saved in the backup as reference data (Shared_Resources) and never written by a restore.
2. **Website / Windows app:** publish the updated files. The Edge Functions and secrets are unchanged.

## What a system backup contains

```
Triplem_VIP_Full_Backup_<date>.zip
  Database_Schema/                 PLAIN (no password needed, no data, no secrets)
    01_extensions_and_install_guard.sql … 10_final_validation.sql
    INSTALL.md
  Companies/<owner id>/            one folder per business account
    profile/ team/ expenses/ accounting/ inventory/ loans/ installments/ assets/
    depreciation/ insurance/ notes/ attachments/ settings/ history/
  Individuals/<owner id>/          one folder per individual account (same sub-folders)
  User_Accounts/accounts.json      index: id, username, kind, folder, team, counts
  User_Accounts/credentials/       ONLY if "Include sign-in credentials" was ticked
  System_Configuration/            organisations, settings, currency catalogue, …
  Shared_Resources/                support, analytics, history; Unattributed/ = rows whose account is gone
  Storage_Files/<owner id>/<module>/<attachment id>.<ext>   the actual R2 files, plus company logos
  Backup_Metadata/
    backup-header.json, README.txt              plain
    backup-manifest.json, checksums.json, verification-report.json   encrypted
```

All files except `Database_Schema/` and the header and README are compressed, then sealed with
AES-256-GCM:

- The key comes from the backup password (PBKDF2-SHA-256, 600,000 iterations, random salt).
- The additional data binds each file to this backup and to its path.
- The key is never written into the archive.

**Manifest:** every file with its size and SHA-256, plus:

- counts per account and in total;
- the owner of every account;
- relationships (team owner, organisation);
- schema version (229) and timestamps;
- warnings and failures;
- the excluded tables, each with the reason.

**Consistent snapshot:** each account (up to 20,000 records) is read in a single database call, so all of
its tables come from one moment. A larger account is read page by page, and the manifest says so.

**Verification:** the finished ZIP is read back completely, and every file is decrypted and checked against
its SHA-256 before the backup counts as verified.

**Sign-in credentials (optional, off by default):** encrypted, in `User_Accounts/credentials/`:

- bcrypt password hashes;
- Smart PIN hashes;
- authenticator (2FA) secrets, decrypted from the server key so they can be re-wrapped on the new system;
- recovery codes and recovery keys (hashes);
- passkey public keys.

The protected Main Admin's own credentials are never included. Plain passwords do not exist anywhere, so
they are never included either. Treat such a backup and its password like a password database.

**Never included:** sessions, trusted devices, push subscriptions, the R2 credentials, the server keys
(2FA wrapping key, backup signing key, Admin Security Key data), the AI and Edge Function secrets.

## The 10 SQL files (new Supabase project)

The SQL is read from the live PostgreSQL catalog, not rebuilt from migration files:

| File | Content |
|---|---|
| 01 | extensions; install guard (refuses a database that already has Triplem VIP tables) |
| 02 | schema privileges, types, sequences |
| 03 | core tables: accounts, organisations, security |
| 04 | all business-module tables |
| 05 | primary keys, unique, check and foreign keys, indexes |
| 06 | functions and procedures |
| 07 | views and triggers |
| 08 | RLS switches, policies, privileges, comments |
| 09 | Storage buckets and policies, Realtime; fresh random server keys; the protected Main Admin with the same id and username and a one-time password |
| 10 | final validation (object counts against the source, RLS, Main Admin, 2FA key); removes the install mark |

How the files behave:

- Each file runs in one transaction.
- Files 02–10 refuse to run unless 01 ran first.
- Running a file again after a successful install is refused.
- The files contain no records, no password hashes and no keys.

## Restore into a NEW Supabase project (exact steps)

1. Create the new Supabase project.
2. Unzip the backup and open `Database_Schema`. In the project's **SQL editor**, paste and run
   `01_…sql`, then `02_…sql`, and so on to `10_…sql`, in order, each one completely.
   - File **09** ends with a line `Main Admin one-time password: …`. Copy it.
   - File **10** must end with `Triplem VIP schema installed and validated`.
3. Deploy the Edge Functions from the Full Source `supabase/functions`:
   `npx supabase functions deploy <name> --no-verify-jwt` for `file-storage`, `account-security-webauthn`,
   `push-notifications`, `triplem-ai`, `aziz-live-support` and `photo-maintenance`.
   Then set their secrets again, in the dashboard or with `supabase secrets set`:
   - `TRIPLEM_STORAGE_ENCRYPTION_KEY`;
   - `TRIPLEM_ALLOWED_ORIGINS`;
   - `GEMINI_API_KEY` / `GEMINI_MODEL`;
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`;
   - `WNS_PACKAGE_SID` / `WNS_CLIENT_SECRET`.
4. Point the website at the new project: in `Assets/app/core/01-config-constants.js`
   (`getEmbeddedSupabaseConfig`), set the project host and the anon key parts to those of the new project,
   then rebuild and publish. The Windows app loads the website, so it follows automatically.
5. Sign in as the Main Admin with the one-time password. Choose a new password when asked. Set up the
   Admin Security Key again if you use it.
6. Open **File Storage Settings** and enter the R2 bucket credentials. This can be the same bucket or a new,
   empty one.
7. Open **System Backup & Restore > Restore**:
   - Select the ZIP and enter its password. Validate.
   - In the preview, everything shows as **New**.
   - Choose **Restore all**, and keep **Sign-in details for accounts that are added** ticked.
   - Confirm by typing `RESTORE`.
8. When the report says *Restore completed and verified*, users can sign in with their existing passwords,
   Smart PIN, authenticator app and passkeys, provided the backup included sign-in credentials.
   - Without credentials, give each account a temporary password in **Password Recovery**.
   - Passkeys work only on the same domain (`triplem.vip`).

## Restore into an existing database

1. **Validate:**
   - format, password and manifest digest;
   - every listed file is present and no other file is;
   - safe paths and size limits;
   - every file decrypts and matches its SHA-256.
2. **Preview (read-only):** the counts are shown separately for:
   - **New** (not in this database);
   - **Already present**;
   - **Existing but different**;
   - **Conflicts**;
   - **Unreadable**.

   The counts are given for the whole system, per table, and per company or individual.
3. **Choose:**
   - **Add new records only** (the default): existing records stay exactly as they are.
   - **Restore all:** new records are added, and existing records that differ are updated to the backup
     version. Before each update, the live version is saved in `app_system_restore_undo`.
   - **Accounts and categories:** tick the companies, individuals and categories to include. Profiles and
     team members of the chosen accounts are always included. **Update the preview** recounts for the
     selection.
   - **System settings and shared data** and **Sign-in details** can each be switched off.
4. **Confirm:** tick the box and type `RESTORE`. On a database that already holds data, the server requires
   a System Backup that finished within the last 24 hours.
5. **Report and undo:**
   - The report lists every record that needs attention and downloads as CSV.
   - After *Restore all*, **Undo the updates** puts the saved versions back.
   - A record that someone changed after the restore is left alone and reported.

**What a restore never does:**

- delete or truncate anything;
- run SQL files or DDL;
- change a primary key, an owner, the protected Main Admin, or `is_protected` / `team_owner_id`;
- change the password, PIN, 2FA or passkeys of an account that already exists;
- touch a record whose id belongs to another account.

Sign-in details are applied only to accounts that this restore added. A dependent record whose parent
could not be added is reported, not inserted. A restore that is interrupted resumes when you start it
again, and nothing is duplicated.

## Automated backups (later)

The engine has no user interface dependency: `createBackup(deps, { password, includeCredentials, sink })`
writes to any sink. Two paths are possible:

- a scheduled Main Admin job (desktop app or a server worker with a protected session) could call it
  nightly;
- the planned design is a server-side job writing to a separate R2 prefix with its own key.

Neither is enabled in this release.

## Limits

- **Sessions** are not migrated. Users sign in again on the new system.
- **Push notifications, trusted devices and Windows notification channels** register again on first use.
- **Server secrets** (R2, AI, VAPID, WNS, storage encryption key) are re-entered on a new project.
- **Account-level backups** (Settings > Backup & Restore) made on the old system are signed with the old
  server key. They still download and open, but the new system will not accept them for restore. Make
  new account backups after moving.
- **History tables** (audit, sign-in history, notifications) are kept in the archive for reference and
  are not restored.
- **File size limits:**
  - one decrypted data file: 1 GB;
  - one attachment: 64 MB;
  - declared total: 512 GB;
  - per-account snapshot: up to 20,000 records or 40 MB, after which the account is read page by page.
- **Rehearsal:** test the new-project restore on a separate Supabase project first. Never test it on the
  production project.
