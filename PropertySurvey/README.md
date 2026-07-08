# Property Survey Application

A production-ready static property inspection survey application. Inspectors complete surveys in the browser; all data and photographs are stored in Supabase. No backend server, no user accounts, no authentication for survey submission.

## Project Structure

```
├── index.html    Main application (survey form + admin dashboard)
├── styles.css    Responsive UI styles
├── script.js     Application logic and Supabase integration
├── schema.sql    Database schema, RLS policies, and storage setup
└── README.md     This file
```

## Prerequisites

- A [Supabase](https://supabase.com) account (free tier works)
- A static web host (GitHub Pages, Netlify, Vercel, or any web server)

---

## Setup Guide

### Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **New Project**.
3. Choose an organization, name your project, set a database password, and select a region.
4. Wait for the project to finish provisioning.

### Step 2: Run the Database Schema

1. In your Supabase dashboard, open **SQL Editor**.
2. Click **New Query**.
3. Copy the entire contents of `schema.sql` and paste it into the editor.
4. Click **Run**.

> **Warning:** Running `schema.sql` drops and recreates all survey tables. Existing survey data will be deleted. Storage files in the bucket are not removed automatically.

The script is safe to re-run — it cleans up old policies, triggers, and tables before recreating everything fresh.

This creates:

- `surveys` — general information and final summary
- `survey_sections` — per-room inspection conditions and comments
- `survey_photos` — uploaded photograph metadata
- Indexes, foreign keys, cascade deletes, and `updated_at` triggers
- Row Level Security policies for anonymous access
- The `property-surveys` storage bucket with upload/read/delete policies

### Step 3: Verify the Storage Bucket

The schema creates the bucket automatically. To confirm:

1. Go to **Storage** in the Supabase dashboard.
2. You should see a bucket named `property-surveys` marked as **Public**.
3. If it is missing, re-run the storage section of `schema.sql`.

Photos are stored at:

```
property-surveys/{survey_uuid}/{section_key}/{filename}
```

### Step 4: Get Your Supabase Credentials

1. Go to **Project Settings → API**.
2. Copy the **Project URL**.
3. Copy the **anon public** key (under Project API keys).

### Step 5: Configure the Application

Open `script.js` and paste your credentials:

```javascript
const SUPABASE_URL = "https://your-project-id.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key-here";
```

### Step 6: Set the Admin Secret Key

Generate a secure 64-character key. On macOS/Linux:

```bash
openssl rand -hex 32
```

On Windows (PowerShell):

```powershell
-join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

Paste the result into `script.js`:

```javascript
const ADMIN_SECRET_KEY = "your-64-character-secret-key-here";
```

Keep this key private. Anyone with it can access the admin dashboard.

### Step 7: Run Locally

Open `index.html` in a browser, or serve the folder with any static server:

```bash
# Python
python -m http.server 8080

# Node (npx)
npx serve .

# PHP built-in
php -S localhost:8080
```

Then visit `http://localhost:8080`.

> **Note:** Some browsers restrict file:// access. Use a local server for best results.

---

## Deploy to GitHub Pages

1. Create a GitHub repository and push all five project files.
2. Go to **Settings → Pages**.
3. Under **Source**, select the branch (usually `main`) and root folder (`/`).
4. Click **Save**.
5. Your app will be live at `https://your-username.github.io/your-repo/`.

After deploying, add your Supabase credentials to `script.js` and push again.

---

## Using the Application

### Inspector Workflow

1. Open the application URL.
2. Fill in **General Information** (required fields marked with *).
3. Complete each inspection section — select conditions from dropdowns, add comments, and upload photos.
4. Complete the **Final Summary** and optionally sign with the signature pads.
5. Click **Submit Survey**.
6. Photos upload first; the database record is created only after all uploads succeed.
7. On success, the form resets and a confirmation message appears.

Draft data is saved to localStorage automatically while you work. It is cleared after a successful submission.

### Admin Panel

1. Click **Admin** in the header.
2. Enter your 64-character secret key.
3. If correct, the Admin Dashboard opens. If incorrect, "Invalid Key" is shown.

**Admin Dashboard features:**

| Feature | Description |
|---------|-------------|
| View surveys | All submissions, sorted newest first |
| Search | Filter by customer name, address, date, inspector, or property type |
| View details | Click any survey card to see full inspection data and photos |
| View photos | Photos appear in each section of the detail view |
| Delete | Remove a survey and all associated data and storage files |
| Download JSON | Export a single survey as JSON |
| Export CSV | Export all surveys to a CSV file |
| Print | Print the survey detail view |

---

## Photo Upload

- Drag and drop or click to browse
- Formats: JPG, JPEG, PNG, WEBP
- Maximum size: 10 MB per file (before compression)
- Images are compressed client-side before upload (max 1920px, ~82% JPEG quality)
- Multiple photos per section
- Preview and remove before submission

---

## Database Schema Overview

```
surveys
├── id (UUID, PK)
├── customer_name, property_address, survey_date, inspector_name, ...
├── overall_condition, major_issues, recommendations, ...
└── created_at, updated_at

survey_sections
├── id (UUID, PK)
├── survey_id → surveys(id) ON DELETE CASCADE
├── section_key (exterior, living_room, kitchen, ...)
├── conditions (JSONB — all dropdown values)
├── comments
└── created_at, updated_at

survey_photos
├── id (UUID, PK)
├── survey_id → surveys(id) ON DELETE CASCADE
├── section_key
├── storage_path, public_url, file_name
└── created_at, updated_at
```

---

## Security Notes

This application uses Supabase Row Level Security with the **anon key** for all operations. There is no server-side authentication.

- The admin secret key is checked client-side only. It prevents casual access but is not cryptographically secure against determined attackers.
- For production use with sensitive data, consider enabling Supabase Auth for admin operations or using Edge Functions with a service role key.
- Never commit real Supabase credentials or admin keys to a public repository. Use environment-specific configuration or a private repo.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Supabase credentials not configured" | Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `script.js` |
| Photo upload fails | Confirm the `property-surveys` bucket exists and storage policies are applied |
| Survey insert fails | Re-run `schema.sql` and check RLS policies in the Supabase dashboard |
| Admin key rejected | Verify the key in `script.js` matches exactly (64 characters, no spaces) |
| CORS errors | Supabase handles CORS for anon requests; ensure your URL is correct |
| Blank page on file:// | Serve files through a local HTTP server instead |

---

## License

This project is provided as-is for property inspection use.
