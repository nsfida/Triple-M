# Triple M by NSF

![Triple M by NSF](Assets/logo/logo.png)

Triple M by NSF is a private business finance dashboard created and maintained by Nadeem Shahzad Fida. It is designed as a polished web-based workspace for approved users who need a controlled, organized, and professional way to manage financial records.

This repository contains the public project files for the web application. Sensitive access details, private operating procedures, and internal configuration information are intentionally not documented here.

## Website

[https://triplem.vip](https://triplem.vip)

## Project Status

This project is actively maintained as a private commercial application. Public repository documentation is kept intentionally limited so that operational details remain protected.

## Repository Overview

```text
Triple-M/
|-- index.html
|-- README.md
|-- CNAME
|-- migrations/
|   |-- schema.sql
|   |-- 001_multi_user_auth.sql
|   |-- … (numbered migrations through latest)
|   `-- README.md
|-- scripts/
|   `-- build_full_schema_sql.js
|-- tests/
|-- Assets/
|   |-- app/
|   |-- sql/
|   |   `-- triplem_full_schema.sql
|   |-- logo/
|   |-- mobile_app/
|   `-- style/
`-- package.json
```

## Technology

The application is built as a browser-based web project using:

- HTML
- CSS
- JavaScript
- Static assets for branding and styling
- Supabase (Postgres) for authenticated multi-user data storage with Row Level Security

## Authentication

Access is database-driven. Users sign in with a username and password stored in Supabase (bcrypt hashes + server-side sessions). Each account owns an isolated workspace. ZIP/JSON login files are no longer used.

Administrators manage users, passwords, and per-module permissions from the in-app Admin panel after signing in.

## Intended Use

Triple M by NSF is intended for approved users and managed deployments only. The source files in this repository should be handled carefully because the application supports private business workflows and financial records.

## Deployment Notes

Deployment is maintained by the project owner. Public setup instructions are not included in this README because production access and environment details are private.

If you are an authorized maintainer:

1. Apply `migrations/schema.sql` only for a brand-new empty database (destructive recreate), **or** prefer the bundled `Assets/sql/triplem_full_schema.sql` built via `npm run build:schema`.
2. On existing databases, apply numbered files under `migrations/` in order (see `migrations/README.md`) without destroying ledger data.
3. After a full schema reset, restore data with Admin → Upload Backup (JSON/CSV).
4. Use the internal deployment process provided by the owner for GitHub Pages / custom domain publishing.
5. Run `npm test` before release (no live Supabase required).

## Privacy And Security

Do not publish private configuration values, access instructions, customer records, account data, or internal operating details in this repository.

Recommended repository hygiene:

- Keep private details out of commits.
- Review changed files before publishing.
- Avoid exposing customer or business data in screenshots, examples, logs, or documentation.
- Keep public documentation focused on the brand and project identity only.

## Ownership

Triple M by NSF is created and maintained by:

**Nadeem Shahzad Fida**

All rights reserved unless a separate written agreement states otherwise.

## Support

For access, support, or business inquiries, contact the project owner through the official support channel.

---

<div align="center">

**Triple M by NSF**  
Private finance workspace for approved users.

</div>
