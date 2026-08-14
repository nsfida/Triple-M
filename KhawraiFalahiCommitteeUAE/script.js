"use strict";

/* ─── Constants ──────────────────────────────────────────────── */
const API_BASE   = "https://livenews.live/KFC";
const PHOTOS_BASE = `${API_BASE}/static/images/photos/`;
const DEFAULT_PHOTO = `${PHOTOS_BASE}default.png`;
const CARD_DATA_URL = `${API_BASE}/cards.json`;
const THEME_KEY   = "kfcTheme";
const SESSION_KEY = "kfcUser";

const ALLOWED_FULL_ACCESS = [
  "746-210-001","746-210-011","746-210-040",
  "746-210-006","746-210-007","746-210-008","746-210-021"
];

/* ─── State ──────────────────────────────────────────────────── */
let allData     = [];
let currentUser = null;
let currentSort = { column: null, asc: true };

/* ─── DOM refs ───────────────────────────────────────────────── */
let userArea, usernameSpan, userDropdown,
    guestView, userView, openLoginBtn,
    loginOverlay, loginBtn, loginUsername, loginPassword, loginError,
    logoutBtn, userFullName, userCard, userDesg, userBlood, userMobile, userAccess,
    welcomePopup, welcomeText,
    headerProfileImg, headerUserIcon, dropdownProfileImg,
    viewPhotoBtn, photoOverlay, fullProfileImg, closePhotoOverlay,
    viewCardBtn,
    themeToggleBtn, themeToggleIcon,
    searchField, searchInput, searchButton, printButton, csvButton,
    generateButton, englishConstitution, urduConstitution, allCardsBtn, emirates,
    resultContainer,
    ecardOverlay, ecardOverlayBox, ecardCloseBtn, ecardSpinner, ecardInner,
    searchModeAll, searchModeActive;

function cacheDOM() {
  userArea           = document.getElementById("userArea");
  usernameSpan       = document.getElementById("username");
  userDropdown       = document.getElementById("userDropdown");
  guestView          = document.getElementById("guestView");
  userView           = document.getElementById("userView");
  openLoginBtn       = document.getElementById("openLoginBtn");
  loginOverlay       = document.getElementById("loginOverlay");
  loginBtn           = document.getElementById("loginBtn");
  loginUsername      = document.getElementById("loginUsername");
  loginPassword      = document.getElementById("loginPassword");
  loginError         = document.getElementById("loginError");
  logoutBtn          = document.getElementById("logoutBtn");
  userFullName       = document.getElementById("userFullName");
  userCard           = document.getElementById("userCard");
  userDesg           = document.getElementById("userDesg");
  userBlood          = document.getElementById("userBlood");
  userMobile         = document.getElementById("userMobile");
  userAccess         = document.getElementById("userAccess");
  welcomePopup       = document.getElementById("welcomePopup");
  welcomeText        = document.getElementById("welcomeText");
  headerProfileImg   = document.getElementById("headerProfileImg");
  headerUserIcon     = document.getElementById("headerUserIcon");
  dropdownProfileImg = document.getElementById("dropdownProfileImg");
  viewPhotoBtn       = document.getElementById("viewPhotoBtn");
  photoOverlay       = document.getElementById("photoOverlay");
  fullProfileImg     = document.getElementById("fullProfileImg");
  closePhotoOverlay  = document.getElementById("closePhotoOverlay");
  viewCardBtn        = document.getElementById("viewCardBtn");
  themeToggleBtn     = document.getElementById("themeToggleBtn");
  themeToggleIcon    = document.getElementById("themeToggleIcon");
  searchField        = document.getElementById("searchField");
  searchInput        = document.getElementById("searchInput");
  searchButton       = document.getElementById("searchButton");
  printButton        = document.getElementById("printButton");
  csvButton          = document.getElementById("csv");
  generateButton     = document.getElementById("generateButton");
  englishConstitution= document.getElementById("englishConstitution");
  urduConstitution   = document.getElementById("urduConstitution");
  allCardsBtn        = document.getElementById("allCards");
  emirates           = document.getElementById("emirates");
  resultContainer    = document.getElementById("resultContainer");
  ecardOverlay       = document.getElementById("ecardOverlay");
  ecardOverlayBox    = document.getElementById("ecardOverlayBox");
  ecardCloseBtn      = document.getElementById("ecardCloseBtn");
  ecardSpinner       = document.getElementById("ecardSpinner");
  ecardInner         = document.getElementById("ecardInner");
  searchModeAll      = document.getElementById("searchModeAll");
  searchModeActive   = document.getElementById("searchModeActive");
}

/* ═══════════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════════ */
function applyTheme(mode) {
  const dark = mode === "dark";
  document.body.classList.toggle("dark-mode", dark);
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  if (themeToggleIcon) {
    themeToggleIcon.className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") { applyTheme(saved); return; }
  const pref = window.matchMedia && window.matchMedia("(prefers-color-scheme:dark)").matches;
  applyTheme(pref ? "dark" : "light");
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */
function norm(v) { return (v || "").toString().trim(); }

function esc(str) {
  return String(str || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function genUsername(name) {
  const parts = norm(name).toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return norm(name).toLowerCase();
  return parts[0] + parts[parts.length - 1];
}

function genPassword(cardNo) {
  if (!cardNo) return "";
  const parts = String(cardNo).split("-");
  return parts[parts.length - 1] || "";
}

function isCancelled(status) {
  const s = norm(status).toLowerCase();
  return s === "cancel" || s === "cancelled";
}

function isFullAccess(cardNo) {
  return ALLOWED_FULL_ACCESS.includes(norm(cardNo));
}

function isActiveStatus(item) {
  return norm(item?.Status).toLowerCase() === "active";
}

function getSearchMode() {
  if (searchModeActive?.checked) return "active";
  return "all";
}

function getSearchResults() {
  const term  = norm(searchInput?.value).toLowerCase();
  const field = searchField?.value || "name";
  const mode  = getSearchMode();

  if (!allData.length || term === "") return [];

  let results = allData.filter(item =>
    item[field] &&
    item[field].toString().toLowerCase().includes(term) &&
    (mode !== "active" || isActiveStatus(item))
  );

  if (currentSort.column) {
    results.sort((a, b) => {
      const va = (a[currentSort.column] || "").toString().toLowerCase();
      const vb = (b[currentSort.column] || "").toString().toLowerCase();
      if (va < vb) return currentSort.asc ? -1 : 1;
      if (va > vb) return currentSort.asc ?  1 : -1;
      return 0;
    });
  }

  return results;
}

/* ─── CSV EXPORT ─────────────────────────────────────────────── */
function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCSV(filename, rows) {
  const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  if (!currentUser || !isFullAccess(currentUser.CNo)) return;

  const results = getSearchResults();
  if (!results.length) return;

  const keys = Object.keys(results[0]);
  const rows = [];
  rows.push(["S.NO.", ...keys].map(csvEscape).join(","));

  results.forEach((item, idx) => {
    rows.push([idx + 1, ...keys.map(k => item[k])].map(csvEscape).join(","));
  });

  downloadCSV(`${sanitizeFileName("Khawrai Falahi Committee UAE")}.csv`, rows);
}

function sanitizeFileName(n) {
  return String(n || "card").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim();
}

/* ─── Profile image with fallback ─────────────────────────── */
function getImageSources(cardNo) {
  const c = encodeURIComponent(String(cardNo || ""));
  return [`${PHOTOS_BASE}${c}.png`, `${PHOTOS_BASE}${c}.jpg`, DEFAULT_PHOTO];
}

function setImgWithFallback(imgEl, sources, fallbackIconEl) {
  if (!imgEl) return;
  let idx = 0;
  const tryNext = () => {
    if (idx >= sources.length) {
      imgEl.style.display = "none";
      if (fallbackIconEl) fallbackIconEl.style.display = "block";
      return;
    }
    imgEl.src = sources[idx++];
  };
  imgEl.onerror = tryNext;
  imgEl.onload  = () => {
    imgEl.style.display = "block";
    if (fallbackIconEl) fallbackIconEl.style.display = "none";
  };
  tryNext();
}

function applyProfileImages(cardNo) {
  const srcs = getImageSources(cardNo);
  setImgWithFallback(headerProfileImg, srcs, headerUserIcon);
  setImgWithFallback(dropdownProfileImg, srcs, null);
  setImgWithFallback(fullProfileImg, srcs, null);
}

/* ═══════════════════════════════════════════════════════════════
   SESSION
═══════════════════════════════════════════════════════════════ */
function saveSession(user)  { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function clearSession()     { localStorage.removeItem(SESSION_KEY); }

function showGuestUI() {
  if (headerProfileImg) headerProfileImg.style.display = "none";
  if (headerUserIcon)   headerUserIcon.style.display   = "block";
  if (guestView)        guestView.style.display        = "block";
  if (userView)         userView.style.display         = "none";
  if (usernameSpan)     usernameSpan.innerText         = "Welcome, Guest";
  updateButtonAccess();
}

function showLoggedInUI() {
  if (guestView) guestView.style.display = "none";
  if (userView)  userView.style.display  = "flex";
}

function renderUser(user) {
  if (!user) return;
  const firstName = norm(user.name).split(" ")[0] || "User";
  if (usernameSpan) usernameSpan.innerText = `Welcome, ${firstName}`;
  if (userFullName) userFullName.innerText = `Welcome, ${user.name}`;
  if (userCard)     userCard.innerText     = `Card Number: ${user.CNo}`;
  if (userDesg)     userDesg.innerText     = `Designation: ${user.Desg}`;
  if (userBlood)    userBlood.innerText    = `Blood Group: ${user.BG || "Not available"}`;
  if (userMobile)   userMobile.innerText   = `Registered Mobile: ${user.mobile || "Not available"}`;
  if (userAccess)   userAccess.innerText   = isFullAccess(user.CNo) ? "✦ Full Access" : "◈ Limited Access";
  applyProfileImages(user.CNo);
  if (viewCardBtn)  viewCardBtn.href = `viewcard.html?card=${btoa(String(user.CNo))}`;
  showLoggedInUI();
  updateButtonAccess();
}

function checkSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) { currentUser = null; showGuestUI(); return; }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && !isCancelled(parsed.Status)) {
      currentUser = parsed; renderUser(parsed);
    } else {
      clearSession(); currentUser = null; showGuestUI();
    }
  } catch {
    clearSession(); currentUser = null; showGuestUI();
  }
}

/* ─── Button access ──────────────────────────────────────────── */
function updateButtonAccess() {
  const loggedIn = !!currentUser;
  const fullAcc  = loggedIn && isFullAccess(currentUser.CNo);
  const hasInput  = norm(searchInput?.value) !== "";

  if (searchButton) searchButton.disabled = !loggedIn || !hasInput;

  if (csvButton) {
    csvButton.disabled = !loggedIn || !fullAcc || !hasInput;
    csvButton.title = (!loggedIn || !fullAcc)
      ? "Full Access members only"
      : (hasInput ? "" : "Type in search to enable CSV");
    csvButton.style.cursor = csvButton.disabled ? "not-allowed" : "pointer";
  }

  if (printButton) {
    printButton.title = hasInput ? "" : "Search first to print results";
    printButton.style.cursor = hasInput ? "pointer" : "not-allowed";
  }

  [generateButton, allCardsBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled      = !fullAcc;
    btn.title         = fullAcc ? "" : "Full Access members only";
    btn.style.cursor  = fullAcc ? "pointer" : "not-allowed";
  });
}

/* ─── Welcome popup ──────────────────────────────────────── */
function showWelcome(name) {
  if (!welcomePopup || !welcomeText) return;
  welcomeText.innerText = `Welcome, ${name} 👋`;
  welcomePopup.classList.add("show");
  setTimeout(() => welcomePopup.classList.remove("show"), 2500);
}

/* ═══════════════════════════════════════════════════════════════
   LOGIN
═══════════════════════════════════════════════════════════════ */
function doLogin() {
  if (loginError) loginError.innerText = "";
  const uname = norm(loginUsername?.value).toLowerCase();
  const pass  = norm(loginPassword?.value);

  if (!uname || !pass) {
    if (loginError) loginError.innerText = "Enter username and password";
    return;
  }

  const user = allData.find(u =>
    genUsername(u.name) === uname && genPassword(u.CNo) === pass
  );

  if (!user) {
    if (loginError) loginError.innerText = "Invalid credentials";
    return;
  }
  if (isCancelled(user.Status)) {
    if (loginError) loginError.innerText = "This account cannot log in — card is cancelled";
    return;
  }

  currentUser = user;
  saveSession(user);
  renderUser(user);
  showWelcome(user.name);
  if (loginOverlay) loginOverlay.classList.remove("show");
}

/* ═══════════════════════════════════════════════════════════════
   LOAD DATA
═══════════════════════════════════════════════════════════════ */
async function loadData() {
  try {
    const res = await fetch(`${CARD_DATA_URL}?t=${Math.random().toString(36).slice(2)}`);
    allData = await res.json();
  } catch (e) {
    console.error("Failed to load card data:", e);
    if (resultContainer) resultContainer.innerHTML = "<p class='no-data'>Failed to load data.</p>";
  }
}

/* ═══════════════════════════════════════════════════════════════
   SEARCH & TABLE
═══════════════════════════════════════════════════════════════ */
function handleSearch() {
  const term = norm(searchInput?.value);

  if (!currentUser) {
    if (resultContainer) resultContainer.innerHTML = "<p class='no-data'>⚠ Please sign in before searching.</p>";
    if (printButton) printButton.disabled = true;
    if (csvButton) csvButton.disabled = true;
    return;
  }

  if (searchButton) searchButton.disabled = term === "";
  updateButtonAccess();

  if (term !== "") renderTable();
  else {
    if (resultContainer) resultContainer.innerHTML = "";
    if (printButton) printButton.disabled = true;
    if (csvButton) csvButton.disabled = true;
  }
}

window.openCardInNewWindow = function(cardNo) {
  window.open(`viewcard.html?card=${btoa(String(cardNo))}`, "_blank", "noopener,noreferrer");
};

function renderTable() {
  if (!currentUser) {
    if (resultContainer) resultContainer.innerHTML = "<p class='no-data'>⚠ Login required to search.</p>";
    if (printButton) printButton.disabled = true;
    if (csvButton) csvButton.disabled = true;
    return;
  }

  const term  = norm(searchInput?.value).toLowerCase();
  const field = searchField?.value || "name";
  const mode  = getSearchMode();

  if (!allData.length || term === "") {
    if (resultContainer) resultContainer.innerHTML = "";
    if (printButton) printButton.disabled = true;
    if (csvButton) csvButton.disabled = true;
    updateButtonAccess();
    return;
  }

  let results = allData.filter(item =>
    item[field] &&
    item[field].toString().toLowerCase().includes(term) &&
    (mode !== "active" || isActiveStatus(item))
  );

  if (!results.length) {
    if (resultContainer) resultContainer.innerHTML = "<p class='no-data'>No matching results found.</p>";
    if (printButton) printButton.disabled = true;
    if (csvButton) csvButton.disabled = true;
    updateButtonAccess();
    return;
  }

  if (currentSort.column) {
    results.sort((a, b) => {
      const va = (a[currentSort.column] || "").toString().toLowerCase();
      const vb = (b[currentSort.column] || "").toString().toLowerCase();
      if (va < vb) return currentSort.asc ? -1 : 1;
      if (va > vb) return currentSort.asc ?  1 : -1;
      return 0;
    });
  }

  const fullAcc = isFullAccess(currentUser.CNo);
  const keys    = Object.keys(results[0]);

  /* Print header (hidden on screen) */
  let html = `
    <div class="print-header-bar">
      <img src="logo.png" alt="KFC">
      <div>
        <div class="ph-title">Khawrai Falahi Committee UAE</div>
        <div class="ph-subtitle">خاورئی فلاحی کمیٹی متحدہ عرب امارات</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th onclick="window.sortTable('_sno')" style="cursor:pointer">S.NO.</th>`;

  keys.forEach(k => {
    const label = k === "Room" ? "ROOM/ADDRESS" : k;
    html += `<th onclick="window.sortTable('${k}')">${esc(label)}</th>`;
  });
  html += `<th class="no-print">VIEW CARD</th>
      </tr></thead><tbody>`;

  results.forEach((item, idx) => {
    const isOwnRow = norm(item.CNo) === norm(currentUser.CNo);
    const canView  = fullAcc || isOwnRow;

    html += "<tr>";
    html += `<td>${idx + 1}</td>`;

    keys.forEach(k => {
      let val = esc(item[k]);

      /* Privacy masking for limited-access users */
      if (!fullAcc && !isOwnRow) {
        if (k === "name") {
          const parts = norm(item.name).split(/\s+/);
          val = parts.length > 2
            ? esc("*** " + parts.slice(1, -1).join(" ") + " ***")
            : "*** ***";
        }
        if (k === "CNo") {
          const parts = norm(item.CNo).split("-");
          val = esc(parts.slice(0, -1).join("-") + "-***");
        }
      }

      let cls = "";
      if (k.toLowerCase() === "status") {
        const s = norm(item[k]).toLowerCase();
        if (s === "active") cls = " class='active'";
        if (s === "cancel" || s === "cancelled") cls = " class='cancel'";
      }

      if (k === "name") {
        html += `<td${cls}>
          ${canView
            ? `<button type="button" class="search-name-link"
                 onclick="window.openCardInNewWindow('${esc(item.CNo)}')">${val}</button>`
            : `<span>${val}</span>`}
        </td>`;
      } else {
        html += `<td${cls}>${val}</td>`;
      }
    });

    /* View Card button */
    html += `<td class="no-print">
      <button class="view-card-inline-btn"
        ${canView
          ? `onclick="window.openCardOverlay('${btoa(String(item.CNo))}')" `
          : "disabled"}>
        VIEW CARD
      </button>
    </td>`;
    html += "</tr>";
  });

  html += "</tbody></table>";
  if (resultContainer) resultContainer.innerHTML = html;

  if (printButton) printButton.disabled = false;
  if (csvButton) csvButton.disabled = !fullAcc;
  updateButtonAccess();
}

window.sortTable = function(col) {
  if (currentSort.column === col) currentSort.asc = !currentSort.asc;
  else { currentSort.column = col; currentSort.asc = true; }
  renderTable();
};

/* ─── PDF / IMAGE HELPERS ───────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function nextPaint() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
function waitForImageLoad(img) {
  return new Promise(resolve => {
    if (!img) return resolve();
    if (img.complete && img.naturalWidth !== 0) return resolve();
    img.addEventListener("load",  () => resolve(), { once:true });
    img.addEventListener("error", () => resolve(), { once:true });
  });
}
async function waitForImages(root) {
  if (!root) return;
  await Promise.all([...root.querySelectorAll("img")].map(waitForImageLoad));
}

async function saveCardAsPdf(card, frontNode, backNode) {
  const fileName = `${sanitizeFileName(norm(card.name) || "e-Card")} e-Card.pdf`;
  if (!frontNode || !backNode) return;
  const wrapperNode = frontNode.parentElement;
  await waitForImages(wrapperNode);
  await sleep(350);
  await nextPaint();

  const PdfCtor = window.jspdf && window.jspdf.jsPDF;

  if (typeof html2canvas === "undefined" || !PdfCtor) {
    if (typeof html2pdf !== "undefined" && wrapperNode) {
      await html2pdf().set({
        margin:10, filename:fileName,
        image:{ type:"jpeg", quality:1 },
        html2canvas:{ scale:4, useCORS:true, backgroundColor:"#ffffff" },
        jsPDF:{ unit:"mm", format:"a4", orientation:"portrait" }
      }).from(wrapperNode).save();
    }
    return;
  }

  const canvas = await html2canvas(wrapperNode, {
    scale:3, useCORS:true, allowTaint:false,
    backgroundColor:"#ffffff", logging:false,
    onclone: clonedDoc => {
      const cw = clonedDoc.getElementById(wrapperNode.id);
      if (cw) {
        cw.style.cssText = "transform:none;display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px;width:auto;height:auto;";
        cw.querySelectorAll(".ecard-container").forEach(el => {
          el.style.transform = "none"; el.style.margin = "0"; el.style.position = "relative";
        });
      }
    }
  });

  const pdf  = new PdfCtor({ orientation:"p", unit:"mm", format:"a4", compress:true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15, maxW = pageW - margin * 2, maxH = pageH - margin * 2;
  let drawW = maxW, drawH = (canvas.height * drawW) / canvas.width;
  if (drawH > maxH) { drawH = maxH; drawW = (canvas.width * drawH) / canvas.height; }
  const x = (pageW - drawW) / 2, y = (pageH - drawH) / 2;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, drawW, drawH);
  pdf.save(fileName);
}

/* ═══════════════════════════════════════════════════════════════
   e-CARD OVERLAY
═══════════════════════════════════════════════════════════════ */
window.openCardOverlay = async function(encodedCard) {
  if (!ecardOverlay) return;
  ecardOverlay.classList.add("show");
  ecardOverlay.setAttribute("aria-hidden","false");
  ecardSpinner.style.display = "flex";
  ecardInner.style.display   = "none";
  ecardInner.innerHTML       = "";

  let cardNo;
  try { cardNo = atob(encodedCard); } catch { cardNo = null; }
  if (!cardNo) { ecardSpinner.style.display = "none"; return; }

  if (!allData.length) await loadData();
  const card = allData.find(c => norm(c.CNo) === norm(cardNo));
  if (!card) { ecardSpinner.style.display = "none"; return; }

  const fullAcc = currentUser && isFullAccess(currentUser.CNo);
  if (!currentUser || (!fullAcc && norm(card.CNo) !== norm(currentUser.CNo))) {
    ecardSpinner.style.display = "none";
    ecardOverlay.classList.remove("show");
    ecardOverlay.setAttribute("aria-hidden","true");
    return;
  }

  /* Build card HTML */
  const BASE   = API_BASE + "/static/images/";
  const desg   = norm(card.Desg).toLowerCase();
  const isAP   = desg.includes("acting president");
  const isVP   = desg.includes("vice president");
  const isPres = desg.includes("president") && !isVP && !isAP;
  const bgSrc  = (isPres || isAP || isVP) ? `${BASE}background2.png` : `${BASE}background.png`;
  const labelText = isAP ? "Acting President's e-Card" : isPres ? "President's e-Card" : isVP ? "Vice President's e-Card" : "e-Card";

  const photoCNo    = encodeURIComponent(norm(card.CNo));
  const photoSrc    = `${PHOTOS_BASE}${photoCNo}.png`;
  const photoFallback = `${PHOTOS_BASE}photo.png`;
  const defaultStamp = `${BASE}stamp.png`;
  const defaultSign  = `${BASE}signature.png`;
  const authFolder  = (card.Authority || "").trim().toLowerCase();
  const stampSrc    = authFolder ? `${PHOTOS_BASE}${authFolder}/stamp.png` : defaultStamp;
  const signSrc     = authFolder ? `${PHOTOS_BASE}${authFolder}/signature.png` : defaultSign;
  const cancelled   = isCancelled(card.Status);
  const uid         = "ov_" + Math.random().toString(36).slice(2, 8);

  const frontHTML = `
    <div class="ecard-container" id="${uid}_front">
      <img src="${bgSrc}" class="card-bg-img">
      <img src="${BASE}watermark.png" class="card-watermark">
      <div class="card-strip-hole"></div>
      <div class="card-strip-hole2"></div>
      <img src="${BASE}logo1.png" class="card-logo1">
      <img src="${BASE}logo2.png" class="card-logo2">
      <img src="${BASE}logo.png" class="card-logo">
      <img src="${BASE}logo.png" class="card-center-logo">
      <img id="${uid}_stamp" src="${stampSrc}" class="card-stamp">
      <img id="${uid}_photo" class="card-photo">
      <img id="${uid}_photoSm" class="card-photo-small">
      <img src="${BASE}sticker.png" class="card-photosticker">
      <img src="${BASE}logo.png" class="card-photo-logo">
      <img src="${BASE}sticker.png" class="card-photo-logo2">
      <img src="${BASE}shadow.png" class="card-photo-logo3">
      <div class="card-ecard-label">${esc(labelText)}</div>
      <img src="${BASE}qrcode.png" class="card-qr">
      <img id="${uid}_sign" src="${signSrc}" class="card-signature">
      <div class="card-text-container">
        <p id="${uid}_name"></p>
        <p><span>Urdu Name: </span><span id="${uid}_urdu" class="card-text-urdu"></span></p>
        <p id="${uid}_desg" class="card-designation">${esc("Desg: " + norm(card.Desg))}</p>
        <p id="${uid}_cno"></p>
        <p>${esc("B-Group: " + norm(card.BG))}</p>
        <p id="${uid}_mobile"></p>
        <p class="card-issuance">Issuance Authority: ___________________</p>
      </div>
      <div class="card-header-text">KHAWRAI FALAHI COMMITTEE UAE</div>
      <div class="card-header-urdu">خاورئی فلاحی کمیٹی متحدہ عرب امارات</div>
      <div class="card-date">ISSUE DATE: ${esc(norm(card.Issue))}</div>
      <div class="card-valid-till">VALIDITY: ${esc(norm(card.Validity || "UAE VISA EXPIRY").toUpperCase())}</div>
      ${cancelled ? '<div class="card-cancel-banner">e-Card CANCELLED</div>' : ""}
    </div>`;

  const backHTML = `
    <div class="ecard-container" id="${uid}_back">
      <img src="${bgSrc}" class="card-bg-img">
      <img src="${BASE}watermark.png" class="card-watermark">
      <img src="${BASE}logo.png" class="card-back-overlay-logo">
      <div class="card-verify-box">
        <div>Verification QR</div>
        <div class="card-verify-qr-wrap">
          <img id="${uid}_qr">
        </div>
        <div id="${uid}_vname" class="card-verify-name"></div>
        <img id="${uid}_vphoto" class="card-verify-photo">
      </div>
      <div class="card-center-text">
        <p>The Khawrai Falahi Committee UAE was established in December 2016.
        The purpose of the committee is to address the issues faced by residents
        of Khawrai in the United Arab Emirates and its surroundings, and to
        resolve them in a timely and professional manner. The leadership of
        the committee is committed to serving the residents of Khawrai in
        the United Arab Emirates and is determined to address and resolve
        their various issues promptly.</p>
        <p class="card-urdu-text">
        متحدہ عرب امارات میں خاورئی فلاحی کمیٹی دسمبر 2016 میں قائم کی گئی تھی۔ کمیٹی کا مقصد متحدہ عرب امارات میں خاورئی اور اس کے گردونواح کے رہائشیوں کو درپیش مسائل کو حل کرنا اور انہیں بروقت اور پیشہ ورانہ انداز میں حل کرنا ہے۔</p>
      </div>
      <div class="card-contacts">
        Arbab Rizwan (President): +971 55 735 3212<br>
        Salar Khan (Vice President): +971 58 884 0090<br>
        Ahmad Aman (Acting President): +971 56 803 9690
      </div>
    </div>`;

  const actionsHTML = `
    <div class="card-action-buttons">
      <button id="${uid}_maskBtn" title="Toggle privacy mask">👁</button>
      <button id="${uid}_saveBtn" title="Save as PDF">💾</button>
    </div>`;

  ecardInner.innerHTML = `<div class="card-wrapper" id="${uid}_wrapper">${frontHTML}${backHTML}</div>${actionsHTML}`;

  ecardSpinner.style.display = "none";
  ecardInner.style.display   = "flex";

  /* Load images with fallback */
  const loadImg = (id, primary, fallback) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onerror = () => { el.onerror = null; el.src = fallback; };
    el.src = primary;
  };
  loadImg(`${uid}_photo`,   photoSrc, photoFallback);
  loadImg(`${uid}_photoSm`, photoSrc, photoFallback);
  loadImg(`${uid}_vphoto`,  photoSrc, photoFallback);
  loadImg(`${uid}_stamp`,   stampSrc, defaultStamp);
  loadImg(`${uid}_sign`,    signSrc,  defaultSign);

  /* QR code */
  const qrTemp = document.createElement("div");
  qrTemp.style.cssText = "position:absolute;left:-9999px;top:0;width:200px;height:200px;";
  document.body.appendChild(qrTemp);
  const verifyURL = `${API_BASE}/verify.html?card=${btoa(String(card.CNo))}`;
  try {
    new QRCode(qrTemp, { text:verifyURL, width:200, height:200,
      colorDark:"#000000", colorLight:"#0000", correctLevel:QRCode.CorrectLevel.H });
    setTimeout(() => {
      const qrCanvas = qrTemp.querySelector("canvas");
      const qrEl = document.getElementById(`${uid}_qr`);
      if (qrEl && qrCanvas) qrEl.src = qrCanvas.toDataURL("image/png");
      qrTemp.remove();
    }, 300);
  } catch { qrTemp.remove(); }

  /* Verify name */
  const vnameEl = document.getElementById(`${uid}_vname`);
  if (vnameEl) vnameEl.textContent = norm(card.name);

  /* Urdu name */
  let urduName = norm(card.urduName || "");
  const urduEl = document.getElementById(`${uid}_urdu`);
  const setUrdu = n => { if (urduEl) urduEl.textContent = n; };

  if (urduName) {
    setUrdu(urduName);
  } else {
    setUrdu("…");
    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ur&dt=t&q=${encodeURIComponent(norm(card.name))}`)
      .then(r => r.json())
      .then(d => { urduName = d[0][0][0]; setUrdu(urduName); })
      .catch(() => setUrdu(norm(card.name)));
  }

  /* Masking */
  let masked = false;
  const nameEl   = document.getElementById(`${uid}_name`);
  const cnoEl    = document.getElementById(`${uid}_cno`);
  const mobileEl = document.getElementById(`${uid}_mobile`);
  const maskBtn  = document.getElementById(`${uid}_maskBtn`);

  const renderMask = () => {
    const m = masked;
    if (nameEl)   nameEl.textContent   = "Name: "    + (m ? maskName(norm(card.name))        : norm(card.name));
    if (cnoEl)    cnoEl.textContent    = "Card No.: " + (m ? maskCardNo(norm(card.CNo))      : norm(card.CNo));
    if (mobileEl) mobileEl.textContent = "Contact: "  + (m ? maskPhone(norm(card.mobile||"")): norm(card.mobile||""));
    if (urduEl)   urduEl.textContent   = m ? maskName(urduName || norm(card.name)) : (urduName || norm(card.name));
    if (vnameEl)  vnameEl.textContent  = m ? maskName(norm(card.name)) : norm(card.name);
    if (maskBtn)  maskBtn.textContent  = m ? "🙈" : "👁";
  };
  renderMask();
  if (maskBtn) maskBtn.addEventListener("click", () => { masked = !masked; renderMask(); });

  /* Save PDF */
  const saveBtn = document.getElementById(`${uid}_saveBtn`);
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const old = saveBtn.textContent;
      saveBtn.disabled = true; saveBtn.textContent = "⏳";
      try {
        await saveCardAsPdf(card, document.getElementById(`${uid}_front`), document.getElementById(`${uid}_back`));
      } catch (e) { console.error("PDF error:", e); }
      finally { saveBtn.disabled = false; saveBtn.textContent = old; }
    });
  }

  scaleMobileCard();
};

/* ─── Mask helpers ─────────────────────────────────────── */
function maskName(n) {
  if (!n) return "";
  const p = n.trim().split(/\s+/);
  if (p.length <= 1) return "***";
  if (p.length === 2) return "*** ***";
  return ["***", ...p.slice(1,-1), "***"].join(" ");
}
function maskCardNo(v) { return v ? v.replace(/(\d{3})(?!.*\d)/, "***") : ""; }
function maskPhone(v)  { return v ? v.replace(/(\d{4})(?!.*\d)/, "****") : ""; }

/* ─── Mobile card scale ────────────────────────────────── */
function scaleMobileCard() {
  const isMobile   = window.innerWidth <= 680;
  const overlayW   = ecardOverlayBox ? ecardOverlayBox.clientWidth : window.innerWidth;
  const scale      = isMobile ? Math.min((overlayW - 32) / 610, 1) : 1;

  if (ecardOverlayBox) {
    ecardOverlayBox.style.justifyContent = "center";
    ecardOverlayBox.style.alignItems     = "center";
  }
  if (ecardInner) {
    ecardInner.style.width       = "100%";
    ecardInner.style.alignItems  = "center";
  }
  document.querySelectorAll("#ecardInner .ecard-container").forEach(el => {
    el.style.transformOrigin = "center top";
    el.style.transform       = isMobile ? `scale(${scale})` : "";
    el.style.marginBottom    = isMobile ? `${-(400 * (1 - scale))}px` : "";
  });
}

/* ─── Close overlay ────────────────────────────────────── */
function closeCardOverlay() {
  if (!ecardOverlay) return;
  ecardOverlay.classList.remove("show");
  ecardOverlay.setAttribute("aria-hidden","true");
  ecardInner.innerHTML       = "";
  ecardInner.style.display   = "none";
  ecardSpinner.style.display = "flex";
}

/* ═══════════════════════════════════════════════════════════════
   PRINT
═══════════════════════════════════════════════════════════════ */
function doPrint() {
  const hasResults = !!(currentUser && norm(searchInput?.value) !== "" && resultContainer && resultContainer.querySelector("table"));
  if (!hasResults) return;
  closeCardOverlay();
  window.print();
}

/* ═══════════════════════════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════════════════════════ */
function bindEvents() {
  /* Theme */
  themeToggleBtn?.addEventListener("click", e => {
    e.stopPropagation();
    applyTheme(document.body.classList.contains("dark-mode") ? "light" : "dark");
  });

  /* User dropdown */
  userArea?.addEventListener("click", e => {
    e.stopPropagation();
    userDropdown?.classList.toggle("show");
  });
  document.addEventListener("click", () => userDropdown?.classList.remove("show"));
  userDropdown?.addEventListener("click", e => e.stopPropagation());

  /* Login */
  openLoginBtn?.addEventListener("click", () => loginOverlay?.classList.add("show"));
  loginOverlay?.addEventListener("click", e => {
    if (e.target === loginOverlay) loginOverlay.classList.remove("show");
  });
  loginBtn?.addEventListener("click", doLogin);
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && loginOverlay?.classList.contains("show")) doLogin();
  });

  /* Logout */
  logoutBtn?.addEventListener("click", () => { clearSession(); currentUser = null; location.reload(); });

  /* View photo */
  viewPhotoBtn?.addEventListener("click", () => {
    photoOverlay?.classList.add("show");
    userDropdown?.classList.remove("show");
  });
  closePhotoOverlay?.addEventListener("click", () => photoOverlay?.classList.remove("show"));
  photoOverlay?.addEventListener("click", e => {
    if (e.target === photoOverlay) photoOverlay.classList.remove("show");
  });

  /* Search */
  searchInput?.addEventListener("input", handleSearch);
  searchField?.addEventListener("change", handleSearch);
  searchButton?.addEventListener("click", handleSearch);
  csvButton?.addEventListener("click", exportCSV);
  printButton?.addEventListener("click", doPrint);

  document.querySelectorAll('input[type="radio"][name="memberFilter"]').forEach(r => {
    r.addEventListener("change", handleSearch);
  });

  /* Constitution buttons */
  englishConstitution?.addEventListener("click", () => window.open(`${API_BASE}/English.pdf`, "_blank"));
  urduConstitution?.addEventListener("click",    () => window.open(`${API_BASE}/Urdu.pdf`,    "_blank"));

  /* Generate / All cards */
  generateButton?.addEventListener("click", () => {
    if (!generateButton.disabled) window.location.href = "NewCard/login.html";
  });
  allCardsBtn?.addEventListener("click", () => {
    if (!allCardsBtn.disabled) window.location.href = "AllCards.html";
  });
  emirates?.addEventListener("click", () => {
    if (!emirates.disabled) window.location.href = "EmiratesID.html";
  });

  /* e-Card overlay close */
  ecardCloseBtn?.addEventListener("click", closeCardOverlay);
  ecardOverlay?.addEventListener("click", e => {
    if (e.target === ecardOverlay) closeCardOverlay();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeCardOverlay(); });

  /* Mobile resize */
  window.addEventListener("resize",            scaleMobileCard);
  window.addEventListener("orientationchange", scaleMobileCard);

  /* Page load animation */
  window.addEventListener("load", () => document.body.classList.add("loaded"));
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
async function init() {
  cacheDOM();
  initTheme();
  bindEvents();
  await loadData();
  checkSession();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
