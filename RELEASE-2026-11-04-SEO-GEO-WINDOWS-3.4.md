# Triplem VIP release, 4 November 2026: SEO/GEO and Windows Setup 3.4.0

## Database

**No database change is needed for this release.** No migration file, schema bundle or
existing SQL file was modified or added; they are byte-identical to the previous delivery.
Migrations 201 and 202 (already deployed) remain the latest.

## 1. SEO and GEO

The research is based on current guidance as of November 2026:

- Google stopped showing FAQ rich results on 7 May 2026. FAQ markup is still valid and is kept.
- HowTo rich results were withdrawn earlier.
- Self-serving review/rating markup is a manual-action risk.
- For AI answer engines (Google AI Overviews/AI Mode, Bing Copilot, ChatGPT search, Perplexity), what counts is:
  - consistent entity facts,
  - visible freshness dates,
  - answer-first, extractable text,
  - crawlable discovery files.

| Change | Why |
|---|---|
| Removed `aggregateRating` and `review` from the homepage SoftwareApplication JSON-LD. Added `dateModified`, `downloadUrl` and `operatingSystem`. | Ratings written by the site owner violate Google's review-snippet policy and risk a manual action. The new fields describe the downloadable app accurately. |
| New 1200×630 social card `Assets/logo/og-card.jpg` (66 KB) on all 48 public pages. `og:image`/`twitter:image` now carry width, height and type. | Gives large previews on WhatsApp, LinkedIn, X and Facebook, and is used by AI answer cards. The old image was 895 px wide, below the recommended size. |
| Removed `maximum-scale`/`user-scalable=no` from the viewport on all pages. | Accessibility (WCAG 1.4.4) and a Lighthouse SEO/accessibility audit item. |
| FAQ: new visible and JSON-LD question "Can I use Triplem VIP offline?". The install answer now covers the Windows app (29 Q&As). | Adds answer-first content for questions people ask AI assistants. |
| Windows guide page (`seo/windows-desktop-app.html/.md`) rewritten for the new installer, with step-by-step install instructions in the Markdown twin. | Matches what users actually see, and AI engines quote steps verbatim. |
| `llms.txt`, `llms-full.txt` (new Windows and offline Q&As), `index.md`, `humans.txt`, homepage and FAQ dates set to 2026-11-04. Sitemap rebuilt (49 URLs; lastmod comes only from explicit content dates). | Freshness signals that agree with each other. |
| Homepage download link cache-busted (`?v=20261104-glass340`). | Users get the new installer, not a cached old one. |

After you deploy, do these two things:

1. In **Bing Webmaster Tools**, resubmit `sitemap.xml` and open *AI Performance* to see Copilot citations.
2. In **Google Search Console**, request indexing for the homepage, `/seo/faq.html` and `/seo/windows-desktop-app.html`.

**One issue to fix (not changed by me):** the AI assistant prompts in the Edge Functions use `contact@triplem.vip` and `+971 55 921 6280`, but the website uses `info@triplem.vip` and `+92 333 900 4564`. Inconsistent contact facts weaken entity trust for AI engines. Pick one set and use it everywhere.

## 2–5. Windows Setup 3.4.0

`Assets/mobile_app/Windows/TriplemVIP_Setup.exe` is **one single .exe** (6.9 MB). The verified app is embedded inside it and pinned by SHA-256.

- **Premium glass interface.**
  - Frameless window with rounded corners, a dark aurora background, glass cards, a step rail (Welcome, License, Location, Installing, Finish) and a progress ring.
  - It is rendered by the Microsoft WebView2 runtime that is already installed in Windows, and is fully offline with a locked-down content policy.
  - If WebView2 cannot start, Setup automatically falls back to the classic wizard, so installation never fails because of the UI.
- **Finish page options:**
  1. **Create Desktop Shortcut**
  2. **Create Start Menu Icon**
  3. **Pin on Taskbar**

  You can also choose **Launch Triplem VIP now**.
- **How pinning works.** Pinning needs a Start Menu entry, so turning on *Pin on Taskbar* turns on the Start Menu icon automatically. Windows does not allow an installer to pin silently: only the running app may ask, and Windows shows its own one-click confirmation. Triplem VIP now asks for this the moment it first opens, with no extra prompt from us.
- **Version information.** Setup and the app now carry full Windows version information (company, product, description, version 3.4.0.0, copyright). They also have a DPI-aware manifest and a valid PE checksum.
- **Unchanged.** Setup is still per-user and needs no administrator rights. It does not change any security settings and uses no script hosts.

### About the "Windows protected your PC" warning (point 3)

This warning comes from Windows SmartScreen and cannot be removed by changing the program. Any program that tried to bypass it would be treated as malware. It goes away only through Microsoft's trust programme:

1. **Microsoft Store (recommended, removes the warning completely).** A developer account is free, and Microsoft signs the package itself. The Store package is ready in `scripts/windows_app/msix/`.
2. **OV code-signing certificate** (about US$150–300 a year, in the company's legal name). The warning then shows your verified company name and fades as downloads build reputation. The build is already wired for this: set `TRIPLEM_SIGN_CMD` and run `scripts/windows_app/build_windows_app.sh`. It signs both the app and Setup.

Azure Artifact Signing is not available to UAE organisations. Full steps are in `docs/WINDOWS-APP-SIGNING.md`.

### Please test on Windows before publishing

The installer was compiled and checked automatically here, but this environment cannot run Windows programs. Check the following on one Windows 11 PC and one Windows 10 PC:

- [ ] Setup opens in the glass design (not the classic grey wizard).
- [ ] You can drag the window by its title bar, and Minimize and Close work.
- [ ] The License Next button stays disabled until the box is ticked, and Browse changes the folder.
- [ ] Installation reaches 100%, and the Finish page shows the 3 options.
- [ ] Each option works: Desktop shortcut, Start Menu entry, and the taskbar pin confirmation appears when the app opens.
- [ ] Turning everything off creates no shortcuts, and the app still appears in *Settings › Apps* with a working uninstall.
- [ ] Running Setup again over an existing install updates it, and the user's sign-in is kept.

## Files changed

**Added:**
- `Assets/logo/og-card.jpg`
- `docs/WINDOWS-APP-SIGNING.md`
- `scripts/windows_app/installer/glass.go`
- `scripts/windows_app/installer/ui/` (setup.html, setup-logo.png)
- `scripts/windows_app/msix/`
- `tests/windows-installer-glass.test.js`

**Modified:**
- `Assets/mobile_app/Windows/TriplemVIP_Setup.exe`
- `index.html`, `index.md`, `llms.txt`, `llms-full.txt`, `humans.txt`
- `sitemap.xml`, `sitemap-index.xml`
- `Founder/index.html`, `Security/index.html`
- all `seo/*.html` and `regions/*.html` pages (social card and viewport only), plus `seo/faq.*` and `seo/windows-desktop-app.*` content
- `scripts/windows_app/{build_resources.py, build_windows_app.sh, SECURITY.md, installer/main.go, native/main.go}`
- `scripts/run_tests.js`
- `tests/{seo-quality, app-downloads, app-downloads-public}.test.js`

## Verification

- `npm run verify` passed: 293 tests, 0 failures, plus the frontend, syntax and security audits.
- `npm run build:production` and the production output audit passed (429 files).
- The SEO/GEO source audit passed (49 canonical pages; all titles and descriptions are within length limits).

## Addendum: Microsoft Store package and privacy policy (same day)

- `TriplemVIP.msix` was built and validated with Microsoft's open-source MSIX packaging tool. It carries the reserved Partner Center identity (`TriplemVIP.TriplemVIP`, `CN=D58541F4-18AA-431F-869F-990A8A8D60CE`, "Triplem VIP"). Microsoft signs it after certification.
- When the native app runs from its Store package, it now leaves the app identity, taskbar pinning and Start entry to Windows. The direct-download installer behaves as before. The installer was rebuilt so it embeds this updated app.
- There is a new public page, `seo/privacy-policy.html` (with a Markdown version), which the Store requires. It is linked from the homepage Policies panel, the homepage JSON-LD, `llms.txt`, `seo/llms.txt`, `llms-full.txt` and `humans.txt`, and the sitemap now lists 50 URLs. **Please review its wording before deploying.**
- `docs/MICROSOFT-STORE-LISTING.md` contains the ready-to-paste Store listing, the certification notes and the runFullTrust justification.
- `scripts/windows_app/msix/build_msix.sh` rebuilds the package on Linux or CI.
- Database: there are still no changes.
