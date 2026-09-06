/**
 * Safe homepage SEO / a11y / perf helpers.
 * Does not remove app panels or change visual design tokens.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexPath = path.join(root, "index.html");

const KEEP_H2_IDS = new Set([
  "landingTrialBannerTitle",
  "landingConvinceTitle",
  "seoWhatIsTitle",
  "landingDemoAnalyticsTitle",
  "landingTestimonialsTitle",
  "aboutTitle",
  "featuresTitle",
  "servicesTitle",
  "pricingTitle",
  "faqTitle",
]);

function buildCssBundle() {
  const files = [
    "01-tokens.css",
    "02-base.css",
    "03-components.css",
    "04-inventory.css",
    "05-expenses-filters.css",
    "06-installments.css",
    "07-overlays-transfers.css",
    "08-landing-auth.css",
    "09-shell-overview.css",
    "10-overlays-misc.css",
    "11-admin-messaging.css",
    "12-late-overrides.css",
    "13-assets.css",
    "14-shared-card-surface.css",
    "15-seo-pages.css",
    "16-admin-security.css",
    "17-landing-motion.css",
    "18-seo-perf-parity.css",
    "19-notes-workspace.css",
    "20-themes-performance.css",
    "21-public-security-parity.css",
    "26-account-recovery.css",
    "27-account-security.css",
    "28-security-assets-inventory-reliability.css",
    "29-auth-surface-security-assets.css",
    "30-expenses-inventory-mobile-polish.css",
    "31-unified-theme-system.css",
  ];
  const parts = files.map((f) => {
    const p = path.join(root, "Assets", "style", f);
    if (!fs.existsSync(p)) return `/* missing ${f} */\n`;
    return `/* ===== ${f} ===== */\n` + fs.readFileSync(p, "utf8") + "\n";
  });
  const out = path.join(root, "Assets", "style", "app.bundle.css");
  fs.writeFileSync(out, parts.join("\n"));
  console.log("wrote", out, "bytes", fs.statSync(out).size);
}

function demoteHeadings(html) {
  return html.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (full, attrs = "", inner) => {
    const idMatch = String(attrs || "").match(/\bid\s*=\s*["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : "";
    if (id && KEEP_H2_IDS.has(id)) return full;
    return `<h3${attrs || ""}>${inner}</h3>`;
  });
}

function main() {
  let html = fs.readFileSync(indexPath, "utf8");

  // 1) Title + meta + social
  const title = "Triplem VIP | Personal &amp; Business Finance Management";
  const description =
    "Private accounting and finance software with encrypted Authenticator App 2FA, protected recovery, visitor Live Support, authenticated in-app support, expenses, wallets, inventory, assets, invoices and reports.";

  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${title}</title>`
  );
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${description}" />`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${title}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${description}" />`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${title}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${description}" />`
  );
  html = html.replace(
    /"name": "Triplem \| Accounting Software, Expense Tracking & Private Finance Setup"/,
    `"name": "Triplem VIP | Personal & Business Finance Management"`
  );
  html = html.replace(
    /"dateModified": "2026-(?:07-30|07-31)"/,
    `"dateModified": "2026-09-04"`
  );

  // Organization email in schema (first contactPoint block)
  if (!html.includes('"email": "nadeemshahzadfida@outlook.com"')) {
    html = html.replace(
      '"telephone": "+923339004564",',
      '"telephone": "+923339004564",\n            "email": "nadeemshahzadfida@outlook.com",'
    );
  }

  // 2) Headings
  html = demoteHeadings(html);

  // 3) Meaningful alts for key logos (keep decorative empty where intentional)
  html = html.replace(
    '<img src="Assets/logo/logo.png" alt="" width="28" height="28" />',
    '<img src="Assets/logo/logo.png" alt="Triplem VIP" width="28" height="28" loading="lazy" decoding="async" />'
  );
  html = html.replace(
    /alt="Logo"/g,
    'alt="Triplem VIP logo"'
  );
  html = html.replace(
    'alt="Triplem VIP private finance solution sign-in emblem"',
    'alt="Triplem VIP sign-in logo"'
  );

  // Wallet demo logos: descriptive alts from filename
  html = html.replace(
    /(<img class="landing-demo-wallet-logo" src="Assets\/logo\/wallet_logos\/)([^"]+)(" alt=")(")/g,
    (m, a, file, b, empty) => {
      const name = decodeURIComponent(file)
        .replace(/\.(png|jpg|jpeg|webp|gif)$/i, "")
        .replace(/_/g, " ");
      return `${a}${file}${b}${name} wallet logo"`;
    }
  );

  // 4) Replace multi CSS links with bundle + preconnect; move heavy CDN scripts out of head
  const newHeadAssets = `  <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com" />
  <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <link rel="stylesheet" href="Assets/style/app.bundle.css" />`;

  const headAssetsRe =
    /\n  <script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js"><\/script>[\s\S]*?<link rel="stylesheet" href="Assets\/style\/17-landing-motion\.css" \/>/;

  if (!html.includes("Assets/style/app.bundle.css")) {
    if (headAssetsRe.test(html)) {
      html = html.replace(headAssetsRe, "\n" + newHeadAssets);
    } else {
      console.warn("Head asset block not found; skipping CSS merge replace");
    }
  }

  const bottomCdn = `  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
  <script defer data-chartjs-loader="1" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bitcoinjs-lib-browser@5.1.7/bitcoinjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js"></script>

`;

  if (!html.includes('jspdf.umd.min.js"></script>\n  <script src="Assets/app/lib/tax-math.js"')) {
    html = html.replace(
      '  <script src="Assets/app/lib/tax-math.js"></script>',
      bottomCdn +
        '  <script src="Assets/config/public-config.js"></script>\n' +
        '  <script src="Assets/app/core/00-analytics.js"></script>\n' +
        '  <script src="Assets/app/lib/tax-math.js"></script>'
    );
  }

  // 5) Trust footer signals (additive, same footer region)
  if (!html.includes("landing-footer-trust")) {
    html = html.replace(
      '<p class="landing-footer-copy">&copy; <span id="landingFooterYear"></span> Triplem VIP · Money Management Module</p>',
      `<div class="landing-footer-trust">
            <p><strong>Triplem VIP</strong> · Private accounting &amp; finance software · Founder: Nadeem Shahzad Fida</p>
            <p>
              <a class="landing-footer-link" href="mailto:nadeemshahzadfida@outlook.com">Email support</a>
              <a class="landing-footer-link" href="https://wa.me/923339004564" target="_blank" rel="noopener noreferrer">WhatsApp +92 333 9004564</a>
              <button type="button" class="landing-footer-link" data-landing-section="policies">Privacy Policy</button>
              <button type="button" class="landing-footer-link" data-landing-section="policies">Terms of Use</button>
            </p>
            <p class="landing-footer-security"><i class="fa-solid fa-lock" aria-hidden="true"></i> TLS encrypted connection · Isolated private accounts · Client-side Bitcoin key control</p>
          </div>
          <p class="landing-footer-copy">&copy; <span id="landingFooterYear"></span> Triplem VIP · Money Management Module</p>`
    );
  }

  // 6) Logo picture/srcset helpers on primary brand marks (PNG fallback retained)
  html = html.replace(
    /<img src="Assets\/logo\/logo2\.png" alt="Triplem VIP accounting solution and finance software logo" onerror="this\.src='Assets\/logo\/logo\.png'" \/>/,
    `<picture>
            <source type="image/webp" srcset="Assets/logo/logo2.webp" />
            <img src="Assets/logo/logo2.png" alt="Triplem VIP accounting solution and finance software logo" width="148" height="42" decoding="async" fetchpriority="high" onerror="this.src='Assets/logo/logo.png'" />
          </picture>`
  );

  // Extract auth-resume inline CSS reference if still inline — leave critical inline for auth resume FOUC prevention
  // (kept intentionally for remember-me flash prevention)

  fs.writeFileSync(indexPath, html);
  console.log("updated index.html");

  // Count h2
  const h2 = (html.match(/<h2\b/gi) || []).length;
  console.log("remaining h2 count:", h2);
}

// Write parity CSS first, then bundle, then patch html
const parityCss = `/* Visual parity when demoted section titles use h3 (no UI redesign) */
.landing-section h3{
  margin:0;
  color:var(--text);
  font-size:clamp(1.55rem, 2.4vw, 2.1rem);
  line-height:1.12;
  letter-spacing:0;
}
.landing-content-body .landing-section h3,
.landing-content-body .landing-section-block h3{
  margin:0 0 6px;
  font-size:clamp(1.02rem, 2.1vw, 1.28rem);
  font-weight:700;
  line-height:1.28;
  letter-spacing:-0.015em;
  max-width:36ch;
}
.landing-content-head-copy h3{
  margin:0;
}
.landing-demo-analytics-head h3,
.landing-testimonials-head h3,
.landing-trial-banner-copy h3,
.landing-convince-head h3{
  margin:0;
}
.overview-top h3{font-size:inherit;font-weight:inherit;margin:0}
.login-header h3,
.login-panel-top h3,
.login-glass-panel--overlay h3,
.trial-promo-brand h3,
.welcome-title{
  /* welcome-title may be h3 now */
}
h3.welcome-title{
  margin:0;
}
.landing-footer-trust{
  margin:12px 0 4px;
  text-align:center;
  color:var(--muted,#475569);
  font-size:.8rem;
  line-height:1.5;
}
.landing-footer-trust p{margin:0 0 6px}
.landing-footer-trust .landing-footer-link{
  margin:0 .35rem;
}
.landing-footer-security{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  flex-wrap:wrap;
  color:#334155;
  font-weight:600;
}
.landing-footer-security i{color:#2457d6}
`;

fs.writeFileSync(
  path.join(root, "Assets", "style", "18-seo-perf-parity.css"),
  parityCss
);

buildCssBundle();
main();
