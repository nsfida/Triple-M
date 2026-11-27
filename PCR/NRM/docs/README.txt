NRM Rental Agreement — Supabase Edition
=======================================

PROJECT LAYOUT
--------------
index.html                     Main contract creation page.
contract.html                  Protected, read-only saved contract viewer.
script/app.js                  Main page application logic.
script/contract.js             Protected saved contract viewer logic.
script/config.js               Supabase URL and public anon key.
assets/app.css                 Shared layout and A4 print styling.
assets/logo.png                Company logo.
data/vehicles.xls              Source vehicle export for manual import.
sql/schema.sql                 Initial destructive database setup only.
sql/migration_contract_number.sql
                               Existing contract-number persistence migration.
sql/migration_vehicle_list_complete.sql
                               Vehicle-list migration.
sql/migration_vehicle_import_preserve_duplicates.sql
                               Vehicle import migration.
sql/migration_existing_contracts.sql
                               Safe migration for saved contract snapshots and protected viewing.
server/server.py               Local development HTTP server.
start.bat                      Windows launcher.

IMPORTANT DATABASE NOTES
------------------------
- Do NOT rerun sql/schema.sql on an existing/live installation. It is a destructive initial setup script and resets the application schema.
- For an existing installation, run sql/migration_existing_contracts.sql once in the Supabase SQL Editor. It is designed to be safe to rerun and does not drop existing tables/data.
- The new migration creates a private contracts table and session-checked RPC functions. Browser clients are not granted direct table access; contract data is read/written through the RPC layer.
- Existing installations that need the earlier migrations should also apply those migrations in the order documented for that installation.
- The previous Save button only stored the last contract number, not the form contents. That number-only data has no recoverable contract details. Contracts are stored as full snapshots from the first successful Save after migration is applied.
- Saving the same CNo. again updates that contract snapshot. The contract number and snapshot are stored together by one database function, avoiding a separate number-only save.

SUPABASE SETUP
--------------
1. For a brand-new database only, run sql/schema.sql once in the Supabase SQL Editor.
2. For an existing installation, do not run the schema reset. Run the applicable migration files from the sql folder; in particular, run sql/migration_existing_contracts.sql to enable the Existing Contracts feature.
3. Open index.html through start.bat or serve the project over HTTP.
4. Log in with your current admin access key. The initial key for a freshly created database is 74621000; change it immediately on a new installation.
5. Open Vehicle data → choose data/vehicles.xls → Import vehicles.

EXISTING CONTRACTS AND SECURITY
-------------------------------
- The Existing Contracts tab lists CNo., customer name, vehicle, and contract date/time.
- Clicking a row opens contract.html?id=<contract-id> in a new tab.
- The ID in the URL is not authorization. Before any saved contract data is loaded, the viewer validates the existing revocable admin session token through Supabase. If no valid token is stored in localStorage, it asks for the admin access key.
- The raw admin key is never saved in localStorage; only the revocable random session token is stored, and the database stores its hash.
- The saved-contract viewer uses the same agreement HTML and stylesheet as the live creation page. Fields are read-only and print styling is A4 portrait.

CONTRACT NUMBER AND DEFAULT VALUES
----------------------------------
- Contract number behavior remains based on the saved database counter. Saving a contract updates the counter and the contract snapshot together.
- New contracts default to an Out Date & Time and Return Date & Time one day apart, with No. of Days set to 1. The dates and days remain changeable.
- The rate fields and monetary rows initialize to 0.00. Rate fields remain editable; the first rental amount remains calculated from rate × days, as before.

VEHICLE IMPORT
--------------
The supplied vehicles.xls export is tab-separated text despite its .xls extension. The importer detects tabs automatically and maps the source fields. Vehicle records and vehicle status handling otherwise remain unchanged.

PRINT
-----
Use Print / Save PDF or the browser print command. The shared print stylesheet is configured for a single A4 portrait page and hides toolbars/creation-only controls.
