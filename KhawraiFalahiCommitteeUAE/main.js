let users = [];
let currentUser = null;

const API_BASE = "https://livenews.live/KFC";
const PHOTOS_BASE = `${API_BASE}/static/images/photos/`;
const DEFAULT_PHOTO = `${PHOTOS_BASE}default.png`;
const CARD_LOGO = "logo.png";

const THEME_STORAGE_KEY = "kfcTheme";
const TRANSLATION_STORAGE_KEY = "kfcPageLanguage";

const WRONG_URDU_NAME = "خواری فلاحی کمیٹی";
const CORRECT_URDU_NAME = "خاورئی فلاحی کمیٹی";

const WRONG_ENGLISH_NAME = "Khawarai Welfare Committee";
const CORRECT_ENGLISH_NAME = "Khawrai Falahi Committee";

const WRONG_ENGLISH_CONSTITUTION = "Recipe (English)";
const CORRECT_ENGLISH_CONSTITUTION = "Constitution (English)";

const WRONG_ENGLISH_TRANSLATED = "Order (Translated)";
const CORRECT_ENGLISH_TRANSLATED = "Constitution (Translated)";

const ANDROID_APP_URL = "https://livenews.live/KFC/Apps/Khawrai.apk";
const IOS_APP_URL = "https://livenews.live/KFC/Apps/KhawraiFalahi.mobileconfig";

let currentPageLanguage = localStorage.getItem(TRANSLATION_STORAGE_KEY) === "ur" ? "ur" : "en";
let googleTranslateLoadPromise = null;
let translatePending = null;
let translationRefreshTimer = null;
let translationMutationObserver = null;
let translationFixRunning = false;

let userArea,
    usernameText,
    dropdown,
    guestView,
    userView,
    openLoginBtn,
    loginOverlay,
    loginBtn,
    loginUsername,
    loginPassword,
    loginError,
    logoutBtn,
    userFullName,
    userCard,
    userDesg,
    userBlood,
    userMobile,
    welcomePopup,
    welcomeText,
    totalMembers,
    activeMembers,
    leadersCount,
    headerProfileImg,
    headerUserIcon,
    dropdownProfileImg,
    viewPhotoBtn,
    photoOverlay,
    fullProfileImg,
    closePhotoOverlay,
    notificationBtn,
    notiDropdown,
    notiBadge,
    notiList,
    msgBtn,
    msgDropdown,
    msgBadge,
    msgList,
    leadersBtn,
    leadersOverlay,
    closeLeaders,
    leadersList,
    themeToggleBtn,
    themeToggleIcon,
    translateToggleBtn,
    translateToggleIcon,
    translateHost,
    androidQrMain,
    iosQrMain,
    androidMainDownload,
    iosMainDownload;

function cacheElements() {
    userArea = document.getElementById("userArea");
    usernameText = document.getElementById("username");
    dropdown = document.getElementById("userDropdown");
    guestView = document.getElementById("guestView");
    userView = document.getElementById("userView");
    openLoginBtn = document.getElementById("openLoginBtn");
    loginOverlay = document.getElementById("loginOverlay");
    loginBtn = document.getElementById("loginBtn");
    loginUsername = document.getElementById("loginUsername");
    loginPassword = document.getElementById("loginPassword");
    loginError = document.getElementById("loginError");
    logoutBtn = document.getElementById("logoutBtn");
    userFullName = document.getElementById("userFullName");
    userCard = document.getElementById("userCard");
    userDesg = document.getElementById("userDesg");
    userBlood = document.getElementById("userBlood");
    userMobile = document.getElementById("userMobile");
    welcomePopup = document.getElementById("welcomePopup");
    welcomeText = document.getElementById("welcomeText");
    totalMembers = document.getElementById("totalMembers");
    activeMembers = document.getElementById("activeMembers");
    leadersCount = document.getElementById("leadersCount");

    headerProfileImg = document.getElementById("headerProfileImg");
    headerUserIcon = document.getElementById("headerUserIcon");
    dropdownProfileImg = document.getElementById("dropdownProfileImg");
    viewPhotoBtn = document.getElementById("viewPhotoBtn");
    photoOverlay = document.getElementById("photoOverlay");
    fullProfileImg = document.getElementById("fullProfileImg");
    closePhotoOverlay = document.getElementById("closePhotoOverlay");

    notificationBtn = document.getElementById("notificationBtn");
    notiDropdown = document.getElementById("notiDropdown");
    notiBadge = document.getElementById("notiBadge");
    notiList = document.getElementById("notiList");
    msgBtn = document.getElementById("msgBtn");
    msgDropdown = document.getElementById("msgDropdown");
    msgBadge = document.getElementById("msgBadge");
    msgList = document.getElementById("msgList");

    leadersBtn = document.getElementById("leadersBtn");
    leadersOverlay = document.getElementById("leadersOverlay");
    closeLeaders = document.getElementById("closeLeaders");
    leadersList = document.getElementById("leadersList");

    themeToggleBtn = document.getElementById("themeToggleBtn");
    themeToggleIcon = document.getElementById("themeToggleIcon");
    translateToggleBtn = document.getElementById("translateToggleBtn");
    translateToggleIcon = document.getElementById("translateToggleIcon");
    translateHost = document.getElementById("google_translate_element");

    androidQrMain = document.getElementById("androidQrMain");
    iosQrMain = document.getElementById("iosQrMain");
    androidMainDownload = document.getElementById("androidMainDownload");
    iosMainDownload = document.getElementById("iosMainDownload");
}

function isCancelledStatus(status) {
    const s = (status || "").toString().trim().toLowerCase();
    return s === "cancel" || s === "cancelled";
}

function normalizeText(value) {
    return (value || "").toString().trim();
}

function generateUsername(name) {
    const parts = normalizeText(name).toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return normalizeText(name).toLowerCase();
    const first = parts[0];
    const last = parts[parts.length - 1];
    return (first + last).replace(/\s/g, "");
}

function generatePassword(card) {
    if (!card) return "";
    const parts = String(card).split("-");
    return parts[parts.length - 1] || "";
}

function safeCardNo(cardNo) {
    return encodeURIComponent(String(cardNo || ""));
}

function getCardImageCandidates(cardNo) {
    const clean = safeCardNo(cardNo);
    return [
        `${PHOTOS_BASE}${clean}.png`,
        `${PHOTOS_BASE}${clean}.jpg`,
        DEFAULT_PHOTO
    ];
}

function setImageWithFallback(img, sources, fallbackIconEl) {
    if (!img) return;

    let index = 0;

    const tryNext = () => {
        if (index >= sources.length) {
            img.style.display = "none";
            if (fallbackIconEl) fallbackIconEl.style.display = "block";
            return;
        }
        img.src = sources[index++];
    };

    img.onerror = () => {
        tryNext();
    };

    img.onload = () => {
        img.style.display = "block";
        if (fallbackIconEl) fallbackIconEl.style.display = "none";
    };

    tryNext();
}

function applyProfileImage(cardNo) {
    const sources = getCardImageCandidates(cardNo);
    setImageWithFallback(headerProfileImg, sources, headerUserIcon);
    setImageWithFallback(dropdownProfileImg, sources, null);
    setImageWithFallback(fullProfileImg, sources, null);
}

function showWelcome(name) {
    if (!welcomePopup || !welcomeText) return;
    welcomeText.innerText = `Welcome, ${name} 👋`;
    welcomePopup.classList.add("show");
    setTimeout(() => welcomePopup.classList.remove("show"), 2500);
    refreshTranslatedView();
}

function calculateStats() {
    if (totalMembers) totalMembers.innerText = users.length;

    const active = users.filter(u => normalizeText(u.Status).toLowerCase() === "active");
    if (activeMembers) activeMembers.innerText = active.length;

    const allowedRoles = [
        "president",
        "acting president",
        "vice president",
        "committee guardian",
        "committee guardian (ex-pr)",
        "general secretary",
        "finance manager",
        "joint finance secretary",
        "media manager"
    ];

    const leaders = users.filter(u => {
        const desg = normalizeText(u.Desg).toLowerCase();
        return allowedRoles.includes(desg);
    });

    if (leadersCount) leadersCount.innerText = leaders.length;
}

function closeAllDropdowns() {
    if (dropdown) dropdown.classList.remove("show");
    if (notiDropdown) notiDropdown.classList.remove("show");
    if (msgDropdown) msgDropdown.classList.remove("show");
}

function showLoggedOutUI() {
    if (msgBtn) msgBtn.style.display = "none";
    if (notificationBtn) notificationBtn.style.display = "none";
    if (headerProfileImg) headerProfileImg.style.display = "none";
    if (headerUserIcon) headerUserIcon.style.display = "block";
    if (guestView) guestView.style.display = "block";
    if (userView) userView.style.display = "none";
    if (usernameText) usernameText.innerText = "Welcome, Guest";
}

function showLoggedInUI() {
    if (msgBtn) msgBtn.style.display = "flex";
    if (notificationBtn) notificationBtn.style.display = "flex";
    if (guestView) guestView.style.display = "none";
    if (userView) userView.style.display = "flex";
}

function renderUserToUI(user) {
    if (!user) return;

    const firstName = normalizeText(user.name).split(" ")[0] || "User";

    if (usernameText) usernameText.innerText = `Welcome, ${firstName}`;
    if (userFullName) userFullName.innerText = `Welcome, ${user.name}`;
    if (userCard) userCard.innerText = `Card Number: ${user.CNo}`;
    if (userDesg) userDesg.innerText = `Designation: ${user.Desg}`;
    if (userBlood) userBlood.innerText = `Blood Group: ${user.BG || "Not available"}`;
    if (userMobile) userMobile.innerText = `Registered Mobile: ${user.mobile || "Not available"}`;

    applyProfileImage(user.CNo);

    const viewCardBtn = document.getElementById("viewCardBtn");
    if (viewCardBtn) {
        viewCardBtn.href = `viewcard.html?card=${btoa(String(user.CNo))}`;
        viewCardBtn.target = "_blank";
    }

    showLoggedInUI();
    refreshTranslatedView();
}

function saveSession(user) {
    localStorage.setItem("kfcUser", JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem("kfcUser");
}

function escapeHTML(str) {
    return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDateValue(value) {
    return normalizeText(value) || "No date";
}

function createCardBackgroundLogo() {
    const img = document.createElement("img");
    img.src = CARD_LOGO;
    img.alt = "background logo";
    img.setAttribute("aria-hidden", "true");
    img.style.cssText = `
        position:absolute;
        top:50%;
        left:50%;
        transform:translate(-50%, -50%);
        width:60%;
        opacity:0.08;
        z-index:1;
        pointer-events:none;
        user-select:none;
    `;
    return img;
}

function createCardTopStripe() {
    const stripe = document.createElement("div");
    stripe.style.cssText = "background-color:#0d3c91; height:6px;";
    return stripe;
}

function buildCenteredInfoMessage(text) {
    return `<p style="text-align:center; padding:20px; color:#888;">${escapeHTML(text)}</p>`;
}

function setDocumentDirection() {
    const rtl = currentPageLanguage === "ur";
    document.documentElement.lang = rtl ? "ur" : "en";
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("page-rtl", rtl);

    if (translateToggleBtn) {
        translateToggleBtn.classList.toggle("active", rtl);
        translateToggleBtn.setAttribute(
            "aria-label",
            rtl ? "Switch to English" : "Translate page to Urdu"
        );
        translateToggleBtn.title = rtl ? "Switch to English" : "Translate page to Urdu";
    }

    if (translateToggleIcon) {
        translateToggleIcon.className = "fa-solid fa-language";
    }
}

function applyTheme(mode) {
    const dark = mode === "dark";
    document.body.classList.toggle("dark-mode", dark);
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
    if (themeToggleIcon) {
        themeToggleIcon.className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
        applyTheme(savedTheme);
        return;
    }

    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
}

function toggleTheme() {
    const isDark = document.body.classList.contains("dark-mode");
    applyTheme(isDark ? "light" : "dark");
}

function setPageLanguage(lang) {
    currentPageLanguage = lang === "ur" ? "ur" : "en";
    localStorage.setItem(TRANSLATION_STORAGE_KEY, currentPageLanguage);
    setDocumentDirection();
    scheduleTranslationNormalization();
}

function replaceKnownUrduTerms(root = document.body) {
    if (currentPageLanguage !== "ur" || !root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const replacements = [
        [WRONG_URDU_NAME, CORRECT_URDU_NAME],
        ["Khawrai Falahi Committee", CORRECT_URDU_NAME],
        ["Khawarai Welfare Committee", CORRECT_URDU_NAME],
        ["Khawrai", "خاورئی"],
        ["Constitution", "دستور"]
    ];

    const nodes = [];
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    nodes.forEach(node => {
        let text = node.nodeValue;
        if (!text) return;

        let updated = text;
        replacements.forEach(([from, to]) => {
            if (updated.includes(from)) {
                updated = updated.split(from).join(to);
            }
        });

        if (updated !== text) {
            node.nodeValue = updated;
        }
    });
}

function replaceKnownEnglishTerms(root = document.body) {
    if (currentPageLanguage !== "en" || !root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const replacements = [
        [WRONG_ENGLISH_NAME, CORRECT_ENGLISH_NAME],
        ["Khawarai Welfare Committee UAE", "Khawrai Falahi Committee UAE"],
        ["Khawarai Welfare Committee", CORRECT_ENGLISH_NAME],
        [WRONG_ENGLISH_CONSTITUTION, CORRECT_ENGLISH_CONSTITUTION],
        [WRONG_ENGLISH_TRANSLATED, CORRECT_ENGLISH_TRANSLATED]
    ];

    const nodes = [];
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    nodes.forEach(node => {
        let text = node.nodeValue;
        if (!text) return;

        let updated = text;
        replacements.forEach(([from, to]) => {
            if (updated.includes(from)) {
                updated = updated.split(from).join(to);
            }
        });

        if (updated !== text) {
            node.nodeValue = updated;
        }
    });
}

function applyTranslationFixes(root = document.body) {
    if (!root) return;
    if (translationFixRunning) return;

    translationFixRunning = true;
    try {
        if (currentPageLanguage === "ur") {
            replaceKnownUrduTerms(root);
        } else {
            replaceKnownEnglishTerms(root);
        }
    } finally {
        setTimeout(() => {
            translationFixRunning = false;
        }, 0);
    }
}

function scheduleTranslationNormalization() {
    clearTimeout(translationRefreshTimer);
    translationRefreshTimer = setTimeout(() => {
        applyTranslationFixes(document.body);
    }, 120);
}

function startTranslationObserver() {
    if (translationMutationObserver || !window.MutationObserver || !document.body) return;

    translationMutationObserver = new MutationObserver(() => {
        if (translationFixRunning) return;
        scheduleTranslationNormalization();
    });

    translationMutationObserver.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true
    });
}

function applyGoogleTranslation(lang) {
    const combo = document.querySelector(".goog-te-combo");
    if (!combo) return false;

    combo.value = lang;
    combo.dispatchEvent(new Event("change"));
    setPageLanguage(lang);
    return true;
}

function applyGoogleTranslationWithRetry(lang, attempt = 0) {
    if (applyGoogleTranslation(lang)) {
        setTimeout(() => applyTranslationFixes(document.body), 250);
        return;
    }

    if (attempt < 20) {
        setTimeout(() => applyGoogleTranslationWithRetry(lang, attempt + 1), 200);
    } else {
        translatePending = lang;
    }
}

function ensureGoogleTranslateWidget() {
    if (googleTranslateLoadPromise) return googleTranslateLoadPromise;

    googleTranslateLoadPromise = new Promise((resolve, reject) => {
        if (window.google && window.google.translate && document.querySelector(".goog-te-combo")) {
            resolve();
            return;
        }

        window.googleTranslateElementInit = function () {
            try {
                if (translateHost) {
                    translateHost.innerHTML = "";
                }

                new google.translate.TranslateElement(
                    {
                        pageLanguage: "en",
                        includedLanguages: "ur,en",
                        autoDisplay: false
                    },
                    "google_translate_element"
                );

                resolve();

                if (translatePending) {
                    const pending = translatePending;
                    translatePending = null;
                    setTimeout(() => applyGoogleTranslationWithRetry(pending), 250);
                }
            } catch (error) {
                reject(error);
            }
        };

        const existing = document.getElementById("kfc-google-translate-script");
        if (existing) return;

        const script = document.createElement("script");
        script.id = "kfc-google-translate-script";
        script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
        script.async = true;
        script.onerror = () => reject(new Error("Translator could not be loaded."));
        document.head.appendChild(script);
    });

    return googleTranslateLoadPromise;
}

async function toggleTranslation() {
    const targetLang = currentPageLanguage === "ur" ? "en" : "ur";
    translatePending = targetLang;

    try {
        await ensureGoogleTranslateWidget();
        applyGoogleTranslationWithRetry(targetLang);
    } catch (error) {
        console.error("Translation error:", error);
    }
}

function refreshTranslatedView() {
    clearTimeout(translationRefreshTimer);
    translationRefreshTimer = setTimeout(() => {
        applyTranslationFixes(document.body);
    }, 120);
}

function translateTextValue(...values) {
    for (const value of values) {
        const text = normalizeText(value);
        if (text) return text;
    }
    return "";
}

function renderQRCode(element, text) {
    if (!element) return;

    element.innerHTML = "";

    if (typeof QRCode === "undefined") {
        const fallback = document.createElement("a");
        fallback.href = text;
        fallback.textContent = text;
        fallback.target = "_blank";
        fallback.rel = "noopener noreferrer";
        fallback.style.cssText = "word-break:break-all; text-align:center; font-size:12px;";
        element.appendChild(fallback);
        return;
    }

    new QRCode(element, {
        text,
        width: 120,
        height: 120,
        colorDark: "#111111",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });
}

function renderAppQRCodes() {
    renderQRCode(androidQrMain, ANDROID_APP_URL);
    renderQRCode(iosQrMain, IOS_APP_URL);

    if (androidMainDownload) {
        androidMainDownload.href = ANDROID_APP_URL;
        androidMainDownload.setAttribute("download", "Khawrai.apk");
    }
    if (iosMainDownload) {
        iosMainDownload.href = IOS_APP_URL;
        iosMainDownload.setAttribute("download", "KhawraiFalahi.mobileconfig");
    }
}

async function loadUsers() {
    try {
        const res = await fetch(`${API_BASE}/cards.json`, { cache: "no-store" });
        users = await res.json();
        calculateStats();
    } catch (e) {
        console.error("Error loading JSON:", e);
    }
}

function login() {
    if (loginError) loginError.innerText = "";

    const uname = normalizeText(loginUsername?.value).toLowerCase();
    const pass = normalizeText(loginPassword?.value);

    if (!uname || !pass) {
        if (loginError) loginError.innerText = "Enter username and password";
        refreshTranslatedView();
        return;
    }

    const user = users.find(u => {
        const genUser = generateUsername(u.name);
        const genPass = generatePassword(u.CNo);
        return genUser === uname && genPass === pass;
    });

    if (!user) {
        if (loginError) loginError.innerText = "Invalid credentials";
        refreshTranslatedView();
        return;
    }

    if (isCancelledStatus(user.Status)) {
        if (loginError) loginError.innerText = "This account cannot log in because the card is cancelled";
        refreshTranslatedView();
        return;
    }

    currentUser = user;
    saveSession(user);
    renderUserToUI(user);
    showWelcome(user.name);

    if (loginOverlay) loginOverlay.classList.remove("show");
    refreshTranslatedView();
}

function checkSession() {
    const saved = localStorage.getItem("kfcUser");

    if (!saved) {
        currentUser = null;
        showLoggedOutUI();
        return;
    }

    try {
        const parsed = JSON.parse(saved);

        if (parsed && !isCancelledStatus(parsed.Status)) {
            currentUser = parsed;
            renderUserToUI(parsed);
            return;
        }

        clearSession();
        currentUser = null;
        showLoggedOutUI();
    } catch (error) {
        console.error("Session parse error:", error);
        clearSession();
        currentUser = null;
        showLoggedOutUI();
    }
}

async function downloadNotificationAsImage(element, fileName) {
    if (typeof html2canvas === "undefined") {
        console.error("html2canvas is missing.");
        return;
    }

    const clone = element.cloneNode(true);

    clone.style.position = "absolute";
    clone.style.left = "-99999px";
    clone.style.top = "0";
    clone.style.display = "block";
    clone.style.visibility = "visible";
    clone.style.pointerEvents = "none";
    clone.style.width = `${element.getBoundingClientRect().width}px`;
    clone.style.maxWidth = "none";
    clone.style.margin = "0";
    clone.style.transform = "none";

    const cloneBody = clone.querySelector(".noti-body, .msg-body");
    if (cloneBody) cloneBody.style.display = "block";

    document.body.appendChild(clone);

    try {
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(clone, {
            scale: 5,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            scrollX: 0,
            scrollY: 0,
            width: clone.scrollWidth,
            height: clone.scrollHeight,
            windowWidth: document.documentElement.clientWidth,
            windowHeight: document.documentElement.clientHeight
        });

        const link = document.createElement("a");
        link.download = fileName;
        link.href = canvas.toDataURL("image/png", 1.0);
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (error) {
        console.error("Download error:", error);
    } finally {
        clone.remove();
    }
}

async function fetchAlerts() {
    try {
        const response = await fetch(`${API_BASE}/message/alerts.json`, { cache: "no-store" });
        const alerts = await response.json();

        if (!notiList) return;

        notiList.innerHTML = "";
        notiList.style.height = "auto";
        notiList.style.maxHeight = "500px";
        notiList.style.overflowY = "auto";

        if (!Array.isArray(alerts) || alerts.length === 0) {
            notiList.innerHTML = buildCenteredInfoMessage("No alerts found.");
            refreshTranslatedView();
            return;
        }

        const sortedAlerts = [...alerts].reverse();

        sortedAlerts.slice(0, 3).forEach(latest => {
            const rtl = currentPageLanguage === "ur";
            const item = document.createElement("div");
            item.className = "noti-item";
            item.style.cssText = `
                position: relative;
                background-color: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                margin-bottom: 10px;
                overflow: hidden;
                height: auto;
                min-height: 50px;
                transition: all 0.3s ease;
                direction: ${rtl ? "rtl" : "ltr"};
                text-align: ${rtl ? "right" : "left"};
            `;

            item.appendChild(createCardTopStripe());
            item.appendChild(createCardBackgroundLogo());

            const topRow = document.createElement("div");
            topRow.className = "noti-top-row";
            topRow.style.cssText = `
                padding: 12px 15px;
                display:flex;
                justify-content: space-between;
                align-items: center;
                flex-direction: ${rtl ? "row-reverse" : "row"};
                position: relative;
                z-index: 2;
                cursor: pointer;
            `;

            const leftWrap = document.createElement("div");
            leftWrap.style.cssText = "display:flex; align-items:center; gap:10px;";

            const title = document.createElement("span");
            title.className = "noti-title";
            title.style.cssText = "font-weight:bold; color:#0d3c91; font-size:15px;";
            title.textContent = translateTextValue(latest.title_en, latest.title, latest.title_ur, "Alert");

            leftWrap.appendChild(title);

            const rightWrap = document.createElement("div");
            rightWrap.style.cssText = "display:flex; align-items:center; gap:12px;";

            const downloadBtn = document.createElement("i");
            downloadBtn.className = "fa-solid fa-download download-btn";
            downloadBtn.title = "Download";
            downloadBtn.style.cssText = "cursor:pointer; font-size:16px; color:#7873f5; z-index:3;";

            const dateSpan = document.createElement("span");
            dateSpan.className = "noti-date";
            dateSpan.style.cssText = "font-size:11px; color:#888;";
            dateSpan.textContent = formatDateValue(latest.date);

            rightWrap.appendChild(downloadBtn);
            rightWrap.appendChild(dateSpan);

            topRow.appendChild(leftWrap);
            topRow.appendChild(rightWrap);

            const body = document.createElement("div");
            body.className = "noti-body";
            body.setAttribute("lang", currentPageLanguage === "ur" ? "ur" : "en");
            body.style.cssText = `
                display:none;
                padding: 15px;
                border-top:1px dashed #eee;
                white-space:pre-line;
                position: relative;
                z-index: 2;
                font-size: 14px;
                line-height: 1.8;
                color: #333;
            `;

            body.innerHTML = `
                ${escapeHTML(translateTextValue(latest.body_en, latest.body, latest.body_ur))}
                <div style="margin-top:20px; font-size:10px; color:#aaa; text-align:center; border-top:1px solid #f0f0f0; padding-top:5px;">
                    Khawrai Falahi Committee UAE
                </div>
            `;

            item.appendChild(topRow);
            item.appendChild(body);

            downloadBtn.addEventListener("click", async e => {
                e.stopPropagation();

                const downloadCard = item.cloneNode(true);
                downloadCard.style.position = "absolute";
                downloadCard.style.left = "-99999px";
                downloadCard.style.top = "0";
                downloadCard.style.display = "block";
                downloadCard.style.visibility = "visible";
                downloadCard.style.width = `${item.getBoundingClientRect().width}px`;

                const downloadBody = downloadCard.querySelector(".noti-body");
                if (downloadBody) downloadBody.style.display = "block";

                document.body.appendChild(downloadCard);

                const cleanDate = String(latest.date || "alert").replace(/[^\w\-]+/g, "_");
                await downloadNotificationAsImage(downloadCard, `Alert-${cleanDate}.png`);

                setTimeout(() => {
                    if (downloadCard && downloadCard.parentNode) {
                        downloadCard.remove();
                    }
                }, 100);
            });

            item.addEventListener("click", () => {
                const isVisible = body.style.display === "block";

                document.querySelectorAll(".noti-body").forEach(el => {
                    el.style.display = "none";
                });

                document.querySelectorAll(".noti-item").forEach(el => {
                    el.style.backgroundColor = "#ffffff";
                });

                if (!isVisible) {
                    body.style.display = "block";
                    item.style.backgroundColor = "#f9f9ff";
                }
            });

            notiList.appendChild(item);
        });

        const alertsButtonWrap = document.createElement("div");
        alertsButtonWrap.style.cssText = `
            margin-top: 12px;
            text-align: center;
            padding: 6px 0 2px;
        `;

        const alertsButton = document.createElement("button");
        alertsButton.id = "seeAllAlertsBtn";
        alertsButton.type = "button";
        alertsButton.innerText = "Click here to see all alerts";
        alertsButton.style.cssText = `
            width: 100%;
            padding: 10px 14px;
            border: none;
            border-radius: 999px;
            background: linear-gradient(90deg, #ff6ec4, #7873f5);
            color: #fff;
            font-weight: bold;
            cursor: pointer;
            font-size: 13px;
            box-shadow: 0 8px 18px rgba(120, 115, 245, 0.18);
        `;

        alertsButton.addEventListener("click", e => {
            e.stopPropagation();
            window.location.href = "message/alerts.html";
        });

        alertsButtonWrap.appendChild(alertsButton);
        notiList.appendChild(alertsButtonWrap);

        refreshTranslatedView();
    } catch (error) {
        console.error("Alerts error:", error);
        if (notiList) {
            notiList.innerHTML = buildCenteredInfoMessage("Error loading alerts.");
        }
    }
}

async function fetchPersonalMessages() {
    try {
        const response = await fetch(`${API_BASE}/messages.json`, { cache: "no-store" });
        const messages = await response.json();

        if (!msgList) return;

        msgList.innerHTML = "";

        if (!currentUser) {
            msgList.innerHTML = buildCenteredInfoMessage("Please sign in to view your messages");
            if (msgBadge) msgBadge.style.display = "none";
            refreshTranslatedView();
            return;
        }

        const myMessages = (Array.isArray(messages) ? messages : []).filter(m => {
            const cardNumber = normalizeText(m.cardNumber).toLowerCase();
            return cardNumber === normalizeText(currentUser.CNo).toLowerCase() || cardNumber === "all";
        });

        if (myMessages.length === 0) {
            msgList.innerHTML = buildCenteredInfoMessage("No messages found.");
            refreshTranslatedView();
            return;
        }

        myMessages.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        myMessages.forEach(msg => {
            const rtl = currentPageLanguage === "ur";
            const item = document.createElement("div");
            item.className = "noti-item msg-item";
            item.style.cssText = `
                position:relative;
                background-color:#ffffff;
                border:1px solid #e0e0e0;
                border-radius:8px;
                margin-bottom:10px;
                overflow:hidden;
                height:auto;
                min-height:50px;
                transition:all 0.3s ease;
                direction:${rtl ? "rtl" : "ltr"};
                text-align:${rtl ? "right" : "left"};
            `;

            item.appendChild(createCardTopStripe());
            item.appendChild(createCardBackgroundLogo());

            const isGlobal = normalizeText(msg.cardNumber).toLowerCase() === "all";
            const typeLabel = isGlobal
                ? '<span style="color:#ff6ec4; font-size:10px;">[Public]</span>'
                : '<span style="color:#7873f5; font-size:10px;">[Private]</span>';

            const topRow = document.createElement("div");
            topRow.className = "noti-top-row";
            topRow.style.cssText = `
                padding: 12px 15px;
                display:flex;
                flex-direction:column;
                align-items:${rtl ? "flex-end" : "flex-start"};
                gap:4px;
                position:relative;
                z-index:2;
                cursor:pointer;
            `;

            const dateSpan = document.createElement("span");
            dateSpan.className = "msg-date";
            dateSpan.style.cssText = "font-size:11px; color:#888;";
            dateSpan.innerHTML = `${escapeHTML(formatDateValue(msg.date))} ${typeLabel}`;

            const title = document.createElement("strong");
            title.className = "msg-title";
            title.style.cssText = "color:#0d3c91; font-size:15px; display:flex; align-items:center; gap:5px;";

            const icon = document.createElement("i");
            icon.className = "fa-solid fa-chevron-right icon-rotate";
            icon.style.cssText = "font-size:10px;";

            const titleText = document.createElement("span");
            titleText.textContent = translateTextValue(msg.title_en, msg.title, msg.title_ur, "Message");

            title.appendChild(icon);
            title.appendChild(titleText);

            topRow.appendChild(dateSpan);
            topRow.appendChild(title);

            const body = document.createElement("div");
            body.className = "msg-body";
            body.setAttribute("lang", currentPageLanguage === "ur" ? "ur" : "en");
            body.style.cssText = `
                display:none;
                padding:15px;
                border-top:1px dashed #ccc;
                position:relative;
                z-index:2;
                font-size:13px;
                color:#444;
                line-height:1.8;
                white-space:pre-line;
            `;
            body.innerHTML = escapeHTML(translateTextValue(msg.body_en, msg.body, msg.body_ur));

            item.appendChild(topRow);
            item.appendChild(body);

            item.addEventListener("click", () => {
                const isVisible = body.style.display === "block";

                document.querySelectorAll(".msg-body").forEach(el => {
                    el.style.display = "none";
                });

                document.querySelectorAll(".icon-rotate").forEach(i => {
                    i.className = "fa-solid fa-chevron-right icon-rotate";
                });

                document.querySelectorAll(".msg-item").forEach(el => {
                    el.style.backgroundColor = "#ffffff";
                });

                if (!isVisible) {
                    body.style.display = "block";
                    icon.className = "fa-solid fa-chevron-down icon-rotate";
                    item.style.backgroundColor = "#f9f9ff";
                }
            });

            msgList.appendChild(item);
        });

        const seeAllMsgs = document.createElement("div");
        seeAllMsgs.style.cssText = "text-align:center; margin-top:10px;";
        seeAllMsgs.innerHTML = `<span style="font-size:12px; color:#999;">End of messages</span>`;
        msgList.appendChild(seeAllMsgs);

        refreshTranslatedView();
    } catch (error) {
        console.error("Messages error:", error);
        if (msgList) {
            msgList.innerHTML = buildCenteredInfoMessage("Error loading messages.");
        }
    }
}

function showLeaders() {
    if (!leadersList) return;

    leadersList.innerHTML = "";

    const allowedRoles = [
        "president",
        "acting president",
        "vice president",
        "committee guardian",
        "committee guardian (ex-pr)",
        "general secretary",
        "finance manager",
        "joint finance secretary",
        "media manager"
    ];

    const leaders = users
        .filter(u => u.Desg && allowedRoles.includes(normalizeText(u.Desg).toLowerCase().trim()))
        .sort((a, b) => {
            return allowedRoles.indexOf(normalizeText(a.Desg).toLowerCase().trim()) -
                   allowedRoles.indexOf(normalizeText(b.Desg).toLowerCase().trim());
        });

    if (leaders.length === 0) {
        leadersList.innerHTML = `<p style="text-align:center; color:#888; padding:15px;">No leaders found.</p>`;
        refreshTranslatedView();
        return;
    }

    leaders.forEach(l => {
        const div = document.createElement("div");
        div.className = "leader-item";
        div.innerHTML = `
            <h4>${escapeHTML(l.name || "")}</h4>
            <p>${escapeHTML(l.Desg || "")}</p>
            <p class="leader-phone"><i class="fa-solid fa-phone"></i> ${escapeHTML(l.mobile || "Not available")}</p>
        `;
        leadersList.appendChild(div);
    });

    refreshTranslatedView();
}

function bindEvents() {
    if (userArea) {
        userArea.addEventListener("click", e => {
            e.stopPropagation();
            if (notiDropdown) notiDropdown.classList.remove("show");
            if (msgDropdown) msgDropdown.classList.remove("show");
            if (dropdown) dropdown.classList.toggle("show");
        });
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", e => {
            e.stopPropagation();
            toggleTheme();
        });
    }

    if (translateToggleBtn) {
        translateToggleBtn.addEventListener("click", e => {
            e.stopPropagation();
            toggleTranslation();
        });
    }

    if (notificationBtn) {
        notificationBtn.addEventListener("click", e => {
            e.stopPropagation();
            if (dropdown) dropdown.classList.remove("show");
            if (msgDropdown) msgDropdown.classList.remove("show");
            if (notiDropdown) notiDropdown.classList.toggle("show");

            if (!currentUser) {
                if (notiList) notiList.innerHTML = buildCenteredInfoMessage("Please sign in to view recent alerts");
                if (notiBadge) notiBadge.style.display = "none";
                refreshTranslatedView();
                return;
            }

            fetchAlerts();
            if (notiBadge) notiBadge.style.display = "none";
        });
    }

    if (msgBtn) {
        msgBtn.addEventListener("click", e => {
            e.stopPropagation();
            if (dropdown) dropdown.classList.remove("show");
            if (notiDropdown) notiDropdown.classList.remove("show");
            if (msgDropdown) msgDropdown.classList.toggle("show");

            if (!currentUser) {
                if (msgList) msgList.innerHTML = buildCenteredInfoMessage("Please sign in to view your messages");
                if (msgBadge) msgBadge.style.display = "none";
                refreshTranslatedView();
                return;
            }

            fetchPersonalMessages();
        });
    }

    if (viewPhotoBtn) {
        viewPhotoBtn.addEventListener("click", () => {
            if (photoOverlay) photoOverlay.classList.add("show");
            if (dropdown) dropdown.classList.remove("show");
        });
    }

    if (closePhotoOverlay) {
        closePhotoOverlay.addEventListener("click", () => {
            if (photoOverlay) photoOverlay.classList.remove("show");
        });
    }

    if (photoOverlay) {
        photoOverlay.addEventListener("click", e => {
            if (e.target === photoOverlay) photoOverlay.classList.remove("show");
        });
    }

    document.addEventListener("click", () => {
        closeAllDropdowns();
    });

    [dropdown, notiDropdown, msgDropdown].forEach(box => {
        if (box) {
            box.addEventListener("click", e => e.stopPropagation());
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            clearSession();
            currentUser = null;
            location.reload();
        });
    }

    if (openLoginBtn) {
        openLoginBtn.addEventListener("click", () => {
            if (loginOverlay) loginOverlay.classList.add("show");
        });
    }

    if (loginOverlay) {
        loginOverlay.addEventListener("click", e => {
            if (e.target === loginOverlay) loginOverlay.classList.remove("show");
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener("click", login);
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Enter" && loginOverlay && loginOverlay.classList.contains("show")) {
            login();
        }
    });

    if (leadersBtn && leadersOverlay && closeLeaders && leadersList) {
        leadersBtn.addEventListener("click", e => {
            e.stopPropagation();
            if (dropdown) dropdown.classList.remove("show");
            if (notiDropdown) notiDropdown.classList.remove("show");
            if (msgDropdown) msgDropdown.classList.remove("show");

            showLeaders();
            leadersOverlay.classList.add("show");
        });

        closeLeaders.addEventListener("click", e => {
            e.stopPropagation();
            leadersOverlay.classList.remove("show");
        });

        leadersOverlay.addEventListener("click", e => {
            if (e.target === leadersOverlay) leadersOverlay.classList.remove("show");
        });
    }

    if (totalMembers && totalMembers.parentElement) {
        totalMembers.parentElement.onclick = () => {
            window.location.href = `${API_BASE}/database.html`;
        };
    }

    if (activeMembers && activeMembers.parentElement) {
        activeMembers.parentElement.onclick = () => {
            window.location.href = `${API_BASE}/database.html`;
        };
    }

    window.addEventListener("load", () => {
        document.body.classList.add("loaded");
    });
}

function init() {
    cacheElements();
    initTheme();
    setDocumentDirection();
    bindEvents();
    renderAppQRCodes();
    startTranslationObserver();

    if (currentPageLanguage === "ur") {
        ensureGoogleTranslateWidget().then(() => {
            applyGoogleTranslationWithRetry("ur");
        }).catch(error => {
            console.error("Translator init error:", error);
        });
    }

    loadUsers().then(() => {
        checkSession();
        scheduleTranslationNormalization();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
