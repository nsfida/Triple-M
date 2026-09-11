/* Triplem VIP Demo Guided Chapters
 * Adds a non-invasive chapter library and slow, accurate mouse/keyboard guided lessons
 * on top of the existing accepted Demo interface. Existing app styling and controls
 * are not replaced or restyled.
 */
(function triplemDemoGuidedChapters(global) {
  "use strict";

  const doc = global.document;
  if (!doc) return;

  const sleep = ms => new Promise(resolve => global.setTimeout(resolve, ms));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const esc = value => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  const isMobile = () => global.innerWidth <= 720;
  const reduced = () => !!global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const PACE = {
    relaxed: { move: 1080, settle: 410, click: 720, lecture: 1120, type: 88, select: 700 },
    detailed: { move: 860, settle: 290, click: 590, lecture: 900, type: 70, select: 560 },
    brisk: { move: 650, settle: 190, click: 440, lecture: 700, type: 50, select: 430 }
  };
  let paceName = "detailed";
  const pace = key => {
    const base = PACE[paceName] || PACE.detailed;
    const multiplier = isMobile() ? 1.08 : 1;
    return Math.round((base[key] || 600) * multiplier);
  };

  const AREA_LABELS = {
    dashboard: "Dashboard",
    expenses: "Expenses & Wallets",
    goods: "Inventory",
    accounting: "Accounting ERP",
    audit: "Audit Report",
    "triplem-ai": "Triplem AI",
    assets: "Assets",
    loans: "Loans",
    installments: "Installments",
    notes: "Notes",
    bitcoin: "Bitcoin",
    messages: "Messages",
    admin: "Admin",
    themes: "Themes & Appearance",
    settings: "Account Settings",
    security: "Security",
    about: "About"
  };

  let running = false;
  let cancelled = false;
  let cursor = null;
  let banner = null;
  let keycap = null;
  let chooser = null;
  let chapterGate = null;
  let exerciseDock = null;
  let chapterGateResolve = null;
  let exerciseResolve = null;
  let chapterGateTimer = null;
  let chapterGateCountdown = null;
  let playBtn = null;
  let highlight = null;
  let currentArea = "dashboard";
  let currentChapterIndex = 0;
  let currentChapterTitle = "";
  let currentStep = 0;
  let totalSteps = 1;
  const lastChapterByArea = Object.create(null);
  let pendingJump = null;
  let pendingListArea = null;
  let demoPrevBtn = null;
  let demoNextBtn = null;
  let demoListBtn = null;
  let demoStatus = null;
  let demoChapterLabel = null;

  // Free, non-blocking narration using the browser/device speech engine only.
  // No neural model, WASM runtime, API key, remote TTS endpoint, or paid service is loaded.
  // We strongly prefer natural/enhanced female English voices when the browser exposes them.
  const speechSynth = global.speechSynthesis || null;
  const speechAvailable = !!(speechSynth && global.SpeechSynthesisUtterance);
  let narrationEnabled = true;
  let narrationToken = 0;
  let cachedVoices = [];
  let selectedNarrationVoice = null;
  let speechUnlocked = false;

  function refreshNarrationVoices() {
    if (!speechAvailable) return [];
    try { cachedVoices = speechSynth.getVoices() || []; } catch (_) { cachedVoices = []; }
    selectedNarrationVoice = chooseNarrationVoice(cachedVoices);
    updateDemoCard();
    return cachedVoices;
  }

  function chooseNarrationVoice(voices) {
    if (!Array.isArray(voices) || !voices.length) return null;
    const english = voices.filter(v => /^en(?:-|$)/i.test(String(v.lang || "")));
    const pool = english.length ? english : voices;
    const female = /aria|jenny|ava|emma|sonia|libby|maisie|samantha|serena|zira|hazel|susan|allison|victoria|karen|moira|tessa|fiona|veena|salli|joanna|kendra|kimberly|ivy|siri female|female/i;
    const strongFemale = /microsoft (aria|jenny|ava|sonia|libby)|aria.*natural|jenny.*natural|ava.*natural|sonia.*natural|google (uk english female|us english)|samantha|serena|victoria|zira/i;
    const male = /david|mark|guy|ryan|george|daniel|james|thomas|matthew|richard|alex|fred|ralph|aaron|arthur|male/i;
    const premium = /natural|neural|online|premium|enhanced|multilingual/i;
    const provider = /microsoft|apple|google|samsung|amazon/i;
    const preferredNatural = [
      /jenny.*natural/i, /aria.*natural/i, /ava.*natural/i, /sonia.*natural/i, /libby.*natural/i,
      /microsoft jenny.*online/i, /microsoft aria.*online/i, /microsoft ava.*online/i,
      /google uk english female/i, /google us english/i, /samantha/i, /serena/i, /victoria/i, /zira/i
    ];
    const score = voice => {
      const name = String(voice.name || "");
      const lang = String(voice.lang || "");
      let points = 0;
      const preferredIndex = preferredNatural.findIndex(rx => rx.test(name));
      if (preferredIndex >= 0) points += 520 - preferredIndex * 18;
      if (strongFemale.test(name)) points += 245;
      if (premium.test(name)) points += 185;
      if (female.test(name)) points += 150;
      if (male.test(name)) points -= 320;
      if (voice.localService === false && premium.test(name)) points += 85;
      if (/^en-US$/i.test(lang)) points += 42;
      else if (/^en-GB$/i.test(lang)) points += 38;
      else if (/^en-/i.test(lang)) points += 20;
      if (provider.test(name)) points += 22;
      if (voice.default) points += 2;
      return points;
    };
    return pool.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }

  function narrationVoice() {
    if (selectedNarrationVoice) return selectedNarrationVoice;
    const voices = cachedVoices.length ? cachedVoices : refreshNarrationVoices();
    selectedNarrationVoice = chooseNarrationVoice(voices);
    return selectedNarrationVoice;
  }

  function cleanNarrationText(text) {
    return String(text == null ? "" : text)
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  function normalizeProfessionalSpeech(text) {
    return cleanNarrationText(text)
      .replace(/\bTriplem\b/gi, "Triple M")
      .replace(/\b2FA\b/gi, "two factor authentication")
      .replace(/\bPIN\b/g, "P I N")
      .replace(/\bPDFs\b/gi, "P D F reports")
      .replace(/\bPDF\b/gi, "P D F")
      .replace(/\bVAT\b/g, "V A T")
      .replace(/\bIBAN\b/g, "eye ban")
      .replace(/\bAED\b/g, "U A E dirhams")
      .replace(/\bSAR\b/g, "Saudi riyals")
      .replace(/\bPKR\b/g, "Pakistani rupees")
      .replace(/\bUSD\b/g, "U S dollars")
      .replace(/\bEUR\b/g, "euros")
      .replace(/\bINR\b/g, "Indian rupees")
      .replace(/\bBTC\b/g, "Bitcoin")
      .replace(/\bAI\b/g, "A I")
      .replace(/\bERP\b/g, "E R P")
      .replace(/\bURL\b/g, "U R L")
      .replace(/\bID\b/g, "I D")
      .replace(/\bUI\b/g, "user interface")
      .replace(/\s+/g, " ").trim();
  }

  // Keep speech distinct from on-screen copy: concise, purposeful, and instructional.
  function usefulNarration(text, kind = "step") {
    let clean = cleanNarrationText(text)
      .replace(/\bthe existing\b/ig, "the")
      .replace(/\bthe guided demo\b/ig, "this demonstration")
      .replace(/\blocal demo\b/ig, "demonstration")
      .replace(/\bfictional\b/ig, "sample")
      .replace(/\s*\([^)]{0,100}\)\s*/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!clean) return "";

    // Never narrate implementation failures or skip notices. Narration should teach the workflow.
    if (/control (?:is )?not available|skip this|skip this step|skip this click|could not continue|moved while the interface|opening the wrong item/i.test(clean)) return "";

    let sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
    const technicalNoise = /(?:the next chapter will open automatically|same interface|same controls|nothing in this demonstration|where allowed)/i;
    sentences = sentences.filter(sentence => !technicalNoise.test(sentence));
    if (!sentences.length) return "";

    let chosen = sentences.slice(0, kind === "intro" ? 4 : kind === "exercise" ? 3 : 3).join(" ").trim();
    if (kind === "step") {
      chosen = chosen
        .replace(/^Open\b/i, "Now open")
        .replace(/^Choose\b/i, "Next, choose")
        .replace(/^Select\b/i, "Next, select")
        .replace(/^Click\b/i, "Select")
        .replace(/^Expand\b/i, "Now expand")
        .replace(/^Return\b/i, "Now return")
        .replace(/^Use\b/i, "Use")
        .replace(/^This\b/i, "Here, this");
    }
    const words = chosen.split(/\s+/).filter(Boolean);
    const limit = kind === "intro" ? 62 : kind === "exercise" ? 44 : 46;
    if (words.length > limit) chosen = words.slice(0, limit).join(" ").replace(/[,;:]?$/, "") + ".";
    return normalizeProfessionalSpeech(chosen);
  }

  function estimateNarrationMs(text) {
    const words = cleanNarrationText(text).split(/\s+/).filter(Boolean).length;
    return Math.max(1700, Math.min(15000, Math.round(words * 360 + 600)));
  }

  function cancelNarration() {
    narrationToken += 1;
    if (!speechAvailable) return;
    try { speechSynth.cancel(); } catch (_) {}
  }

  function prepareNarrationForGesture() {
    if (!speechAvailable) return;
    speechUnlocked = true;
    try { speechSynth.resume(); } catch (_) {}
    refreshNarrationVoices();
    // Some browsers populate voices shortly after the first user interaction.
    global.setTimeout(refreshNarrationVoices, 120);
    global.setTimeout(refreshNarrationVoices, 650);
  }

  function splitSpeechText(text, maxChars = 245) {
    const source = cleanNarrationText(text);
    if (!source) return [];
    const sentences = source.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [source];
    const chunks = [];
    let current = "";
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence.trim()}` : sentence.trim();
      if (next.length <= maxChars) { current = next; continue; }
      if (current) chunks.push(current);
      if (sentence.length <= maxChars) { current = sentence.trim(); continue; }
      const words = sentence.trim().split(/\s+/);
      current = "";
      for (const word of words) {
        const trial = current ? `${current} ${word}` : word;
        if (trial.length > maxChars && current) { chunks.push(current); current = word; }
        else current = trial;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  async function waitBrieflyForVoices() {
    if (!speechAvailable) return null;
    let voice = narrationVoice();
    if (voice || cachedVoices.length) return voice;
    const started = Date.now();
    while (Date.now() - started < 420) {
      await sleep(90);
      refreshNarrationVoices();
      voice = narrationVoice();
      if (voice || cachedVoices.length) break;
    }
    return voice;
  }

  async function speakChunk(chunk, token, voice) {
    if (!speechAvailable || !chunk || token !== narrationToken || cancelled || !narrationEnabled) return;
    await new Promise(resolve => {
      let finished = false;
      let utterance = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        global.clearTimeout(watchdog);
        resolve();
      };
      try {
        utterance = new global.SpeechSynthesisUtterance(chunk);
        const activeVoice = voice || narrationVoice();
        if (activeVoice) {
          utterance.voice = activeVoice;
          utterance.lang = activeVoice.lang || "en-US";
        } else utterance.lang = "en-US";
        // Neutral professional delivery. A high pitch sounded synthetic; keep it natural.
        utterance.rate = isMobile() ? 0.92 : 0.94;
        utterance.pitch = 1.035;
        utterance.volume = 1;
        utterance.onend = finish;
        utterance.onerror = finish;
      } catch (_) { finish(); return; }
      // Never allow a browser TTS failure to hold the demo sequence indefinitely.
      const watchdogMs = Math.max(2600, Math.min(11500, estimateNarrationMs(chunk) + 2800));
      const watchdog = global.setTimeout(() => {
        try { speechSynth.cancel(); } catch (_) {}
        finish();
      }, watchdogMs);
      try {
        speechSynth.resume();
        speechSynth.speak(utterance);
      } catch (_) { finish(); }
    });
  }

  async function narrateText(text, options = {}) {
    const spoken = usefulNarration(text, options.kind || "step");
    if (!spoken || !narrationEnabled || cancelled || !speechAvailable) return;
    const token = ++narrationToken;
    try { speechSynth.cancel(); speechSynth.resume(); } catch (_) {}
    const voice = await waitBrieflyForVoices();
    if (cancelled || token !== narrationToken || !narrationEnabled) return;
    const chunks = splitSpeechText(spoken);
    for (const chunk of chunks) {
      if (cancelled || token !== narrationToken || !narrationEnabled) return;
      await speakChunk(chunk, token, voice);
      if (cancelled || token !== narrationToken) return;
      await sleep(24);
    }
  }

  refreshNarrationVoices();
  if (speechAvailable) {
    try { speechSynth.addEventListener?.("voiceschanged", refreshNarrationVoices); } catch (_) {}
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    if (el.hidden || el.classList?.contains("hide")) return false;
    const style = global.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function firstVisible(selector, root = doc) {
    if (!selector) return null;
    try {
      const nodes = Array.from(root.querySelectorAll(selector));
      return nodes.find(visible) || nodes[0] || null;
    } catch (_) { return null; }
  }

  function byText(root, selector, text) {
    const wanted = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!wanted) return null;
    try {
      return Array.from((root || doc).querySelectorAll(selector || "button")).find(el => {
        if (!visible(el)) return false;
        const actual = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        return actual.includes(wanted);
      }) || null;
    } catch (_) { return null; }
  }

  function textTarget(rootSelector, selector, text) {
    return () => byText(rootSelector ? doc.querySelector(rootSelector) : doc, selector, text);
  }

  function resolve(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (typeof target === "function") {
      try { return target(); } catch (_) { return null; }
    }
    if (typeof target === "string") return firstVisible(target);
    return null;
  }

  function activeTabKey() {
    const active = firstVisible('button.tab.active[data-tab]') || doc.querySelector('button.tab.active[data-tab]');
    return active?.dataset?.tab || "dashboard";
  }

  function areaForCurrentUi() {
    const key = activeTabKey();
    return GUIDES[key] ? key : "dashboard";
  }

  function installStyle() {
    if (doc.getElementById("triplemDemoTourStyleV3")) return;
    const style = doc.createElement("style");
    style.id = "triplemDemoTourStyleV3";
    style.textContent = `
      #triplemDemoTourCursorV3{position:fixed;left:0;top:0;width:32px;height:40px;z-index:2147483646;pointer-events:none;opacity:0;transform:translate3d(-80px,-80px,0);transition:transform .9s cubic-bezier(.18,.75,.2,1),opacity .2s ease;filter:drop-shadow(0 4px 6px rgba(15,23,42,.3))}
      #triplemDemoTourCursorV3 svg{display:block;width:32px;height:40px}
      #triplemDemoTourCursorV3.is-down svg{transform:scale(.84);transform-origin:4px 4px}
      #triplemDemoTourBannerV3{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483645;width:min(760px,calc(100vw - 30px));padding:12px 15px;border:1px solid var(--line,#d8dde8);border-radius:15px;background:color-mix(in srgb,var(--card,#fff) 97%,transparent);color:var(--text,#172033);box-shadow:0 14px 38px rgba(15,23,42,.17);backdrop-filter:blur(13px);font:500 13px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none;opacity:0;transition:opacity .2s ease}
      #triplemDemoTourBannerV3.is-visible{opacity:1}
      #triplemDemoTourBannerV3 .tour-head{display:flex;align-items:center;gap:8px;margin-bottom:4px;font-weight:800}
      #triplemDemoTourBannerV3 .tour-chapter{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #triplemDemoTourBannerV3 .tour-progress{margin-left:auto;color:var(--muted,#667085);font-size:11px;font-weight:750;white-space:nowrap}
      #triplemDemoTourBannerV3 .tour-copy{color:var(--text,#172033)}
      #triplemDemoTourKeycapV3{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;padding:6px 9px;border-radius:8px;border:1px solid var(--line,#d8dde8);background:var(--card,#fff);color:var(--text,#172033);box-shadow:0 8px 20px rgba(15,23,42,.16);font:750 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;transition:opacity .12s ease,transform .12s ease}
      #triplemDemoTourKeycapV3.is-visible{opacity:1;transform:translateY(-4px)}
      .triplem-demo-tour-focus-v3{position:relative!important;z-index:2147483000!important;outline:3px solid color-mix(in srgb,var(--primary,#2563eb) 82%,white)!important;outline-offset:5px!important;box-shadow:0 0 0 8px color-mix(in srgb,var(--primary,#2563eb) 18%,transparent)!important}
      #triplemDemoChapterChooser{position:fixed;inset:0;z-index:2147483644;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.48);backdrop-filter:blur(5px)}
      #triplemDemoChapterChooser.hide{display:none!important}
      #triplemDemoChapterChooser .tdc-card{width:min(720px,calc(100vw - 28px));max-height:min(82vh,760px);display:flex;flex-direction:column;border:1px solid var(--line,#d8dde8);border-radius:18px;background:var(--card,#fff);color:var(--text,#172033);box-shadow:0 26px 80px rgba(15,23,42,.28);overflow:hidden;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #triplemDemoChapterChooser .tdc-head{display:flex;gap:12px;align-items:flex-start;padding:16px 17px;border-bottom:1px solid var(--line,#d8dde8)}
      #triplemDemoChapterChooser .tdc-head h3{margin:0 0 3px;font-size:17px}.tdc-head p{margin:0;color:var(--muted,#667085);font-size:12px;line-height:1.45}
      #triplemDemoChapterChooser .tdc-close{margin-left:auto;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer;padding:2px 6px;border-radius:8px}
      #triplemDemoChapterChooser .tdc-controls{display:grid;grid-template-columns:1fr 160px;gap:10px;padding:12px 17px;border-bottom:1px solid var(--line,#d8dde8)}
      #triplemDemoChapterChooser select{width:100%;min-height:38px;border:1px solid var(--line,#d8dde8);border-radius:10px;background:var(--control-bg,var(--card,#fff));color:inherit;padding:7px 10px;font:600 12px/1.2 inherit}
      #triplemDemoChapterChooser .tdc-list{overflow:auto;padding:10px 12px 14px;display:grid;gap:8px}
      #triplemDemoChapterChooser .tdc-chapter{display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;width:100%;text-align:left;border:1px solid var(--line,#d8dde8);border-radius:13px;background:var(--surface,var(--card,#fff));color:inherit;padding:10px 11px;cursor:pointer}
      #triplemDemoChapterChooser .tdc-chapter:hover{background:var(--surface-hover,var(--surface,#fff))}
      #triplemDemoChapterChooser .tdc-num{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:var(--primary-soft,rgba(37,99,235,.12));color:var(--primary,#2563eb);font-weight:800;font-size:12px}
      #triplemDemoChapterChooser .tdc-copy strong{display:block;font-size:13px;margin-bottom:2px}.tdc-copy span{display:block;color:var(--muted,#667085);font-size:11.5px;line-height:1.42}
      #triplemDemoChapterChooser .tdc-play{font-size:14px;color:var(--primary,#2563eb);padding:6px}
      #triplemDemoChapterChooser .tdc-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 17px;border-top:1px solid var(--line,#d8dde8)}
      #triplemDemoChapterChooser .tdc-foot small{color:var(--muted,#667085)}
      #triplemDemoChapterChooser .tdc-playall{border:0;border-radius:10px;background:var(--primary,#2563eb);color:var(--on-primary,#fff);padding:9px 13px;font-weight:750;cursor:pointer}
      #triplemDemoChapterGateV4{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.52);backdrop-filter:blur(6px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #triplemDemoChapterGateV4.hide{display:none!important}
      #triplemDemoChapterGateV4 .tdg-card{width:min(680px,calc(100vw - 28px));border:1px solid var(--line,#d8dde8);border-radius:20px;background:var(--card,#fff);color:var(--text,#172033);box-shadow:0 28px 90px rgba(15,23,42,.32);overflow:hidden}
      #triplemDemoChapterGateV4 .tdg-top{display:flex;align-items:center;gap:10px;padding:14px 17px;border-bottom:1px solid var(--line,#d8dde8);background:color-mix(in srgb,var(--primary,#2563eb) 7%,var(--card,#fff))}
      #triplemDemoChapterGateV4 .tdg-kicker{font-size:11px;font-weight:850;letter-spacing:.07em;text-transform:uppercase;color:var(--primary,#2563eb)}
      #triplemDemoChapterGateV4 .tdg-count{margin-left:auto;font-size:11.5px;font-weight:750;color:var(--muted,#667085)}
      #triplemDemoChapterGateV4 .tdg-body{padding:19px 19px 15px}
      #triplemDemoChapterGateV4 h3{margin:0 0 7px;font-size:20px;line-height:1.25}
      #triplemDemoChapterGateV4 .tdg-summary{margin:0;color:var(--muted,#667085);font-size:13px;line-height:1.58}
      #triplemDemoChapterGateV4 .tdg-auto{display:flex;align-items:center;gap:8px;margin-top:14px;padding:9px 11px;border-radius:11px;background:var(--surface,var(--control-bg,#f7f8fb));color:var(--muted,#667085);font-size:11.5px}
      #triplemDemoChapterGateV4 .tdg-auto i{color:var(--primary,#2563eb)}
      #triplemDemoChapterGateV4 .tdg-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:13px 17px 17px}
      #triplemDemoChapterGateV4 button{min-height:38px;border:1px solid var(--line,#d8dde8);border-radius:10px;background:var(--surface,var(--card,#fff));color:inherit;padding:8px 11px;font:750 12px/1.2 inherit;cursor:pointer}
      #triplemDemoChapterGateV4 button:hover:not(:disabled){background:var(--surface-hover,var(--surface,#fff))}
      #triplemDemoChapterGateV4 button:disabled{opacity:.4;cursor:not-allowed}
      #triplemDemoChapterGateV4 .tdg-primary{margin-left:auto;border-color:transparent;background:var(--primary,#2563eb);color:var(--on-primary,#fff)}
      #triplemDemoChapterGateV4 .tdg-primary:hover{background:var(--primary,#2563eb)}
      #triplemDemoChapterGateV4 .tdg-stop{color:var(--danger,#b42318)}
      #triplemDemoExerciseDockV4{position:fixed;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;width:min(780px,calc(100vw - 24px));display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:11px 12px;border:1px solid var(--line,#d8dde8);border-radius:15px;background:color-mix(in srgb,var(--card,#fff) 97%,transparent);color:var(--text,#172033);box-shadow:0 18px 50px rgba(15,23,42,.23);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #triplemDemoExerciseDockV4.hide{display:none!important}
      #triplemDemoExerciseDockV4 .tde-copy strong{display:block;font-size:12.5px;margin-bottom:2px}.tde-copy span{display:block;color:var(--muted,#667085);font-size:11.5px;line-height:1.4}
      #triplemDemoExerciseDockV4 .tde-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
      #triplemDemoExerciseDockV4 button{border:1px solid var(--line,#d8dde8);border-radius:9px;background:var(--surface,var(--card,#fff));color:inherit;padding:8px 10px;font:750 11.5px/1.1 inherit;cursor:pointer}
      #triplemDemoExerciseDockV4 .tde-resume{border-color:transparent;background:var(--primary,#2563eb);color:var(--on-primary,#fff)}
      #triplemDemoBadge.triplem-demo-control-card{right:14px!important;bottom:14px!important;display:grid!important;grid-template-columns:1fr!important;align-items:stretch!important;gap:7px!important;min-width:244px!important;max-width:min(330px,calc(100vw - 28px))!important;padding:10px!important;border-radius:16px!important;font:600 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
      #triplemDemoBadge .td-mini-head{display:flex;align-items:center;gap:7px;min-width:0}.td-mini-head .td-mini-title{font-weight:800}.td-mini-head .td-mini-status{margin-left:auto;max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted,#667085);font-size:10.5px}
      #triplemDemoBadge .td-mini-chapter{font-size:11px;font-weight:750;color:var(--text,#172033);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 1px}#triplemDemoBadge .td-mini-actions{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}#triplemDemoBadge .td-mini-actions button{min-width:0;border:1px solid var(--line,#d8dde8)!important;background:var(--surface,var(--card,#fff))!important;color:inherit!important;cursor:pointer;padding:7px 5px!important;border-radius:9px!important;display:flex;align-items:center;justify-content:center;gap:4px;font:750 11px/1 inherit}#triplemDemoBadge .td-mini-actions button:hover{border-color:var(--primary,#2563eb)!important}#triplemDemoBadge #triplemDemoPlay{background:var(--primary,#2563eb)!important;color:var(--on-primary,#fff)!important;border-color:transparent!important}
      #triplemDemoBadge .td-voice-state{font-size:9.5px;color:var(--muted,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:720px){#triplemDemoTourBannerV3{top:max(7px,env(safe-area-inset-top));width:calc(100vw - 18px);padding:10px 11px;font-size:12px}#triplemDemoTourCursorV3{width:27px;height:34px}#triplemDemoTourCursorV3 svg{width:27px;height:34px}#triplemDemoChapterChooser{align-items:flex-end;padding:0;background:rgba(15,23,42,.42)}#triplemDemoChapterChooser .tdc-card{width:100%;max-height:88vh;border-radius:18px 18px 0 0}.tdc-controls{grid-template-columns:1fr!important}.tdc-foot{padding-bottom:max(14px,env(safe-area-inset-bottom))!important}#triplemDemoChapterGateV4{align-items:flex-end;padding:0;background:rgba(15,23,42,.48)}#triplemDemoChapterGateV4 .tdg-card{width:100%;border-radius:20px 20px 0 0;padding-bottom:max(4px,env(safe-area-inset-bottom))}#triplemDemoChapterGateV4 .tdg-body{padding:16px 15px 12px}#triplemDemoChapterGateV4 h3{font-size:18px}#triplemDemoChapterGateV4 .tdg-actions{padding:11px 13px 14px;display:grid;grid-template-columns:1fr 1fr}#triplemDemoChapterGateV4 .tdg-actions button{width:100%}#triplemDemoChapterGateV4 .tdg-primary{margin-left:0;grid-column:1/-1}#triplemDemoExerciseDockV4{bottom:max(8px,env(safe-area-inset-bottom));width:calc(100vw - 16px);grid-template-columns:1fr;padding:10px}#triplemDemoExerciseDockV4 .tde-actions{display:grid;grid-template-columns:1fr 1fr}#triplemDemoExerciseDockV4 .tde-actions button{width:100%}}
      @media(max-width:720px){#triplemDemoBadge.triplem-demo-control-card{right:8px!important;bottom:8px!important;min-width:0!important;width:min(310px,calc(100vw - 16px))!important;padding:8px!important;gap:6px!important}#triplemDemoBadge .td-mini-actions button{padding:7px 4px!important}}
      @media(prefers-reduced-motion:reduce){#triplemDemoTourCursorV3{transition:opacity .15s ease}.triplem-demo-tour-focus-v3{transition:none!important}}
    `;
    doc.head.appendChild(style);
  }

  function installOverlays() {
    installStyle();
    if (!cursor) {
      cursor = doc.createElement("div");
      cursor.id = "triplemDemoTourCursorV3";
      cursor.setAttribute("aria-hidden", "true");
      cursor.innerHTML = '<svg viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg"><path d="M3 2.7V31l7.9-7.1 5.2 12.3 5.3-2.3-5.1-11.9H27L3 2.7Z" fill="white" stroke="#111827" stroke-width="2.25" stroke-linejoin="round"/></svg>';
      doc.body.appendChild(cursor);
    }
    if (!banner) {
      banner = doc.createElement("div");
      banner.id = "triplemDemoTourBannerV3";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      doc.body.appendChild(banner);
    }
    if (!keycap) {
      keycap = doc.createElement("div");
      keycap.id = "triplemDemoTourKeycapV3";
      keycap.setAttribute("aria-hidden", "true");
      doc.body.appendChild(keycap);
    }
  }

  function showRemark(copy, narrationOptions = {}) {
    installOverlays();
    const areaName = AREA_LABELS[currentArea] || "Demo";
    banner.innerHTML = `<div class="tour-head"><i class="fa-solid fa-circle-play" aria-hidden="true"></i><span>${esc(areaName)}</span><span>›</span><span class="tour-chapter">${esc(currentChapterTitle || "Guided lesson")}</span><span class="tour-progress">Step ${currentStep}</span></div><div class="tour-copy">${esc(copy || "")}</div>`;
    banner.classList.add("is-visible");
    if (narrationOptions.narrate === false) return Promise.resolve();
    return narrateText(narrationOptions.spoken || copy, { kind: narrationOptions.kind || "step" });
  }

  function hideRemark() { banner?.classList.remove("is-visible"); }
  function clearHighlight() {
    if (highlight) highlight.classList.remove("triplem-demo-tour-focus-v3");
    highlight = null;
  }

  function targetPoint(el) {
    const r = el.getBoundingClientRect();
    const xPad = Math.min(18, Math.max(5, r.width * .18));
    const yPad = Math.min(14, Math.max(5, r.height * .2));
    let x = r.left + clamp(r.width * .5, xPad, Math.max(xPad, r.width - xPad));
    let y = r.top + clamp(r.height * .5, yPad, Math.max(yPad, r.height - yPad));
    x = clamp(x, 8, global.innerWidth - 10);
    y = clamp(y, 8, global.innerHeight - 10);
    return { x, y, r };
  }

  const INTERACTIVE_SELECTOR = 'button,a[href],input,select,textarea,summary,label,[role="button"],[tabindex]:not([tabindex="-1"]),[onclick]';

  function safeClickPoint(el) {
    if (!el || !visible(el)) return null;
    const r = el.getBoundingClientRect();
    const left = Math.max(2, r.left + Math.min(8, Math.max(2, r.width * .08)));
    const right = Math.min(global.innerWidth - 2, r.right - Math.min(8, Math.max(2, r.width * .08)));
    const top = Math.max(safeViewportTop(), r.top + Math.min(7, Math.max(2, r.height * .10)));
    const bottom = Math.min(global.innerHeight - 4, r.bottom - Math.min(7, Math.max(2, r.height * .10)));
    if (right <= left || bottom <= top) return null;
    const factors = [[.5,.5],[.32,.5],[.68,.5],[.5,.32],[.5,.68],[.20,.5],[.80,.5],[.25,.28],[.75,.28],[.25,.72],[.75,.72]];
    const targetIsInteractive = !!el.matches?.(INTERACTIVE_SELECTOR);
    for (const [fx, fy] of factors) {
      const x = left + (right - left) * fx;
      const y = top + (bottom - top) * fy;
      const hit = doc.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit))) continue;
      // If a card/container has its own click behavior, never land on a nested independent button.
      // This prevents a visual click on the card from accidentally activating a menu/action inside it.
      if (!targetIsInteractive) {
        const nestedInteractive = hit.closest?.(INTERACTIVE_SELECTOR);
        if (nestedInteractive && nestedInteractive !== el && el.contains(nestedInteractive)) continue;
      }
      return { x, y, r, hit };
    }
    return null;
  }

  async function waitForStableRect(el) {
    let previous = null;
    let stablePasses = 0;
    for (let i = 0; i < 9; i += 1) {
      if (!el?.isConnected) return;
      const r = el.getBoundingClientRect();
      const sig = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(":");
      if (sig === previous) stablePasses += 1;
      else stablePasses = 0;
      if (stablePasses >= 1) return;
      previous = sig;
      await sleep(90);
    }
  }

  async function waitForTarget(target, timeout = 4200) {
    const started = Date.now();
    let el = resolve(target);
    while ((!el || !visible(el)) && Date.now() - started < timeout) {
      if (cancelled) throw new Error("tour-cancelled");
      await sleep(120);
      el = resolve(target);
    }
    return el && visible(el) ? el : null;
  }

  function safeViewportTop() {
    const bannerHeight = banner?.classList?.contains("is-visible") ? Math.ceil(banner.getBoundingClientRect().height || 0) : 0;
    return Math.max(isMobile() ? 82 : 72, bannerHeight + (isMobile() ? 20 : 18));
  }

  async function ensureInView(el) {
    if (!el) return;
    let r = el.getBoundingClientRect();
    const topSafe = safeViewportTop();
    const bottomSafe = global.innerHeight - (isMobile() ? 84 : 66);
    const horizontallyOff = r.left < 6 || r.right > global.innerWidth - 6;
    if (r.top < topSafe || r.bottom > bottomSafe || horizontallyOff) {
      try { el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center", inline: "nearest" }); } catch (_) {}
      await sleep(isMobile() ? 560 : 440);
      await waitForStableRect(el);
      r = el.getBoundingClientRect();
      if (r.top < topSafe) global.scrollBy({ top: r.top - topSafe - 20, behavior: reduced() ? "auto" : "smooth" });
      else if (r.bottom > bottomSafe) global.scrollBy({ top: r.bottom - bottomSafe + 20, behavior: reduced() ? "auto" : "smooth" });
      await sleep(isMobile() ? 260 : 210);
      await waitForStableRect(el);
    }
  }

  function cursorTipOffset() {
    return isMobile() ? { x: 2.55, y: 2.3 } : { x: 3, y: 2.7 };
  }

  function placeCursorAt(point, duration = pace("move")) {
    const tip = cursorTipOffset();
    cursor.style.transitionDuration = reduced() ? "0s" : `${Math.max(0, duration)}ms`;
    cursor.style.transform = `translate3d(${Math.round(point.x - tip.x)}px,${Math.round(point.y - tip.y)}px,0)`;
    cursor.style.opacity = "1";
  }

  async function moveCursorTo(target) {
    let el = await waitForTarget(target);
    if (!el) return null;
    installOverlays();
    await ensureInView(el);
    await waitForStableRect(el);
    let point = targetPoint(el);
    placeCursorAt(point);
    await sleep(reduced() ? 45 : pace("move") + 90);

    // Dynamic cards, portaled menus and mobile reflow can move while the cursor is travelling.
    // Re-resolve and re-measure before any click so the visible pointer and actual target coincide.
    el = resolve(target) || el;
    if (!el || !visible(el)) return null;
    await waitForStableRect(el);
    const finalPoint = targetPoint(el);
    const drift = Math.hypot(finalPoint.x - point.x, finalPoint.y - point.y);
    if (drift > 3) {
      placeCursorAt(finalPoint, reduced() ? 0 : Math.min(420, Math.max(220, Math.round(pace("move") * .32))));
      await sleep(reduced() ? 30 : Math.min(500, Math.max(270, Math.round(pace("move") * .36))));
      point = finalPoint;
    }
    return el;
  }

  async function dismissBlockingOverlayFor(el) {
    if (!el || !el.isConnected) return;
    const layers = Array.from(doc.querySelectorAll('.modal:not(.hide),.settings-sheet:not(.hide),[role="dialog"]')).filter(layer => {
      if (!visible(layer)) return false;
      if (layer.id === "triplemDemoChapterChooser" || layer.id === "triplemDemoChapterGateV4") return false;
      if (layer.closest?.("#triplemDemoChapterChooser,#triplemDemoChapterGateV4")) return false;
      return true;
    }).reverse();
    const blocker = layers.find(layer => !layer.contains(el) && !el.contains(layer));
    if (!blocker) return;
    const close = firstVisible('[data-close-modal],[data-admin-modal-close],[data-account-security-close],[data-account-child-close],[data-acct-modal-close],[data-ai-draft-close],[data-triplem-ai-settings-close],button[aria-label="Close"]', blocker)
      || byText(blocker, "button", "Cancel") || byText(blocker, "button", "Close");
    if (close) {
      try { close.click(); } catch (_) {}
      await sleep(isMobile() ? 420 : 340);
    }
    const menus = Array.from(doc.querySelectorAll('.menu-dropdown.open,.loan-tx-menu.is-open,.loan-detail-pdf-menu.is-open,.financial-audit-export-menu.is-open,.menu-wrap.open')).filter(visible);
    if (menus.length && !menus.some(menu => menu.contains(el))) {
      closeTransientMenus();
      await sleep(isMobile() ? 300 : 240);
    }
  }

  async function focusTarget(target, remark, options = {}) {
    if (cancelled) throw new Error("tour-cancelled");
    currentStep += 1;
    clearHighlight();

    let el = await waitForTarget(target, options.targetWait || 4200);
    if (!el) {
      // Keep the lesson useful without exposing technical target-resolution failures.
      // The original instructional remark is still shown and narrated, then the tour continues.
      const narration = showRemark(remark || "Continue with the next part of this workflow.", options.narration || {});
      await narration;
      await sleep(options.missingWait || 90);
      return null;
    }

    // A stale modal from the previous step must never leave the narration describing controls behind it.
    await dismissBlockingOverlayFor(el);
    el = await waitForTarget(target, options.targetWait || 2600);
    if (!el) return null;
    await ensureInView(el);
    await waitForStableRect(el);

    const narration = showRemark(remark, options.narration || {});
    highlight = el;
    el.classList.add("triplem-demo-tour-focus-v3");
    const moved = await moveCursorTo(target);
    if (moved && moved !== el) {
      try { el.classList.remove("triplem-demo-tour-focus-v3"); } catch (_) {}
      el = moved;
      highlight = el;
      el.classList.add("triplem-demo-tour-focus-v3");
    }
    await narration;
    await sleep(options.hold ?? pace("settle"));
    return el;
  }

  function dispatchMouse(el, type, point) {
    if (!el) return;
    const p = point || targetPoint(el);
    try {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: global, clientX: p.x, clientY: p.y, button: 0, buttons: type === "mousedown" ? 1 : 0 }));
    } catch (_) {}
  }

  async function clickTarget(target, remark, options = {}) {
    let el = await focusTarget(target, remark, options);
    if (!el) return null;

    for (let pass = 0; pass < 4; pass += 1) {
      el = resolve(target) || el;
      if (!el || !visible(el)) return null;
      await ensureInView(el);
      await waitForStableRect(el);
      el = resolve(target) || el;
      if (!el || !visible(el)) return null;

      const safe = safeClickPoint(el);
      if (!safe) {
        // Never create a false visual click. Reposition/settle and retry instead.
        await sleep(220 + pass * 120);
        continue;
      }
      placeCursorAt(safe, reduced() ? 0 : Math.min(420, Math.max(220, Math.round(pace("move") * .34))));
      await sleep(reduced() ? 25 : 190);

      // Validate the exact point again immediately before the click.
      const hit = doc.elementFromPoint(safe.x, safe.y);
      if (!hit || !(hit === el || el.contains(hit))) {
        await sleep(180);
        continue;
      }

      dispatchMouse(hit, "mouseover", safe);
      dispatchMouse(hit, "mousemove", safe);
      dispatchMouse(hit, "mousedown", safe);
      cursor?.classList.add("is-down");
      await sleep(isMobile() ? 150 : 125);
      dispatchMouse(hit, "mouseup", safe);
      cursor?.classList.remove("is-down");
      try { hit.focus?.({ preventScroll: true }); } catch (_) {}
      try {
        const interactive = hit.closest?.(INTERACTIVE_SELECTOR);
        const activation = interactive && (interactive === el || el.contains(interactive)) ? interactive : el;
        if (typeof activation?.click === "function") activation.click();
        else hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: global, clientX: safe.x, clientY: safe.y, button: 0 }));
      } catch (_) {
        try { el.click?.(); } catch (_) {}
      }
      // Give menus, modals and overview expansions enough time to complete their reflow.
      await sleep(options.after ?? Math.max(pace("click"), isMobile() ? 760 : 620));
      return el;
    }

    // If the target is covered or moved, never click a different control. Continue quietly;
    // the instructional narration has already explained the intended action.
    await sleep(90);
    return null;
  }

  async function ensureExpanded(target, remark, desired = true) {
    const el = await waitForTarget(target);
    if (!el) { currentStep += 1; await showRemark(remark); await sleep(90); return null; }
    const hostDetails = el.closest?.("details");
    const current = hostDetails ? !!hostDetails.open : el.getAttribute("aria-expanded") === "true";
    if (current !== desired) await clickTarget(target, remark);
    else await lecture(target, remark, Math.round(pace("lecture") * .62));
    await sleep(130);
    return resolve(target) || el;
  }

  function setNativeValue(el, value) {
    if (!el) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
  }

  async function showKey(el, key) {
    if (!keycap || !el) return;
    const r = el.getBoundingClientRect();
    keycap.textContent = key === " " ? "Space" : key;
    keycap.style.left = `${clamp(r.right - 50, 8, global.innerWidth - 88)}px`;
    keycap.style.top = `${clamp(r.top - 35, 8, global.innerHeight - 38)}px`;
    keycap.classList.add("is-visible");
    await sleep(85);
    keycap.classList.remove("is-visible");
  }

  async function typeTarget(target, value, remark, options = {}) {
    const el = await focusTarget(target, remark, options);
    if (!el) return null;
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus?.(); }
    dispatchMouse(el, "mousedown"); dispatchMouse(el, "mouseup"); dispatchMouse(el, "click");
    const text = String(value ?? "");
    if (options.clear !== false) {
      setNativeValue(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const type = String(el.getAttribute?.("type") || "text").toLowerCase();
    const direct = options.direct || ["date","number","time","month"].includes(type);
    if (direct) {
      for (let i = 0; i < text.length; i += Math.max(1, Math.ceil(text.length / 5))) await showKey(el, text[i]);
      setNativeValue(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(pace("select"));
      return el;
    }
    for (let i = 0; i < text.length; i += 1) {
      if (cancelled) throw new Error("tour-cancelled");
      const ch = text[i];
      try { el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true })); } catch (_) {}
      setNativeValue(el, String(el.value || "") + ch);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      try { el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true })); } catch (_) {}
      if (i === 0 || i === text.length - 1 || i % 4 === 0) await showKey(el, ch);
      await sleep(options.delay ?? pace("type"));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(420);
    return el;
  }

  async function selectTarget(target, wanted, remark, options = {}) {
    const el = await focusTarget(target, remark, options);
    if (!el || !(el instanceof HTMLSelectElement)) return null;
    const wantedText = String(wanted ?? "").toLowerCase();
    const option = Array.from(el.options).find(o => String(o.value).toLowerCase() === wantedText)
      || Array.from(el.options).find(o => String(o.textContent || "").trim().toLowerCase().includes(wantedText))
      || Array.from(el.options).find(o => o.value && !o.disabled);
    if (option) {
      el.value = option.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await sleep(pace("select"));
    return el;
  }

  async function lecture(target, remark, ms) {
    await focusTarget(target, remark, { hold: 200 });
    await sleep(ms ?? pace("lecture"));
  }

  async function pressEnter(target, remark) {
    const el = await focusTarget(target, remark);
    if (!el) return;
    try { el.focus(); } catch (_) {}
    await showKey(el, "Enter");
    try {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    } catch (_) {}
    await sleep(pace("click"));
  }

  async function clickNav(key) {
    let btn = doc.querySelector(`button.tab[data-tab="${CSS.escape(key)}"]`);
    if (!btn && key === "accounting") {
      await sleep(500);
      btn = doc.querySelector('button.tab[data-tab="accounting"]');
    }
    if (btn && !btn.classList.contains("active")) {
      await clickTarget(btn, `Opening ${AREA_LABELS[key] || key}.`);
      await sleep(450);
    }
  }

  async function closeVisibleModal() {
    const modals = Array.from(doc.querySelectorAll('.modal:not(.hide), .settings-sheet:not(.hide), [role="dialog"]')).filter(visible).reverse();
    const modal = modals.find(el => !el.closest?.("#triplemDemoChapterChooser"));
    if (!modal) return;
    const close = firstVisible('[data-close-modal],[data-admin-modal-close],[data-account-security-close],[data-account-child-close],[data-acct-modal-close],[data-ai-draft-close],[data-triplem-ai-settings-close],button[aria-label="Close"]', modal)
      || byText(modal, "button", "Cancel") || byText(modal, "button", "Close");
    if (close) {
      try { close.click(); } catch (_) {}
      await sleep(520);
    }
  }

  async function clearInput(selector) {
    const el = resolve(selector);
    if (!el) return;
    setNativeValue(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(300);
  }

  function closeTransientMenus() {
    try { global.closeLoanTransactionMenus?.(); } catch (_) {}
    try { global.closeAllAssetCardMenus?.(); } catch (_) {}
    doc.querySelectorAll('.menu-dropdown.open,.loan-tx-menu.is-open,.loan-detail-pdf-menu.is-open,.financial-audit-export-menu.is-open').forEach(panel => {
      panel.classList.remove("open", "is-open");
    });
    doc.querySelectorAll('.menu-wrap.open').forEach(wrap => wrap.classList.remove("open"));
    doc.querySelectorAll('[aria-expanded="true"].menu-trigger,[aria-expanded="true"].person-menu-btn,[aria-expanded="true"].loan-tx-menu-btn,[aria-expanded="true"][data-asset-menu-trigger]').forEach(btn => btn.setAttribute("aria-expanded", "false"));
  }

  async function openAccountMenu() {
    const btn = doc.getElementById("accountMenuBtn");
    if (!btn) return;
    const panel = doc.querySelector('[data-entry-menu-panel="account"]');
    if (!panel || !visible(panel)) await clickTarget(btn, "The account menu contains reports, settings, subscription, messages and VAT tools.");
  }

  async function openThemeMenu() {
    const btn = doc.getElementById("themeSettingsBtn");
    const panel = doc.getElementById("themeDropdown");
    if (!panel || !visible(panel)) await clickTarget(btn, "The Theme control opens the existing appearance choices without leaving the workspace.");
  }

  function firstExpenseRecordMenu() { return firstVisible('[data-expense-record-menu]'); }
  function firstExpenseEditAction() { return firstVisible('[data-expense-record-edit]'); }
  function firstExpensePdfAction() { return firstVisible('[data-expense-record-pdf]'); }
  function firstExpenseDeleteAction() { return firstVisible('[data-expense-record-delete]'); }
  function firstWalletQuick(action) { return firstVisible(`.expenseWalletQuick[data-action="${action}"]`); }
  function firstLoanPersonMenu(root = doc) { return firstVisible('.personActionBtn[data-action="pdf"], .menu-trigger', root); }

  function chapter(title, summary, steps, run) { return { title, summary, steps, run }; }

  const GUIDES = {
    dashboard: {
      label: "Dashboard",
      chapters: [
        chapter("Workspace orientation", "Understand summary cards, balances and the dashboard hierarchy.", 4, async () => {
          await clickNav("dashboard");
          await lecture("#dashboardRoot", "This is the main financial overview. Every visible amount is driven by the fictional local demo data.");
          await lecture(() => firstVisible('#dashboardRoot .summary-card,#dashboardRoot .dashboard-card,#dashboardRoot .metric-card,#dashboardRoot .overview-card'), "The summary cards combine wallets, expenses, inventory, loans, installments and assets into concise operating figures.");
          await lecture("#mainOverview", "The overview strip gives a quick cross-section of the workspace before you enter individual modules.");
          await lecture(".tabs", "Every major module is reachable from the same navigation bar on desktop and the responsive equivalent on mobile.");
        }),
        chapter("From Dashboard to Wallets Overview", "Move from the Dashboard into Expenses and expand the complete wallet overview.", 6, async () => {
          await clickNav("dashboard");
          await lecture("#dashboardRoot", "Dashboard summarizes the workspace; detailed wallet management lives in Expenses.");
          await clickNav("expenses");
          await ensureExpanded("#toggleWalletsBtn", "Expand Wallets Overview to reveal every configured demo wallet and its current balance.", true);
          await lecture("#expenseOverviewWallets", "Each wallet card exposes currency, money in, money out and available balance.");
          await lecture(() => firstVisible('#expenseOverviewWallets [data-wallet-details]'), "Selecting a wallet card drills into wallet-level activity while keeping the same application layout.");
          await lecture(() => firstVisible('#expenseOverviewWallets .expenseWalletQuick'), "Quick actions beneath each wallet lead to details, top-up, expense, transfer, PDF, edit and delete workflows.");
        }),
        chapter("Charts and detailed summaries", "Open dashboard details and understand the visual summaries.", 4, async () => {
          await clickNav("dashboard");
          await lecture(() => firstVisible('#dashboardRoot canvas,#dashboardRoot .chart-card,#dashboardRoot .dashboard-chart'), "Charts translate the same fictional ledger into visual trends, not separate data.");
          await lecture(() => firstVisible('#dashboardRoot .sectionDetailsBtn,#dashboardRoot button'), "Detail controls open deeper summaries while preserving the underlying balances.");
          await lecture(() => firstVisible('#dashboardRoot .currency-summary,#dashboardRoot .summary-card'), "Multi-currency figures remain separated by currency so AED, SAR, PKR, USD, EUR and INR are not mixed incorrectly.");
          await lecture("#dashboardRoot", "You can now continue manually into any card or use another chapter for a guided workflow.");
        }),
        chapter("Financial Timeline", "Open the chronological financial activity view and inspect dated movements.", 5, async () => {
          await clickNav("dashboard");
          await clickTarget(textTarget("#dashboardPanel", "button.dashboard-main-tab", "Financial Timeline"), "The Financial Timeline reconstructs activity in chronological order.");
          await lecture("#financialTimelineRoot", "Timeline entries explain what changed, when it changed and which module produced the movement.");
          await lecture(() => firstVisible('#financialTimelineRoot input,#financialTimelineRoot select,#financialTimelineRoot button'), "Timeline filters help isolate periods, modules or transaction types.");
          await lecture(() => firstVisible('#financialTimelineRoot .timeline-item,#financialTimelineRoot article,#financialTimelineRoot .card'), "Each timeline item can be inspected as a dated event rather than only as a balance.");
          await clickTarget(textTarget("#dashboardPanel", "button.dashboard-main-tab", "Overview"), "Returning to Overview restores the normal dashboard.");
        }),
        chapter("Keyboard shortcuts", "See where section shortcuts live and how keyboard-first use is supported.", 3, async () => {
          await clickNav("dashboard");
          await lecture(() => firstVisible('[data-shortcut-trigger]'), "Shortcut buttons describe keyboard commands available for frequent actions.");
          await lecture(".tabs", "Keyboard navigation complements mouse use; the guided demo intentionally demonstrates both interaction styles.");
          await lecture("#triplemDemoBadge", "The Demo badge always lets you reset fictional data and reopen this chapter library.");
        })
      ]
    },

    expenses: {
      label: "Expenses & Wallets",
      chapters: [
        chapter("Wallets Overview and all wallets", "Expand the wallet strip, inspect balances and move across every wallet.", 6, async () => {
          await clickNav("expenses");
          await ensureExpanded("#toggleWalletsBtn", "Wallets Overview expands to show every fictional account configured for the demo.", true);
          await lecture("#expenseOverviewWallets", "The first card represents All Wallets; the remaining cards are individual bank, cash, card and regional wallets.");
          await clickTarget(() => firstVisible('#expenseOverviewWallets .expense-wallet-card-all'), "All Wallets removes wallet-specific filtering and shows the combined expense statement.");
          await lecture(() => firstVisible('#expenseOverviewWallets [data-wallet-details]'), "Each wallet card shows its own currency and balance without converting unrelated currencies into one amount.");
          await clickTarget(() => firstVisible('#expenseOverviewWallets [data-wallet-details]'), "Selecting one wallet focuses the expense records on that wallet.");
          await lecture("#expenseWalletSelectFilter", "The Wallet filter gives the same control in compact form, especially useful on mobile.");
        }),
        chapter("Create a wallet", "Create a new local demo wallet with realistic account details.", 10, async () => {
          await clickNav("expenses");
          await clickTarget(textTarget("#expensesPanel", "button.menu-trigger", "New Entry"), "Open New Entry to begin a wallet workflow.");
          await clickTarget("#openExpenseAccountBtn", "Add Account opens the existing wallet form.");
          await typeTarget('#expenseAccountForm [name="account_name"]', "Demo Operations Bank", "Type a clear wallet name so it is easy to identify later.");
          await selectTarget('#expenseAccountForm [name="account_type"]', "Bank Account", "Choose Bank Account to expose bank-specific optional details.");
          await selectTarget("#expenseAccountCurrencySelect", "AED", "Assign the wallet currency. Currency symbols and special fonts continue to come from the app registry.");
          await typeTarget('#expenseAccountForm [name="opening_balance"]', "15000", "Enter the opening available balance.", { direct: true });
          await clickTarget("#expenseAccountDetailsSection summary", "Optional account details can store IBAN, holder and other type-specific information.");
          await typeTarget(() => firstVisible('#expenseAccountDetailsFields input'), "Northstar Trading FZCO", "The first available optional detail is filled with fictional information.");
          await typeTarget('#expenseAccountForm [name="notes"]', "Created by guided wallet chapter", "Add a short note describing the account.");
          await clickTarget('#expenseAccountForm button[type="submit"]', "Save Account adds the wallet only to this local demo session.");
        }),
        chapter("Top up a wallet", "Add money to an existing wallet and observe the receiving record.", 8, async () => {
          await clickNav("expenses");
          await clickTarget(textTarget("#expensesPanel", "button.menu-trigger", "New Entry"), "Open New Entry for a receiving transaction.");
          await clickTarget("#openExpenseTopupBtn", "Add Money opens the top-up form.");
          await selectTarget("#expenseTopupAccountSelect", "Emirates NBD", "Choose the wallet that receives the money.");
          await typeTarget('#expenseTopupForm [name="amount"]', "2500", "Enter the amount received.", { direct: true });
          await clickTarget('#expenseTopupForm details summary', "Optional source details record where the money came from and how it was received.");
          await typeTarget('#expenseTopupForm [name="detail_source_name"]', "Demo Customer LLC", "Record a fictional payer or money source.");
          await typeTarget('#expenseTopupForm [name="notes"]', "Guided demo top-up", "A note makes the receiving record easy to recognize.");
          await clickTarget('#expenseTopupForm button[type="submit"]', "Add Money updates the local wallet balance and creates a Receiving record.");
        }),
        chapter("Add an expense", "Record a complete expense with wallet, category and optional payment details.", 11, async () => {
          await clickNav("expenses");
          await clickTarget(textTarget("#expensesPanel", "button.menu-trigger", "New Entry"), "Open the existing New Entry menu.");
          await clickTarget("#openExpenseEntryBtn", "Add Expense uses the same form as the live interface.");
          await typeTarget('#expenseEntryForm [name="item_name"]', "Guided Demo Office Supplies", "Enter the expense item or purpose.");
          await typeTarget('#expenseEntryForm [name="amount"]', "245.75", "Enter the amount paid.", { direct: true });
          await selectTarget("#expenseCurrencySelect", "AED", "Choose AED for this example.");
          await selectTarget("#expenseSpendAccountSelect", "Emirates NBD", "Choose the wallet from which the expense is deducted.");
          await selectTarget("#expenseTypeSelect", "Other", "Classify the expense for later filtering and reports.");
          await clickTarget('#expenseEntryForm details summary', "Optional payment details preserve merchant, reference and audit context.");
          await typeTarget('#expenseEntryForm [name="detail_merchant"]', "Demo Stationery Store", "Add a fictional merchant.");
          await typeTarget('#expenseEntryForm [name="notes"]', "Created during guided chapter", "Add a note for the audit trail.");
          await clickTarget('#expenseEntryForm button[type="submit"]', "Save Expense deducts the amount locally and adds it to the expense statement.");
        }),
        chapter("Search and filters", "Use text, wallet, status, date and record-type filters together.", 8, async () => {
          await clickNav("expenses");
          await typeTarget("#searchExpenses", "Cloud", "Search instantly narrows records by item, wallet, note or reference.");
          await lecture("#expensesList", "Only records matching the search remain visible.");
          await clearInput("#searchExpenses");
          await selectTarget("#expenseWalletSelectFilter", "Emirates NBD", "Filter to one wallet without opening the wallet card.");
          await selectTarget("#expenseDateRangeFilter", "This Month", "Date ranges can limit the statement to a useful reporting period.");
          await selectTarget("#expenseRecordsViewFilter", "Receiving", "Switch Records from Expenses to Receiving to inspect top-ups separately.");
          await selectTarget("#expenseRecordsViewFilter", "Internal Transfers", "Internal Transfers has its own record view so money moved between wallets is not mistaken for spending.");
          await selectTarget("#expenseRecordsViewFilter", "Expenses", "Return to the standard expense statement.");
        }),
        chapter("Wallet details and transactions", "Open a wallet, inspect its metadata and review wallet-level activity.", 6, async () => {
          await clickNav("expenses");
          await clickTarget(() => firstWalletQuick("details"), "Details opens the wallet information and its related activity.");
          await lecture("#expenseAccountDetailsModal", "Account Details presents the saved wallet information using the same masking rules as the application.");
          await closeVisibleModal();
          await clickTarget(() => firstVisible('#expenseOverviewWallets [data-wallet-details]'), "Selecting the wallet itself focuses the records list on that account.");
          await lecture("#expensesList", "The statement below now acts as the wallet transaction history for the selected account.");
          await lecture(() => firstExpenseRecordMenu(), "Each record has its own action menu for editing, PDF export and deletion where allowed.");
        }),
        chapter("Edit a transaction", "Open a transaction action menu and demonstrate the edit path.", 5, async () => {
          await clickNav("expenses");
          await clickTarget(() => firstExpenseRecordMenu(), "Open a transaction action menu.");
          await clickTarget(() => firstExpenseEditAction(), "Edit opens the existing transaction editor for the selected record.");
          await lecture(() => firstVisible('.modal:not(.hide) input,.modal:not(.hide) select,.modal:not(.hide) textarea'), "Existing values are loaded into the editor so only the intended fields need to change.");
          await lecture(() => firstVisible('.modal:not(.hide) button[type="submit"],.modal:not(.hide) .btn.primary'), "Saving would update the local demo record and refresh related balances.");
          await closeVisibleModal();
        }),
        chapter("Delete a transaction safely", "Locate delete controls and understand the confirmation/recycle flow without removing data during the lecture.", 4, async () => {
          await clickNav("expenses");
          await clickTarget(() => firstExpenseRecordMenu(), "Open the record action menu again.");
          await lecture(() => firstExpenseDeleteAction(), "Delete is deliberately separated from Edit and PDF. In the real workflow it requires confirmation and follows the app's recycle/security rules.");
          await lecture("#recycleBinBtn", "Deleted records can be reviewed from the Recycle Bin where the application permits restoration.");
          await lecture("#expensesList", "The lecture leaves the record intact so the remaining chapters still have consistent fictional data.");
        }),
        chapter("Download PDFs", "Find wallet and transaction PDF actions and understand what each export represents.", 6, async () => {
          await clickNav("expenses");
          await lecture(() => firstWalletQuick("pdf"), "Wallet PDF creates a statement for the selected wallet, including minimal account details and wallet activity.");
          await clickTarget(() => firstExpenseRecordMenu(), "Open a transaction action menu for a record-level export.");
          await lecture(() => firstExpensePdfAction(), "Download PDF exports this single transaction rather than the full wallet.");
          await clickTarget(textTarget("#expensesPanel", "button.menu-trigger", "New Entry"), "The section menu also contains a complete Expenses PDF.");
          await lecture("#downloadExpensesPdfBtn", "Download PDF from the section menu produces a broader expense statement based on the current data.");
          await clickTarget(textTarget("#expensesPanel", "button.menu-trigger", "New Entry"), "Close the menu and return to the statement.");
        }),
        chapter("Internal wallet transfer", "Move money between two wallets, complete the transfer, and verify both sides in history.", 13, async () => {
          await clickNav("expenses");
          await ensureExpanded("#toggleWalletsBtn", "Expand Wallets Overview so we can start the transfer from a real wallet card.", true);
          const transferBtn = () => byText(doc.getElementById("expenseOverviewWallets"), "button", "Transfer");
          const btn = await waitForTarget(transferBtn);
          if (!btn) {
            await lecture("#expenseOverviewWallets", "Transfer is started from an individual wallet card in Wallets Overview.");
            return;
          }
          await clickTarget(transferBtn, "Choose Transfer on a source wallet. The form will keep the selected wallet as the source.");
          await lecture("#transferFromWallet", "From wallet is the account money will leave. The wallet chosen from Overview is preselected.");
          const toSelect = await waitForTarget("#transferToWallet");
          if (toSelect instanceof HTMLSelectElement) {
            const sourceValue = doc.getElementById("transferFromWallet")?.value;
            const candidate = Array.from(toSelect.options).find(o => o.value && o.value !== sourceValue && !/no other wallets/i.test(o.textContent || ""));
            if (candidate) await selectTarget("#transferToWallet", candidate.value, `Choose ${String(candidate.textContent || "another wallet").trim()} as the destination wallet.`);
          }
          await typeTarget('#transferForm [name="amount"]', "275", "Enter the amount to move from the source wallet.", { direct: true });
          const conversionField = doc.getElementById("transferConversionField");
          if (conversionField && visible(conversionField)) {
            await typeTarget("#conversionRateInput", "1", "For a cross-currency example, enter the conversion rate used to calculate the received amount.", { direct: true });
          } else {
            await lecture('#transferForm [name="received_amount"]', "For same-currency wallets the received amount is calculated automatically at a 1:1 rate.");
          }
          await clickTarget('#transferForm details.expense-optional-details summary', "Open optional Transfer details to document how the movement was made.");
          await selectTarget('#transferForm [name="detail_transfer_method"]', "Bank Transfer", "Record the transfer method.");
          await typeTarget('#transferForm [name="detail_reference"]', "DEMO-TRF-275", "Add a fictional transaction reference for audit context.");
          await typeTarget('#transferForm [name="notes"]', "Guided wallet-to-wallet transfer", "Add a note that will remain attached to both transfer legs.");
          await clickTarget('#transferForm button[type="submit"]', "Transfer Money now records money out from the source wallet and money in to the destination wallet.", { after: 1450 });
          const success = await waitForTarget("#transferSuccessOverlay", 2600);
          if (success) {
            await lecture("#transferSuccessOverlay", "The success overlay confirms the source, destination and transferred amount.", 1350);
            const done = byText(success, "button", "Done");
            if (done) await clickTarget(done, "Close the confirmation and return to Expenses.", { after: 700 });
          }
          await selectTarget("#expenseRecordsViewFilter", "Internal Transfers", "Open Internal Transfers. These movements stay separate from ordinary spending and receiving.");
          await lecture("#expensesList", "The newly created movement is now visible in transfer history with source, destination and transfer details.");
        })
      ]
    },

    goods: {
      label: "Inventory",
      chapters: [
        chapter("Inventory overview", "Expand the Inventory Overview, inspect stock totals, then use search and status filters.", 8, async () => {
          await clickNav("goods");
          await ensureExpanded("#toggleMainOverviewBtn", "Expand Inventory Overview to reveal purchase, sales, stock, profit and loss summaries.", true);
          await lecture("#statsGrid", "The overview gives cross-inventory totals before you work with individual stock lines.");
          await lecture("#inventoryStockView", "Inventory shows purchased stock, sold quantities, remaining stock and value from the fictional data.");
          await typeTarget("#searchGoods", "iPhone", "Search by product, brand or variant.");
          await lecture("#inventoryStockView", "The stock view immediately narrows to matching items.");
          await clearInput("#searchGoods");
          await selectTarget("#inventoryStatusFilter", "In Stock", "Stock status makes it easy to isolate available products.");
          await lecture(() => firstVisible('#inventoryStockView .inventorySkuHistoryBtn,#inventoryStockView .inventory-sku-card,#inventoryStockView article'), "Each stock group exposes its own history, invoice and action controls for deeper inspection.");
        }),
        chapter("Add purchased stock", "Create a new inventory item with quantity, cost and selling price.", 8, async () => {
          await clickNav("goods");
          await clickTarget("#inventoryActionsBtn", "Open Inventory actions.");
          await clickTarget("#openGoodsBoughtBtn", "Add Item opens the existing purchase form.");
          await typeTarget("#goodsBoughtForm .inventory-purchase-line .goods-buy-name", "USB-C Travel Hub", "Enter a new fictional product.");
          await typeTarget("#goodsBoughtForm .inventory-purchase-line .goods-buy-qty", "3", "Enter purchased quantity.", { direct: true });
          await typeTarget("#goodsBoughtForm .inventory-purchase-line .goods-buy-price", "85", "Enter cost per unit.", { direct: true });
          await typeTarget("#goodsBoughtForm .inventory-purchase-line .goods-buy-selling", "129", "Enter intended selling price.", { direct: true });
          await clickTarget('#goodsBoughtForm button[type="submit"]', "Save adds the stock line to this local demo session.");
        }),
        chapter("Record a sale", "Use the sale workflow and understand customer/invoice information.", 6, async () => {
          await clickNav("goods");
          await clickTarget("#inventoryActionsBtn", "Open Inventory actions for sales and customer workflows.");
          const sale = () => firstVisible('#openGoodsSoldBtn,#openInventorySaleBtn') || byText(doc, "button", "Sell");
          await clickTarget(sale, "Record Sale opens the existing sales form.");
          await lecture(() => firstVisible('.modal:not(.hide) select,.modal:not(.hide) input'), "Select an item, quantity and customer before finalizing a sale.");
          await lecture(() => firstVisible('.modal:not(.hide) [name*="customer"],.modal:not(.hide) [name*="invoice"]'), "Customer and invoice fields connect sales history with customer balances and PDFs.");
          await lecture(() => firstVisible('.modal:not(.hide) button[type="submit"],.modal:not(.hide) .btn.primary'), "Saving would decrease stock and create the sale transaction in the local demo.");
          await closeVisibleModal();
        }),
        chapter("Customers and balances", "Open customer records, invoices and outstanding balances.", 5, async () => {
          await clickNav("goods");
          await clickTarget("#openInventoryCustomersBtn", "Customer view groups inventory sales by customer.");
          await lecture("#inventoryCustomersView", "Each customer card summarizes invoices, paid amounts and outstanding balances.");
          await lecture(() => firstVisible('#inventoryCustomersView button'), "Customer actions open invoice history, settlements and PDFs.");
          await lecture(() => firstVisible('#inventoryCustomersView .inventoryCustomerInvoicePdfBtn'), "Invoice PDF is available at invoice level where a sale has an invoice record.");
          const back = () => byText(doc.getElementById("inventoryCustomersView"), "button", "Inventory");
          if (resolve(back)) await clickTarget(back, "Return to Inventory stock."); else currentStep += 1;
        }),
        chapter("Edit inventory records", "Find edit controls for purchases and catalog records.", 4, async () => {
          await clickNav("goods");
          await lecture(() => firstVisible('[data-action="edit-bought"],[data-action="edit"],[title="Edit"]'), "Edit controls preserve the existing product identity while allowing correctable fields to be changed.");
          await lecture("#inventoryStockView", "Purchased stock and sale records keep separate history, so edits remain understandable.");
          await lecture(() => firstVisible('.goodsActionBtn,.sectionSkuActionBtn,.inventoryCatalogActionBtn'), "Action menus group edit, PDF and delete controls without cluttering each stock card.");
          await lecture("#inventoryStockView", "The chapter does not alter a stock record, leaving all later lessons deterministic.");
        }),
        chapter("Delete and lifecycle controls", "Understand safe deletion of stock and catalog records.", 4, async () => {
          await clickNav("goods");
          await lecture(() => firstVisible('[data-action="delete-item"],[data-action="delete"],.danger'), "Delete appears only where the current record can be removed safely; historical sales remain distinct.");
          await lecture(() => firstVisible('.inventoryCatalogActionBtn[data-action="delete"]'), "Catalog entities use their own lifecycle rules so a taxonomy change does not rewrite old invoices.");
          await lecture("#recycleBinBtn", "Where applicable, deleted operational records can be reviewed through the Recycle Bin.");
          await lecture("#inventoryStockView", "No fictional stock is removed during this lecture.");
        }),
        chapter("Inventory PDFs and exports", "Locate item, receipt, invoice and section exports.", 5, async () => {
          await clickNav("goods");
          await lecture(() => firstVisible('[data-action="pdf"],[title*="PDF"]'), "Item-level PDF actions export the selected stock or transaction context.");
          await lecture(() => firstVisible('.inventoryCustomerInvoicePdfBtn'), "Customer invoice PDFs represent individual sales invoices.");
          await clickTarget("#inventoryActionsBtn", "Open the section actions menu.");
          await lecture(() => byText(doc, "button", "Download PDF"), "Section PDF exports a broader inventory report.");
          await lecture(() => firstVisible('[data-section-csv-download="goods"],[data-section-csv-download="inventory"]'), "CSV export is available for spreadsheet workflows where enabled.");
        }),
        chapter("Categories, brands and variants", "Explore catalog structure used to keep large inventories organized.", 4, async () => {
          await clickNav("goods");
          await lecture(() => firstVisible('[data-inventory-view],#inventoryCatalogView,.inventory-category'), "Inventory can be organized by category, brand, sub-brand and variant without changing the core stock calculations.");
          await lecture(() => firstVisible('[data-delete-brand],[data-delete-variant]'), "Brand and variant controls are managed separately from stock transactions.");
          await lecture("#inventoryStockView", "Search and filters continue to work across this structured catalog.");
          await lecture("#inventoryActionsBtn", "Use Inventory actions to enter the appropriate catalog or stock workflow.");
        }),
        chapter("Barcode and scanning tools", "Locate product barcode support and scanner-oriented workflows.", 3, async () => {
          await clickNav("goods");
          await lecture(() => firstVisible('[id*="Barcode"],[data-barcode],button[title*="barcode" i]'), "Barcode tools connect product lookup with fast stock handling when available on the device.");
          await lecture("#searchGoods", "Even without a camera, product codes can be searched directly from the inventory search field.");
          await lecture("#inventoryStockView", "The same underlying item record is used whether it was found by search, barcode or catalog navigation.");
        })
      ]
    },

    accounting: {
      label: "Accounting ERP",
      chapters: [
        chapter("Accounting overview", "Open formal books and understand the accounting workspace.", 5, async () => {
          await clickNav("accounting");
          await lecture("#accountingPanel", "Accounting ERP sits beside operational finance and uses formal double-entry records.");
          await lecture("#accountingWorkspaceBody", "The overview summarizes posted journals, documents, receivables, payables and financial performance.");
          await lecture(() => firstVisible('#accountingPanel [data-acct-view]'), "The Accounting navigation separates chart of accounts, journals, sales, purchases, banking, tax, reports and audit history.");
          await lecture(() => firstVisible('#accountingWorkspaceBody .accounting-view-guide'), "Each view includes guidance explaining the correct accounting lifecycle.");
          await lecture("#accountingWorkspaceBody", "Operational entries and formal books remain understandable as separate but related layers.");
        }),
        chapter("Chart of Accounts", "Inspect account codes, types, balances and edit/archive controls.", 5, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="accounts"]'), "Open Chart of Accounts.");
          await lecture("#accountingWorkspaceBody", "Accounts are grouped by type and carry their own balances in the base books.");
          await lecture(() => firstVisible('[data-acct-action="edit-account"]'), "Editable accounts expose a dedicated edit control.");
          await lecture(() => firstVisible('[data-acct-action="archive-account"]'), "Used master accounts are archived instead of silently erasing historical meaning.");
          await lecture(() => firstVisible('[data-acct-action="new-account"]'), "New accounts can be added when the chart needs additional classifications.");
        }),
        chapter("Journal entry", "Create and understand a balanced double-entry journal.", 6, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="journals"]'), "Open Journals.");
          await clickTarget(() => firstVisible('[data-acct-action="new-journal"]'), "New Journal opens the double-entry editor.");
          await lecture(() => firstVisible('.modal:not(.hide) form'), "A journal has a date, reference, description and at least two balanced lines.");
          await lecture(() => firstVisible('.modal:not(.hide) [name*="debit"],.modal:not(.hide) [name*="credit"]'), "Debits and credits must balance before a journal can be posted.");
          await lecture(() => firstVisible('.modal:not(.hide) .btn.primary'), "Drafts can be saved first and posted only when ready.");
          await closeVisibleModal();
        }),
        chapter("Sales documents", "Explore quotations, orders, invoices, receipts and PDF controls.", 6, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="sales"]'), "Open Sales documents.");
          await lecture("#accountingWorkspaceBody", "Sales records move through a controlled document lifecycle instead of being overwritten after issue.");
          await lecture(() => firstVisible('[data-acct-action="new-sales-document"]'), "New Sales Document starts a quote, order or invoice workflow.");
          await lecture(() => firstVisible('[data-acct-action="view-document"]'), "View opens a complete issued or draft document with line details.");
          await lecture(() => firstVisible('[data-acct-action="record-payment"]'), "Record Payment applies customer receipts against open invoices.");
          await lecture(() => firstVisible('[data-acct-action="document-pdf"]'), "PDF exports the selected accounting document.");
        }),
        chapter("Purchases and suppliers", "Explore purchase orders, receipts, bills and supplier balances.", 5, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="purchases"]'), "Open Purchases.");
          await lecture("#accountingWorkspaceBody", "Purchase documents track supplier obligations and expense or inventory acquisition.");
          await lecture(() => firstVisible('[data-acct-action="new-purchases-document"]'), "New Purchase Document starts PO, receipt or bill workflows.");
          await lecture(() => firstVisible('[data-acct-action="record-payment"]'), "Supplier payments reduce open balances while preserving document history.");
          await lecture(() => firstVisible('[data-acct-action="document-pdf"]'), "Supplier documents can be exported to PDF as well.");
        }),
        chapter("Contacts", "Manage customers and suppliers without losing document history.", 4, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="contacts"]'), "Open Contacts.");
          await lecture("#accountingWorkspaceBody", "Customers and suppliers display document counts and open balances.");
          await lecture(() => firstVisible('[data-acct-action="edit-contact"]'), "Contact details can be corrected through Edit.");
          await lecture(() => firstVisible('[data-acct-action="archive-contact"]'), "Used contacts are archived rather than erased from historical documents.");
        }),
        chapter("Bank reconciliation", "Inspect imported bank rows, suggestions and matching controls.", 5, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="reconciliation"]'), "Open Bank Reconciliation.");
          await lecture("#accountingWorkspaceBody", "Bank rows can be matched with posted journals to reconcile the books.");
          await lecture(() => firstVisible('[data-acct-action="match-bank"],[data-acct-action="accept-bank-suggestion"]'), "Matching connects a bank movement with the accounting journal that explains it.");
          await lecture(() => firstVisible('[data-acct-action="import-bank"]'), "Bank statement import accelerates reconciliation while duplicate fingerprints prevent repeated rows.");
          await lecture(() => firstVisible('[data-acct-action="new-bank-transaction"]'), "Manual bank rows are also possible for controlled demonstrations and corrections.");
        }),
        chapter("Tax and VAT", "Review period tax activity and configured tax codes.", 4, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="tax"]'), "Open Tax.");
          await lecture("#accountingWorkspaceBody", "Tax analysis aggregates posted taxable documents for the selected reporting period.");
          await lecture(() => firstVisible('#accountingWorkspaceBody select,#accountingWorkspaceBody input[type="date"]'), "Period and tax controls define which activity is included.");
          await lecture("#accountingWorkspaceBody", "VAT collected and VAT paid remain traceable to the underlying posted documents.");
        }),
        chapter("Financial reports", "Open accounting reports and understand the reporting period.", 5, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="reports"]'), "Open Reports.");
          await lecture("#accountingWorkspaceBody", "Formal reports draw from posted double-entry books rather than informal estimates.");
          await lecture(() => firstVisible('#accountingWorkspaceBody input[type="date"]'), "Choose the reporting period.");
          await lecture(() => firstVisible('#accountingWorkspaceBody select'), "Select the required financial statement or report type where available.");
          await lecture("#accountingWorkspaceBody", "The report table keeps the base currency and period visible for interpretation.");
        }),
        chapter("Dimensions and tracking", "Explore departments, projects and analytical dimensions used to classify accounting activity.", 5, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-view="dimensions"]'), "Open Dimensions.");
          await lecture("#accountingWorkspaceBody", "Dimensions add analytical context such as departments, projects or internal reporting segments without altering double-entry principles.");
          await lecture(() => firstVisible('#accountingContextActions button'), "Context actions expose the dimension-management tools supported by this workspace.");
          await lecture("#accountingSearch", "Search narrows the current analytical view without changing the books.");
          await lecture("#accountingWorkspaceBody", "These classifications can then support internal reporting across the accounting workspace.");
        }),
        chapter("Accounting settings and audit trail", "Review base currency, fiscal controls, books lock and immutable history.", 6, async () => {
          await clickNav("accounting");
          await clickTarget(() => firstVisible('[data-acct-action="settings"]'), "Open Accounting Settings.");
          await lecture("#acctSettingsForm", "Base currency, invoice terms, fiscal year, books lock date and management tax settings live here.");
          await lecture(() => firstVisible('#acctSettingsForm [name="books_lock_date"]'), "Books Lock Date prevents posting into closed periods when configured by the owner.");
          await closeVisibleModal();
          await clickTarget(() => firstVisible('[data-acct-view="audit"]'), "Open the Accounting Audit Trail.");
          await lecture("#accountingWorkspaceBody", "The audit trail is append-only evidence of master-data, document, journal, payment and reconciliation actions.");
        })
      ]
    },

    loans: {
      label: "Loans",
      chapters: [
        chapter("Loans overview", "Expand the currency overview, inspect Loan Given and Loan Taken, then open a real loan timeline.", 9, async () => {
          await clickNav("loans");
          await ensureExpanded("#toggleMainOverviewBtn", "Expand Loans Overview to reveal balances by currency before opening individual records.", true);
          await lecture("#statsGrid", "The overview summarizes principal and open balances for loans given and loans taken in each currency.");
          await lecture("#givenPanel", "Loan Given tracks money owed back to you, including partial repayments.");
          const givenHistory = () => firstVisible('#givenList .loanHistoryToggle[data-history-toggle]');
          await ensureExpanded(givenHistory, "Expand an actual Loan Given card to reveal its timeline.", true);
          await lecture(() => firstVisible('#givenList details[open] .loan-transaction-row'), "The expanded timeline separates principal and every repayment chronologically.");
          await clickTarget(textTarget("#givenPanel", "button.loan-mode-btn", "Loan Taken"), "Switch to Loan Taken / Returned Back.");
          await lecture("#takenPanel", "Loan Taken tracks money you owe and the amounts returned to the lender.");
          const takenHistory = () => firstVisible('#takenList .loanHistoryToggle[data-history-toggle]');
          await ensureExpanded(takenHistory, "Expand a Loan Taken card to inspect its repayment history.", true);
          await lecture(() => firstVisible('#takenList details[open] .loan-transaction-row'), "The lender timeline uses the same principal, repayment and remaining-balance structure.");
        }),
        chapter("Create Loan Given", "Create a fictional receivable loan.", 7, async () => {
          await clickNav("loans");
          await clickTarget(textTarget("#givenPanel", "button.menu-trigger", "New Entry"), "Open the Loan Given actions.");
          await clickTarget(() => doc.querySelector('#givenPanel button[data-direction="given"][data-open-modal="principal"]'), "Choose Loan Given.");
          await typeTarget('#principalModalForm [name="person_name"]', "Hassan Demo Trading", "Enter the borrower.");
          await typeTarget('#principalModalForm [name="principal_amount"]', "3200", "Enter the principal amount.", { direct: true });
          await selectTarget("#principalCurrencySelect", "AED", "Choose the loan currency.");
          await typeTarget('#principalModalForm [name="notes"]', "Guided bridge loan", "Add a contextual note.");
          await clickTarget("#principalSubmitBtn", "Save creates the loan only inside this demo session.");
        }),
        chapter("Record repayment received", "Apply a real fictional repayment against a Loan Given balance and confirm the timeline updates.", 8, async () => {
          await clickNav("loans");
          await clickTarget(textTarget("#givenPanel", "button.menu-trigger", "New Entry"), "Open the Loan Given actions.");
          await clickTarget(() => doc.querySelector('#givenPanel button[data-direction="given"][data-open-modal="payment"]'), "Received Back opens the repayment form.");
          await lecture("#modalLoanSelect", "Select the borrower whose outstanding balance is being reduced.");
          await typeTarget('#paymentModalForm [name="action_amount_0"]', "250", "Enter the amount received back.", { direct: true });
          await typeTarget('#paymentModalForm [name="notes_0"]', "Guided repayment received", "Add a repayment remark for the audit trail.");
          await lecture("#modalPaymentWalletSelect", "Optionally choose a wallet to receive the repayment, or leave Skip wallet entry for a pure loan record.");
          await clickTarget("#paymentSubmitBtn", "Save the repayment into the local demo ledger.", { after: 1050 });
          const expand = () => firstVisible('#givenList .loanHistoryToggle[data-history-toggle]');
          await ensureExpanded(expand, "Expand the borrower timeline to confirm the new repayment is attached to the same loan.", true);
          await lecture(() => firstVisible('#givenList details[open] .loan-transaction-row'), "The timeline now shows principal and repayments together with the recalculated remaining balance.");
        }),
        chapter("Create Loan Taken", "Create a fictional payable loan from lender details through final save.", 8, async () => {
          await clickNav("loans");
          await clickTarget(textTarget("#givenPanel", "button.loan-mode-btn", "Loan Taken"), "Switch to Loan Taken.");
          await clickTarget(textTarget("#takenPanel", "button.menu-trigger", "New Entry"), "Open Loan Taken actions.");
          await clickTarget(() => doc.querySelector('#takenPanel button[data-direction="taken"][data-open-modal="principal"]'), "Loan Taken opens the principal form.");
          await typeTarget('#principalModalForm [name="person_name"]', "Demo Capital Partners", "Enter the lender name.");
          await typeTarget('#principalModalForm [name="principal_amount"]', "4800", "Enter the amount borrowed.", { direct: true });
          await selectTarget("#principalCurrencySelect", "AED", "Choose the loan currency.");
          await typeTarget('#principalModalForm [name="notes"]', "Guided working-capital loan", "Add the purpose or agreement context.");
          await clickTarget("#principalSubmitBtn", "Save creates the payable loan in this local demo session.");
        }),
        chapter("Expand transaction history", "Open one loan card, inspect its full timeline, and use its transaction action menu.", 7, async () => {
          await clickNav("loans");
          const expand = () => firstVisible('#givenList .loanHistoryToggle[data-history-toggle]');
          await ensureExpanded(expand, "Expand a borrower card using its real timeline chevron.", true);
          await lecture(() => firstVisible('#givenList details[open] .loan-transaction-row'), "Principal and repayment rows are now visible inside the expanded loan card.");
          const txMenu = () => firstVisible('#givenList details[open] .loan-tx-menu-btn');
          await clickTarget(txMenu, "Open the action menu for one transaction inside the expanded timeline.");
          await lecture(() => firstVisible('.loan-tx-menu.is-portal [data-loan-tx-edit-menu],#givenList details[open] [data-loan-tx-edit-menu]'), "Edit corrects the selected principal or repayment entry.");
          await lecture(() => firstVisible('.loan-tx-menu.is-portal [data-loan-tx-pdf-menu],#givenList details[open] [data-loan-tx-pdf-menu]'), "Download PDF exports that individual transaction.");
          await lecture(() => firstVisible('.loan-tx-menu.is-portal [data-loan-tx-delete-menu],#givenList details[open] [data-loan-tx-delete-menu]'), "Delete is kept as a distinct destructive action.");
          await clickTarget(txMenu, "Close the transaction menu while leaving the timeline expanded.");
        }),
        chapter("Search and filters", "Find a borrower quickly and move between Given and Taken records.", 5, async () => {
          await clickNav("loans");
          await typeTarget("#searchGiven", "Ahmad", "Search Loan Given by borrower or notes.");
          await lecture("#givenPanel .list", "The list narrows immediately.");
          await clearInput("#searchGiven");
          await clickTarget(textTarget("#givenPanel", "button.loan-mode-btn", "Loan Taken"), "Switch to Loan Taken.");
          await typeTarget("#searchTaken", "Skyline", "Search the lender records independently.");
        }),
        chapter("Edit, delete and PDF actions", "Open the real loan action menus and inspect edit, delete and PDF controls without removing data.", 8, async () => {
          await clickNav("loans");
          const menu = () => firstVisible('#givenList .person-menu-btn');
          await clickTarget(menu, "Open the borrower-level More Actions menu.");
          await lecture(() => firstVisible('.menu-dropdown.open .personActionBtn[data-action="pdf"]'), "Download PDF exports the complete statement for this borrower.");
          await lecture(() => firstVisible('.menu-dropdown.open .personActionBtn[data-action="edit-name"]'), "Edit Name corrects the borrower label without rewriting transaction history.");
          await lecture(() => firstVisible('.menu-dropdown.open .personActionBtn[data-action="delete"]'), "Delete Record is intentionally separated as a destructive action.");
          await clickTarget(menu, "Close the borrower menu.");
          const expand = () => firstVisible('#givenList .loanHistoryToggle[data-history-toggle]');
          await ensureExpanded(expand, "Expand the timeline to reach transaction-level actions.", true);
          const txMenu = () => firstVisible('#givenList details[open] .loan-tx-menu-btn');
          await clickTarget(txMenu, "Open one transaction's action menu.");
          await lecture(() => firstVisible('.loan-tx-menu.is-portal [data-loan-tx-pdf-menu],#givenList details[open] [data-loan-tx-pdf-menu]'), "A single transaction can be exported independently from the borrower statement.");
        }),
        chapter("Loan Taken repayment", "Record a real Returned Back payment and inspect the lender timeline.", 8, async () => {
          await clickNav("loans");
          await clickTarget(textTarget("#givenPanel", "button.loan-mode-btn", "Loan Taken"), "Switch to Loan Taken.");
          await clickTarget(textTarget("#takenPanel", "button.menu-trigger", "New Entry"), "Open Loan Taken actions.");
          await clickTarget(() => doc.querySelector('#takenPanel button[data-direction="taken"][data-open-modal="payment"]'), "Returned Back opens the repayment form.");
          await typeTarget('#paymentModalForm [name="action_amount_0"]', "300", "Enter the amount being returned to the lender.", { direct: true });
          await typeTarget('#paymentModalForm [name="notes_0"]', "Guided lender repayment", "Add a repayment note.");
          await clickTarget("#paymentSubmitBtn", "Save reduces the outstanding Loan Taken balance.", { after: 1000 });
          const expand = () => firstVisible('#takenList .loanHistoryToggle[data-history-toggle]');
          await ensureExpanded(expand, "Expand the lender timeline to verify the repayment.", true);
          await lecture(() => firstVisible('#takenList details[open] .loan-transaction-row'), "The new repayment appears chronologically with the recalculated remaining balance.");
        })
      ]
    },

    installments: {
      label: "Installments",
      chapters: [
        chapter("Bought and Sold plans", "Expand the shared overview, inspect both plan types, and open a plan's detailed schedule workspace.", 10, async () => {
          await clickNav("installments");
          await ensureExpanded("#toggleMainOverviewBtn", "Expand the Overview above Installments to inspect currency-level outstanding balances.", true);
          await lecture("#statsGrid", "The overview provides a high-level balance context before you inspect individual plans.");
          await lecture("#installmentsPanel", "Bought Plans track installments you must pay; Sold Plans track installments customers owe you.");
          await clickTarget(() => doc.querySelector('#installmentsPanel button[data-installment-plan-view="sold"]'), "Switch to Sold Plans.");
          await lecture("#installmentsList", "Sold plans preserve customer balance, schedule and received payments.");
          await clickTarget(() => doc.querySelector('#installmentsPanel button[data-installment-plan-view="bought"]'), "Return to Bought Plans.");
          await lecture("#installmentsList", "Bought plans show remaining payable amounts and payment history.");
          await clickTarget(() => firstVisible('#installmentsList .installment-plan-card'), "Open a real installment plan card to inspect its detailed schedule, progress and history.");
          await lecture("#sectionDetailsModal", "The plan detail overlay keeps metrics, schedule and activity together without changing the underlying record.");
          await closeVisibleModal();
        }),
        chapter("Create a Bought Plan", "Create a financed purchase with down payment and schedule preview.", 8, async () => {
          await clickNav("installments");
          await clickTarget(textTarget("#installmentsPanel", "button.menu-trigger", "New Entry"), "Open installment actions.");
          await clickTarget("#installmentNewPlanBtn", "New Bought Plan opens the plan form.");
          await typeTarget('#principalModalForm [name="person_name"]', "Demo Equipment Plan", "Enter the item or financing label.");
          await typeTarget('#principalModalForm [name="principal_amount"]', "6000", "Enter total financed amount.", { direct: true });
          await typeTarget("#installmentDownPaymentInput", "1000", "Enter the down payment.", { direct: true });
          await typeTarget("#installmentCountInput", "6", "Set the number of installments.", { direct: true });
          await lecture("#installmentSchedulePreview", "The schedule preview recalculates before saving.");
          await clickTarget("#principalSubmitBtn", "Save creates the Bought Plan in the local demo.");
        }),
        chapter("Create a Sold Plan", "Create a customer installment receivable with advance, schedule and notes.", 9, async () => {
          await clickNav("installments");
          await clickTarget(() => doc.querySelector('#installmentsPanel button[data-installment-plan-view="sold"]'), "Switch to Sold Plans.");
          await clickTarget(textTarget("#installmentsPanel", "button.menu-trigger", "New Entry"), "Open Sold Plan actions.");
          await clickTarget("#installmentNewPlanBtn", "New Sold Plan uses the same schedule engine but records a customer receivable.");
          await typeTarget('#principalModalForm [name="person_name"]', "Demo Customer Furnishings", "Enter the customer or sale label.");
          await typeTarget('#principalModalForm [name="principal_amount"]', "7200", "Enter the total selling amount.", { direct: true });
          await typeTarget("#installmentDownPaymentInput", "1200", "Enter the advance received.", { direct: true });
          await typeTarget("#installmentCountInput", "6", "Set the number of receivable installments.", { direct: true });
          await typeTarget('#principalModalForm [name="notes"]', "Guided sold installment plan", "Add sale context.");
          await lecture("#installmentSchedulePreview", "The schedule preview recalculates the receivable before saving.");
          await clickTarget("#principalSubmitBtn", "Save creates the Sold Plan locally.");
        }),
        chapter("Record an installment payment", "Record a real Bought Plan payment and see it alter the plan balance.", 8, async () => {
          await clickNav("installments");
          await clickTarget(() => doc.querySelector('#installmentsPanel button[data-installment-plan-view="bought"]'), "Use Bought Plans for this payment example.");
          await clickTarget(textTarget("#installmentsPanel", "button.menu-trigger", "New Entry"), "Open installment actions.");
          await clickTarget("#installmentNewPaymentBtn", "Pay Installment opens the actual payment form.");
          await lecture("#modalLoanSelect", "Choose the installment plan that receives this payment.");
          await typeTarget('#paymentModalForm [name="action_amount_0"]', "400", "Enter the installment amount.", { direct: true });
          await typeTarget('#paymentModalForm [name="notes_0"]', "Guided installment payment", "Add a payment remark.");
          await lecture("#installmentPaymentPreview", "Allocation preview shows how the payment applies across the schedule.");
          await clickTarget("#paymentSubmitBtn", "Save updates the plan's paid and remaining totals.", { after: 1050 });
          await clickTarget(() => firstVisible('#installmentsList .installment-plan-card'), "Open the plan again to inspect the refreshed progress and schedule.");
        }),
        chapter("Expand schedule and history", "Open the real plan detail overlay, inspect schedule/progress, and use the plan action menu.", 7, async () => {
          await clickNav("installments");
          await clickTarget(() => firstVisible('#installmentsList .installment-plan-card'), "Open one installment plan by clicking the plan card itself.");
          await lecture("#sectionDetailsModal", "The detail overlay expands the plan into its complete financial view.");
          await lecture(() => firstVisible('#sectionDetailsModal .section-details-metric,#sectionDetailsModal .section-details-chart-card,#sectionDetailsModal canvas'), "Charts and metrics explain total, paid, remaining and progress over time.");
          await closeVisibleModal();
          const menu = () => firstVisible('#installmentsList .person-menu-btn');
          await clickTarget(menu, "Open the plan actions menu.");
          await lecture(() => firstVisible('[data-person-menu-panel].open .installmentActionBtn[data-action="schedule"]'), "View Schedule opens the due-date and payment schedule for the selected plan.");
          await lecture(() => firstVisible('[data-person-menu-panel].open .installmentActionBtn[data-action="pay"]'), "Pay Installment records the next payment against this same plan.");
          await clickTarget(menu, "Close the actions menu after reviewing the available plan workflows.");
        }),
        chapter("Search and status filters", "Find plans by name and status.", 4, async () => {
          await clickNav("installments");
          await typeTarget("#searchInstallments", "MacBook", "Search by plan name, party or note.");
          await lecture("#installmentsList", "Matching plans remain visible.");
          await clearInput("#searchInstallments");
          await lecture(() => firstVisible('#installmentsPanel select'), "Status and view filters narrow plans further when required.");
        }),
        chapter("Edit and delete", "Open the actual plan menu and inspect correction and deletion controls without destroying demo data.", 7, async () => {
          await clickNav("installments");
          const menu = () => firstVisible('#installmentsList .person-menu-btn');
          await clickTarget(menu, "Open the selected plan's More Actions menu.");
          await lecture(() => firstVisible('[data-person-menu-panel].open .installmentActionBtn[data-action="edit"]'), "Edit Plan / Schedule corrects permitted plan details and schedule settings.");
          await lecture(() => firstVisible('[data-person-menu-panel].open .installmentActionBtn[data-action="pay"]'), "Pay Installment records another payment against the same plan.");
          await lecture(() => firstVisible('[data-person-menu-panel].open .installmentActionBtn[data-action="reminder"]'), "Reminder adds a due follow-up to the plan.");
          await lecture(() => firstVisible('[data-person-menu-panel].open .installmentActionBtn[data-action="delete"]'), "Delete Record remains visually separated as a destructive action.");
          await clickTarget(menu, "Close the menu while leaving the plan unchanged.");
          await lecture("#installmentsList", "All fictional installment records remain available for the next chapters.");
        }),
        chapter("Installment PDFs", "Open the plan menu and locate the real statement export, then review section CSV export.", 6, async () => {
          await clickNav("installments");
          const menu = () => firstVisible('#installmentsList .person-menu-btn');
          await clickTarget(menu, "Open the plan actions menu.");
          await lecture(() => firstVisible('[data-person-menu-panel].open .installmentActionBtn[data-action="pdf"]'), "Download Statement exports the selected plan together with its schedule and payment history.");
          await clickTarget(menu, "Close the plan menu.");
          await clickTarget(textTarget("#installmentsPanel", "button.menu-trigger", "New Entry"), "Open section actions.");
          await lecture(() => firstVisible('#installmentsPanel [data-section-csv-download="installments"]'), "Download CSV exports the broader installment list for spreadsheet work.");
          await lecture("#installmentsList", "Plan statements and section exports use the same fictional local data shown on screen.");
        })
      ]
    },

    assets: {
      label: "Assets",
      chapters: [
        chapter("Asset register overview", "Search the register, open a real asset, and inspect its detailed financial workspace.", 8, async () => {
          await clickNav("assets");
          await lecture("#assetsList", "The asset register tracks vehicles, equipment and other owned resources with their financial history.");
          await typeTarget("#searchAssets", "Tesla", "Search finds an asset by name or description.");
          await lecture("#assetsList", "Only matching assets remain visible.");
          await clearInput("#searchAssets");
          await lecture(() => firstVisible('#assetsPanel select'), "Status and type filters refine the register further.");
          await clickTarget(() => firstVisible('#assetsList [data-asset-open]'), "Open a real asset card to inspect the complete asset detail workspace.");
          await lecture("#assetDetailModal", "Asset details combine acquisition information, current status, transactions and report controls.");
          await lecture(() => firstVisible('#assetDetailModal [data-asset-action="add-tx"]'), "Add creates a new asset-specific transaction such as expense, revenue or investment.");
          await closeVisibleModal();
        }),
        chapter("Add an asset", "Create a new asset with type, currency, purchase date and cost.", 8, async () => {
          await clickNav("assets");
          await clickTarget("#openAddAssetBtn", "Add Asset opens the existing asset form.");
          await typeTarget("#assetFormName", "Demo Delivery Van", "Enter an asset name.");
          await selectTarget("#assetFormType", "Vehicle", "Choose the asset type.");
          await selectTarget("#assetFormCurrency", "AED", "Assign purchase currency.");
          await typeTarget("#assetFormPurchaseDate", "2026-09-10", "Enter the purchase date.", { direct: true });
          await typeTarget("#assetFormPurchasePrice", "68000", "Enter acquisition cost.", { direct: true });
          await typeTarget("#assetFormDescription", "Guided demo operations vehicle", "Add a useful description.");
          await clickTarget("#assetFormSaveBtn", "Save adds the asset locally.");
        }),
        chapter("Wallet deduction", "See how acquisition cost can optionally be linked to a wallet.", 4, async () => {
          await clickNav("assets");
          await clickTarget("#openAddAssetBtn", "Open Add Asset again.");
          await lecture(() => firstVisible('#assetForm [name*="wallet"],#assetModal [name*="wallet"],#assetFormWallet'), "Wallet selection lets an asset purchase deduct from the chosen wallet when that option is enabled.");
          await lecture(() => firstVisible('#assetForm [name*="deduct"],#assetModal [name*="deduct"],label:has(input[type="checkbox"])'), "The deduction choice is explicit so an imported or historical asset can also be recorded without changing a wallet.");
          await closeVisibleModal();
        }),
        chapter("Asset transactions", "Add expenses, revenue or investment against an existing asset.", 5, async () => {
          await clickNav("assets");
          await clickTarget(() => firstVisible('#assetsList [data-asset-open],#assetsList .asset-card,#assetsList button'), "Open an existing asset.");
          await lecture(() => firstVisible('.modal:not(.hide) [data-asset-action],.modal:not(.hide) button'), "Asset details include transaction actions for maintenance, additional investment, operating cost or income where supported.");
          await lecture(() => firstVisible('.modal:not(.hide) .asset-transaction,.modal:not(.hide) .transaction-history'), "The asset timeline preserves every financial event separately from the purchase price.");
          await lecture(() => firstVisible('.modal:not(.hide) [title*="PDF"],.modal:not(.hide) button'), "PDF/report controls export the selected asset history.");
          await closeVisibleModal();
        }),
        chapter("Edit an asset", "Open the real asset action menu and inspect edit, report and delete controls.", 7, async () => {
          await clickNav("assets");
          const menu = () => firstVisible('#assetsList [data-asset-menu-trigger]');
          await clickTarget(menu, "Open the asset card action menu.");
          await lecture(() => firstVisible('.asset-card-dropdown.open [data-asset-card-action="edit"]'), "Edit Asset corrects the master record while preserving transaction history.");
          await lecture(() => firstVisible('.asset-card-dropdown.open [data-asset-card-action="pdf-full"]'), "Full Detailed Report exports acquisition and activity history.");
          await lecture(() => firstVisible('.asset-card-dropdown.open [data-asset-card-action="sell"]'), "Sell / Dispose records an ownership exit without deleting history.");
          await lecture(() => firstVisible('.asset-card-dropdown.open [data-asset-card-action="delete"]'), "Delete is reserved for incorrect records and remains a separate destructive action.");
          await clickTarget(menu, "Close the asset action menu.");
          await lecture("#assetsList", "The demo leaves the fictional asset unchanged.");
        }),
        chapter("Sale or disposal", "Understand how an asset leaves active ownership without losing history.", 4, async () => {
          await clickNav("assets");
          await lecture(() => firstVisible('#assetsList [data-action*="sell"],#assetsList [data-action*="dispose"],#assetsList button[title*="Sell" i]'), "Sale or disposal records proceeds, date and costs rather than deleting the asset history.");
          await lecture("#assetsList", "Disposed assets remain reportable so profit, loss and historical ownership can still be explained.");
          await lecture(() => firstVisible('#assetsPanel select'), "Status filters can isolate active, sold or disposed assets.");
          await lecture("#assetsList", "No asset is disposed during the lecture.");
        }),
        chapter("Asset PDFs", "Locate asset-level and section-level report exports.", 4, async () => {
          await clickNav("assets");
          await lecture(() => firstVisible('#assetsList [title*="PDF"],#assetsList [data-action="pdf"]'), "Asset PDF exports the selected asset and its financial activity.");
          await lecture(() => firstVisible('#assetsPanel button[title*="PDF"],#assetsPanel [data-section-pdf]'), "Section exports summarize the whole asset register.");
          await lecture("#assetsList", "Reports use the same currency formatting shown on screen.");
          await lecture("#assetsPanel", "You can continue into depreciation for carrying-value schedules.");
        }),
        chapter("Depreciation assets", "Switch to depreciation and understand book value, accumulated depreciation and remaining life.", 6, async () => {
          await clickNav("assets");
          await clickTarget(textTarget("#assetsPanel", "button", "Depreciation Assets"), "Open Depreciation Assets.");
          await lecture("#depAssetsSummary", "The summary shows depreciation metrics across the fictional fixed-asset register.");
          await lecture(() => firstVisible('#depAssetsList,.dep-assets-list,#depreciationAssetsList'), "Each depreciation asset tracks cost, salvage value, method, accumulated depreciation and current book value.");
          await lecture(() => firstVisible('#assetsPanel button[title*="PDF"],#assetsPanel [data-dep-pdf]'), "Depreciation reports can be exported separately from the main asset register.");
          await lecture(() => firstVisible('#assetsPanel button'), "New depreciation assets use the same configured currencies and optional wallet linkage.");
          await clickTarget(textTarget("#assetsPanel", "button", "Assets"), "Return to the main asset register.");
        }),
        chapter("Delete lifecycle", "Locate delete controls and understand why financial history is protected.", 4, async () => {
          await clickNav("assets");
          await lecture(() => firstVisible('#assetsList [data-action*="delete"],#assetsList .danger'), "Delete is a separate destructive action and follows the application's confirmation/security path.");
          await lecture("#recycleBinBtn", "Recoverable deleted records are reviewable through the Recycle Bin where the module supports it.");
          await lecture("#assetsList", "Sale or disposal should be used when the asset genuinely left ownership; delete is for incorrect records.");
          await lecture("#assetsList", "The lecture does not remove the fictional asset.");
        })
      ]
    },

    notes: {
      label: "Notes",
      chapters: [
        chapter("Notes overview and search", "Find notes quickly and understand the workspace.", 4, async () => {
          await clickNav("notes");
          await lecture("#notesList", "Notes keep operational reminders and free-form finance context next to the rest of the workspace.");
          await typeTarget("#searchNotes", "VAT", "Search finds matching note titles and content.");
          await lecture("#notesList", "Only matching notes remain visible.");
          await clearInput("#searchNotes");
        }),
        chapter("Create a note", "Write and save a new fictional note.", 5, async () => {
          await clickNav("notes");
          await clickTarget("#newNoteBtn", "New Note opens the note editor.");
          await typeTarget("#noteCreateTitleInput", "Guided Demo Follow-up", "Enter a concise title.");
          await typeTarget("#noteCreateText", "Review September expenses and confirm the VAT summary before month-end.", "Type the body using real keyboard events.");
          await lecture(() => firstVisible('#noteCreateText,.note-editor'), "Notes can hold more context than a transaction memo.");
          await clickTarget("#noteCreateSaveBtn", "Create Note saves it locally for this demo session.");
        }),
        chapter("Edit a note", "Open an existing note and locate editing controls.", 4, async () => {
          await clickNav("notes");
          await clickTarget(() => firstVisible('#notesList .note-card,#notesList article,#notesList button'), "Open an existing note.");
          await lecture(() => firstVisible('.modal:not(.hide) textarea,.modal:not(.hide) input,.note-editor textarea'), "The editor loads the saved note for correction.");
          await lecture(() => firstVisible('.modal:not(.hide) .btn.primary,.note-editor .btn.primary'), "Save applies the changes to the local demo note.");
          await closeVisibleModal();
        }),
        chapter("Reminders", "Locate note reminder scheduling and due-notification controls.", 4, async () => {
          await clickNav("notes");
          await lecture(() => firstVisible('#notesList [data-reminder],#notesList button[title*="reminder" i]'), "Reminder controls attach a due time to a note.");
          await lecture(() => firstVisible('#notesPanel input[type="datetime-local"],#notesPanel input[type="date"]'), "A reminder date/time determines when the note becomes actionable.");
          await lecture("#notesList", "Reminder state stays attached to the note rather than creating a separate finance transaction.");
          await lecture("#notificationsBtn", "Due reminders can surface through the application's notification area when enabled.");
        }),
        chapter("Delete and recovery", "Locate note deletion and the recycle path.", 3, async () => {
          await clickNav("notes");
          await lecture(() => firstVisible('#notesList [data-action*="delete"],#notesList .danger'), "Delete removes an incorrect note after confirmation.");
          await lecture("#recycleBinBtn", "The Recycle Bin provides a recovery-oriented place for supported deleted records.");
          await lecture("#notesList", "No note is deleted during the guided lecture.");
        }),
        chapter("Notes in broader workflow", "Understand how notes complement accounting and operational modules.", 3, async () => {
          await clickNav("notes");
          await lecture("#notesList", "Use Notes for explanations, checklists and follow-ups that should not become financial transactions.");
          await lecture(".tabs", "When a note becomes a real expense, loan, asset or inventory action, record it in the appropriate financial module.");
          await lecture("#notesList", "This separation keeps financial reports clean while preserving useful context.");
        })
      ]
    },

    bitcoin: {
      label: "Bitcoin",
      chapters: [
        chapter("Bitcoin workspace overview", "Understand watch-only wallets, price data and saved addresses.", 4, async () => {
          await clickNav("bitcoin");
          await lecture("#bitcoinPanel", "The Bitcoin workspace keeps wallet tools and transaction information separate from normal fiat wallets.");
          await lecture(() => firstVisible('#bitcoinPanel .btc-price,#bitcoinPanel [id*="Price"]'), "Market price provides a reference USD value for BTC balances.");
          await lecture(() => firstVisible('#bitcoinPanel .btc-wallet,#bitcoinPanel [data-btc-wallet]'), "Saved wallets can be opened again without re-entering the address.");
          await lecture("#bitcoinPanel", "The guided demo uses local deterministic blockchain responses and never sends a real transaction.");
        }),
        chapter("Watch a public address", "Enter a public address and load watch-only statistics.", 5, async () => {
          await clickNav("bitcoin");
          await clickTarget("#btcWatchWalletBtn", "Watch-only mode requires only a public Bitcoin address.");
          await typeTarget("#btcAddressInput", "1BoatSLRHtKNngkdXEeobR76b53LETtpyT", "Enter a public demo address.");
          await clickTarget("#btcWatchAddressBtn", "Watch Address loads local demo balance and transaction information.");
          await lecture(() => firstVisible('#bitcoinPanel .btc-wallet-info,#bitcoinPanel .btc-overview,#bitcoinPanel .btc-stats'), "Received, sent, balance and transaction counts can now be inspected.");
          await lecture("#bitcoinPanel", "No private key is needed for a watch-only wallet.");
        }),
        chapter("Receive Bitcoin", "Open the receive workflow and inspect address/QR information.", 4, async () => {
          await clickNav("bitcoin");
          await clickTarget("#btcReceiveBtn", "Receive opens the selected wallet's public receiving information.");
          await lecture("#btcReceiveModal", "The QR and address can be shared for receiving funds; private keys are never part of this receive view.");
          await lecture(() => firstVisible('#btcReceiveModal [data-copy],#btcReceiveModal button'), "Copy controls make the public address easy to use without retyping it.");
          await closeVisibleModal();
        }),
        chapter("Transactions and history", "Inspect incoming/outgoing Bitcoin activity.", 4, async () => {
          await clickNav("bitcoin");
          await lecture(() => firstVisible('#bitcoinPanel .btc-transactions,#bitcoinPanel [id*="Transaction"]'), "Transaction history lists Bitcoin activity for the selected public address.");
          await lecture(() => firstVisible('#bitcoinPanel .btc-tx-row,#bitcoinPanel .transaction-row'), "Each row distinguishes direction, value and confirmation context.");
          await lecture("#bitcoinPanel", "Bitcoin activity remains in BTC while equivalent fiat values are presented only as reference conversions.");
          await lecture("#bitcoinPanel", "This keeps crypto reporting understandable without altering the underlying satoshi values.");
        }),
        chapter("Bitcoin PDFs", "Locate wallet/activity PDF export.", 3, async () => {
          await clickNav("bitcoin");
          await lecture("#btcDownloadWalletPdfBtn", "Wallet PDF exports the currently selected Bitcoin wallet and activity details.");
          await lecture("#bitcoinPanel", "The PDF uses the same fictional watch-only data shown on screen.");
          await lecture("#btcDownloadWalletPdfBtn", "Clicking this control manually will generate the file through the existing PDF code.");
        }),
        chapter("Security boundaries", "Understand what should and should not be entered in Bitcoin tools.", 4, async () => {
          await clickNav("bitcoin");
          await lecture(".btc-security-notice", "Bitcoin security notices remind users to protect private keys and seed phrases.");
          await lecture("#btcWatchWalletBtn", "Watch-only mode is the safest way to demonstrate balances because it uses public information only.");
          await lecture(() => firstVisible('#bitcoinPanel input[type="password"],#bitcoinPanel [name*="private"]'), "Any private-key workflow should only be used on a trusted device; the guided demo never fills such a field.");
          await lecture("#bitcoinPanel", "The rest of this demo stays fully explorable without exposing or requesting real crypto secrets.");
        }),
        chapter("Multi-currency reference", "See how BTC and fiat currency formatting coexist.", 3, async () => {
          await clickNav("bitcoin");
          await lecture(() => firstVisible('#bitcoinPanel .btc-usd-equivalent,#bitcoinPanel .btc-price'), "BTC balance can show a reference USD equivalent using the configured USD symbol/font rules.");
          await lecture("#bitcoinPanel", "The BTC amount itself remains denominated in Bitcoin and is not replaced by the fiat estimate.");
          await lecture("#themeSettingsBtn", "Theme and currency symbol rendering remain consistent across Bitcoin and the rest of the workspace.");
        })
      ]
    },

    audit: {
      label: "Audit Report",
      chapters: [
        chapter("Choose audit period", "Set dates and currency before running the report.", 4, async () => {
          await clickNav("audit");
          await typeTarget("#financialAuditFrom", "2026-09-01", "Set the audit start date.", { direct: true });
          await typeTarget("#financialAuditTo", "2026-09-11", "Set the audit end date.", { direct: true });
          await selectTarget("#financialAuditCurrency", "AED", "Choose the reporting currency for this example.");
          await lecture("#runFinancialAuditBtn", "Run Audit calculates the report from the local fictional records.");
        }),
        chapter("Run and inspect report", "Generate the audit and understand its sections.", 4, async () => {
          await clickNav("audit");
          await clickTarget("#runFinancialAuditBtn", "Run the Financial Audit.");
          await lecture("#financialAuditRoot", "The generated report summarizes financial activity and exceptions for the selected period.");
          await lecture(() => firstVisible('#financialAuditRoot section,#financialAuditRoot article,#financialAuditRoot .card'), "Each section can be read independently while still sharing the same audit period.");
          await lecture("#financialAuditRoot", "The report is entirely based on fictional demo data.");
        }),
        chapter("Audit exports", "Locate PDF and spreadsheet export controls.", 4, async () => {
          await clickNav("audit");
          await lecture(() => firstVisible('#financialAuditRoot button[title*="PDF"],#downloadFinancialAuditPdfBtn'), "PDF preserves a readable audit package.");
          await lecture(() => firstVisible('#financialAuditRoot button[title*="Excel"],#downloadFinancialAuditExcelBtn'), "Spreadsheet export supports deeper analysis where enabled.");
          await lecture("#financialAuditRoot", "Exports reflect the active period and currency filters.");
          await lecture("#runFinancialAuditBtn", "Change filters and run again to produce a different report scope.");
        }),
        chapter("Audit interpretation", "Understand how audit output relates to source modules.", 3, async () => {
          await clickNav("audit");
          await lecture("#financialAuditRoot", "Audit findings summarize source records; they do not silently rewrite the underlying transactions.");
          await lecture(".tabs", "Use the related Expenses, Accounting, Inventory, Loans or Assets section to inspect the source transaction behind a finding.");
          await lecture("#financialAuditRoot", "This separation keeps the audit report explanatory rather than destructive.");
        })
      ]
    },

    "triplem-ai": {
      label: "Triplem AI",
      chapters: [
        chapter("Ask about your workspace", "Send a natural-language question against the fictional local data.", 4, async () => {
          await clickNav("triplem-ai");
          let input = firstVisible("#triplemAiInput");
          if (!input) { await sleep(900); input = firstVisible("#triplemAiInput"); }
          await typeTarget(input, "Summarize September expenses and the largest categories.", "Type a finance question in ordinary language.");
          await pressEnter(input, "Press Enter to send the question.");
          await lecture("#triplemAiThread", "The demo assistant answers from local fictional context and does not need a real user database.");
          await lecture("#triplemAiThread", "Follow-up questions can continue in the same conversation.");
        }),
        chapter("Ask about another module", "Use AI to navigate or explain inventory, loans, assets and accounting.", 3, async () => {
          await clickNav("triplem-ai");
          const input = firstVisible("#triplemAiInput");
          await typeTarget(input, "Which inventory items are moving fastest?", "Ask about inventory using the same composer.");
          await pressEnter(input, "Send the inventory question.");
          await lecture("#triplemAiThread", "The answer can point you toward the relevant Inventory records and concepts.");
        }),
        chapter("AI drafts", "Understand draft-first automation and review before finalization.", 4, async () => {
          await clickNav("triplem-ai");
          await lecture(() => firstVisible('#triplemAiRoot [data-draft],#triplemAiRoot button'), "Supported AI actions can prepare drafts for review instead of silently posting finance data.");
          await lecture("#triplemAiRoot", "A draft can be edited or discarded before it affects balances, VAT, inventory or accounting.");
          await lecture(() => firstVisible('#triplemAiRoot .triplem-ai-settings,#triplemAiRoot button[title*="Settings" i]'), "AI settings control the connected model/key in the live product; the demo uses local simulation.");
          await lecture("#triplemAiRoot", "This preserves the same interaction pattern without exposing a real API secret.");
        }),
        chapter("AI safety and scope", "See where AI helps and where the user still confirms financial actions.", 3, async () => {
          await clickNav("triplem-ai");
          await lecture("#triplemAiThread", "AI can explain data, summarize trends and prepare supported drafts.");
          await lecture("#triplemAiRoot", "Final financial actions remain reviewable through the normal app forms rather than being hidden from the user.");
          await lecture(".tabs", "You can always leave AI and inspect the source module directly.");
        })
      ]
    },

    messages: {
      label: "Messages",
      chapters: [
        chapter("Conversation list", "Browse fictional support/in-app conversation threads.", 3, async () => {
          await clickNav("messages");
          await lecture("#messagesThreadList", "The thread list keeps open and previous conversations together.");
          await lecture(() => firstVisible('#messagesThreadList button,#messagesThreadList .thread'), "Select a conversation to read its full message history.");
          await lecture("#messagesPanel", "Unread state and status remain separate from the financial modules.");
        }),
        chapter("Start a new message", "Create and send a fictional support inquiry.", 5, async () => {
          await clickNav("messages");
          await clickTarget("#messagesNewBtn", "New Message opens the existing composer.");
          await typeTarget("#inquirySubject", "Guided demo question", "Enter the subject.");
          await typeTarget("#inquiryBody", "Please confirm the fictional September audit is ready for review.", "Type a complete support message.");
          await clickTarget("#inquirySubmitBtn", "Send stores the message only in local demo data.");
          await lecture("#messagesThreadList", "The new conversation now appears in the thread list.");
        }),
        chapter("Read and reply", "Open a thread and locate reply controls.", 4, async () => {
          await clickNav("messages");
          await clickTarget(() => firstVisible('#messagesThreadList button,#messagesThreadList .thread'), "Open an existing conversation.");
          await lecture(() => firstVisible('#messagesThread,#messagesConversation,#messagesBody'), "The full conversation history remains visible while replying.");
          await lecture(() => firstVisible('#messagesPanel textarea,#messagesPanel input'), "Type a reply in the composer at the bottom of the thread.");
          await lecture(() => firstVisible('#messagesPanel button[type="submit"],#messagesPanel .btn.primary'), "Send appends the reply to the same fictional thread.");
        }),
        chapter("Thread lifecycle", "Understand open, closed and deleted conversation states.", 3, async () => {
          await clickNav("messages");
          await lecture(() => firstVisible('#messagesPanel [data-status],#messagesPanel .status'), "Conversation status helps distinguish active inquiries from completed ones.");
          await lecture(() => firstVisible('#messagesPanel .danger,#messagesPanel [data-delete]'), "Delete controls are separate from normal reply actions.");
          await lecture("#messagesThreadList", "The demo leaves threads intact so all chapters remain repeatable.");
        }),
        chapter("Messages from account menu", "See how in-app messaging is reached from global account controls.", 3, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await lecture("#openMessagesMenuBtn", "Messages is also available from the Account menu, so users do not need to hunt for the tab.");
          await clickTarget("#openMessagesMenuBtn", "Open Messages from the account menu.");
          await lecture("#messagesThreadList", "The same conversation list opens regardless of entry point.");
        })
      ]
    },

    admin: {
      label: "Admin",
      chapters: [
        chapter("Admin overview", "Understand the protected administration workspace.", 4, async () => {
          await clickNav("admin");
          const lock = doc.getElementById("adminSecurityLock");
          if (lock && visible(lock)) {
            await lecture(lock, "Admin is protected by its own security gate. The guided demo does not guess or bypass a secret Admin Security Key.");
            await lecture("#adminSecurityUnlockInput", "A real administrator enters the configured security key here.");
            await lecture("#adminSecurityUnlockBtn", "Unlock grants access only after the security check.");
            await lecture(lock, "Other Admin chapters will explain the available tools without weakening this gate.");
            return;
          }
          await lecture("#adminPanel", "Admin brings user management, analytics, storage, backups and support controls together.");
          await lecture("#adminUsersList", "The user list shows fictional accounts and their access state.");
          await lecture("#adminPanel", "Admin actions stay separate from ordinary user financial workflows.");
          await lecture("#adminAnalyticsBtn", "Analytics is one of the higher-level operational tools available here.");
        }),
        chapter("Search and inspect users", "Find a user and locate account-management actions.", 4, async () => {
          await clickNav("admin");
          const lock = doc.getElementById("adminSecurityLock");
          if (lock && visible(lock)) { await lecture(lock, "This chapter requires an unlocked Admin workspace in the live product."); currentStep += 3; return; }
          await typeTarget("#adminUsersSearch", "Sara", "Search users by name, username or account information.");
          await lecture("#adminUsersList", "Matching user cards remain visible.");
          await lecture(() => firstVisible('#adminUsersList button'), "User actions open account access, permissions and administrative tools.");
          await clearInput("#adminUsersSearch");
        }),
        chapter("User access and permissions", "Understand tab access, Accounting permission and feature controls.", 4, async () => {
          await clickNav("admin");
          const lock = doc.getElementById("adminSecurityLock");
          if (lock && visible(lock)) { await lecture(lock, "Permissions become available only after Admin is unlocked."); currentStep += 3; return; }
          await lecture(() => firstVisible('#adminUsersList button[title*="Edit"],#adminUsersList .btn'), "Edit User opens account and permission controls.");
          await lecture(() => firstVisible('[id*="AccountingAccess"],.admin-access-grid'), "Accounting access can be controlled separately from ordinary section tabs.");
          await lecture(() => firstVisible('.admin-access-grid input[type="checkbox"],.admin-check-item'), "Section permissions decide which workspace areas appear for a user.");
          await lecture("#adminUsersList", "Permission changes affect access, not the user's underlying financial records.");
        }),
        chapter("Analytics", "Open administration analytics and read platform activity.", 3, async () => {
          await clickNav("admin");
          const lock = doc.getElementById("adminSecurityLock");
          if (lock && visible(lock)) { await lecture(lock, "Analytics is available after Admin unlock."); currentStep += 2; return; }
          await clickTarget("#adminAnalyticsBtn", "Open Admin Analytics.");
          await lecture(() => firstVisible('.modal:not(.hide),#adminAnalyticsPanel'), "Analytics summarizes account and platform activity without changing user finance records.");
          await closeVisibleModal();
        }),
        chapter("Storage and backups", "Locate storage management and backup/restore tools.", 4, async () => {
          await clickNav("admin");
          const lock = doc.getElementById("adminSecurityLock");
          if (lock && visible(lock)) { await lecture(lock, "Storage and backup tools require Admin unlock."); currentStep += 3; return; }
          await lecture(() => firstVisible('#adminStorageBtn,[id*="Storage"]'), "Storage Management helps review files, photos and storage usage.");
          await lecture(() => firstVisible('#adminBackupBtn,[id*="Backup"]'), "Backup tools export or restore protected application data using the existing admin workflow.");
          await lecture(() => firstVisible('#adminPanel .admin-tool-btn'), "Admin tools are grouped in the toolbar rather than scattered through user sections.");
          await lecture("#adminPanel", "The guided demo does not upload or restore a real backup.");
        }),
        chapter("Admin security", "Understand the Admin Security Key and protected actions.", 4, async () => {
          await clickNav("admin");
          await lecture("#adminSecurityLock", "The dedicated security gate prevents ordinary workspace access from automatically granting Admin access.");
          await lecture("#adminSecurityUnlockInput", "The Admin Security Key is entered only in the protected Admin gate.");
          await lecture("#adminSecurityKeyBtn", "When unlocked, administrators can manage the security key from the designated tool.");
          await lecture("#adminPanel", "The guided demo never exposes, stores or invents a real administrator secret.");
        })
      ]
    },

    themes: {
      label: "Themes & Appearance",
      chapters: [
        chapter("Open Theme selector", "See all available visual themes without changing app structure.", 4, async () => {
          await clickNav("dashboard");
          await openThemeMenu();
          await lecture("#themeDropdown", "Theme choices change design tokens only; the interface structure and data stay the same.");
          await lecture(() => firstVisible('#themeDropdown [data-theme-choice]'), "Each theme has its own swatch and name.");
          await lecture("#themeSettingsBtn", "The same Theme control is always available from the top bar.");
        }),
        chapter("Dark Navy Blue", "Switch to the dark navy theme and inspect consistency.", 4, async () => {
          await clickNav("dashboard");
          await openThemeMenu();
          await clickTarget('#themeDropdown [data-theme-choice="navy"]', "Select Dark Navy Blue.");
          await lecture("#dashboardRoot", "Cards, forms, charts and controls inherit the theme through shared semantic tokens.");
          await lecture("#themeSettingsBtn", "No section layout or financial behavior changes with the theme.");
          await lecture(".tabs", "Navigation remains identical in the dark appearance.");
        }),
        chapter("Try another color theme", "Switch to a second theme to demonstrate the centralized theme system.", 4, async () => {
          await clickNav("expenses");
          await openThemeMenu();
          const choice = () => firstVisible('#themeDropdown [data-theme-choice="neon"],#themeDropdown [data-theme-choice="sky"],#themeDropdown [data-theme-choice="light-green"]');
          await clickTarget(choice, "Select another configured theme.");
          await lecture("#expensesPanel", "Expenses keeps the same controls, spacing and data while colors update consistently.");
          await lecture("#expenseOverviewWallets", "Wallet cards inherit the same theme without custom one-off styling.");
          await lecture("#themeSettingsBtn", "You can switch again at any time.");
        }),
        chapter("Restore Default", "Return to the Pure White default appearance.", 3, async () => {
          await clickNav("dashboard");
          await openThemeMenu();
          await clickTarget('#themeDropdown [data-theme-choice="default"]', "Restore the Default theme.");
          await lecture("#dashboardRoot", "The workspace returns to the default Pure White appearance.");
          await lecture("#themeSettingsBtn", "Theme selection does not alter data or workflows.");
        })
      ]
    },

    settings: {
      label: "Account Settings",
      chapters: [
        chapter("Open Account Settings", "Navigate from the account menu into profile and company settings.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await clickTarget("#accountSettingsBtn", "Account Settings opens the existing settings overview.");
          await lecture("#accountSettingsModal", "Profile, company identity, security and private integrations are grouped in one place.");
          await lecture("#accountSettingsSummaryBody", "The summary shows the current fictional account details without changing the live interface.");
        }),
        chapter("Profile details", "Locate personal identity fields and edit workflow.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await clickTarget("#accountSettingsBtn", "Open Account Settings.");
          await lecture(() => firstVisible('#accountSettingsModal [data-account-action*="profile"],#accountSettingsModal button'), "Profile editing controls update display name and account identity fields where allowed.");
          await lecture("#accountSettingsSummaryBody", "The settings overview keeps personal and company information clearly separated.");
          await closeVisibleModal();
        }),
        chapter("Company identity", "Locate company name, VAT/TRN, address and branding controls.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await clickTarget("#accountSettingsBtn", "Open Account Settings.");
          await lecture(() => firstVisible('#accountSettingsModal [data-account-action*="company"],#accountSettingsModal button'), "Company details feed invoices, reports and branded exports.");
          await lecture("#accountSettingsSummaryBody", "VAT/TRN, email, mobile and address are summarized here.");
          await closeVisibleModal();
        }),
        chapter("Plan and subscription", "Open subscription management from the global account menu.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await lecture("#planSubscriptionBtn", "Plan & Subscription is separate from financial records.");
          await clickTarget("#planSubscriptionBtn", "Open the existing subscription interface.");
          await lecture(() => firstVisible('.modal:not(.hide),.settings-sheet:not(.hide)'), "The plan view explains account access and subscription status without altering ledger data.");
          await closeVisibleModal();
        }),
        chapter("Default Start Page", "Choose which section opens first after sign-in in the live product.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await clickTarget("#defaultStartPageBtn", "Default Start Page opens the section preference.");
          await lecture(() => firstVisible('.modal:not(.hide) select,.modal:not(.hide) button'), "Choose a preferred section such as Dashboard, Expenses or Accounting where allowed.");
          await lecture(() => firstVisible('.modal:not(.hide) .btn.primary'), "Save stores the preference without changing any records.");
          await closeVisibleModal();
        }),
        chapter("VAT Settings", "Open the workspace VAT configuration and understand its role.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await clickTarget("#taxSettingsBtn", "VAT Settings opens the operational tax configuration.");
          await lecture(() => firstVisible('.modal:not(.hide) input,.modal:not(.hide) select'), "VAT rate and related choices feed supported expense and reporting workflows.");
          await lecture(() => firstVisible('.modal:not(.hide) .btn.primary'), "Saving applies the configuration for the workspace.");
          await closeVisibleModal();
        })
      ]
    },

    security: {
      label: "Security",
      chapters: [
        chapter("Open Security Center", "Reach Account Security from Account Settings.", 5, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await clickTarget("#accountSettingsBtn", "Open Account Settings first.");
          await clickTarget("#accountSecurityBtn", "Account Security opens the dedicated security center.");
          await lecture("#accountSecurityCenterBody", "Password, Authenticator 2FA, biometrics, Smart PIN, recovery and devices are deliberately grouped here.");
          await lecture("#accountSecurityCenterBody", "This demo explains the controls without asking for or inventing real credentials.");
        }),
        chapter("Password", "Locate password change and re-authentication controls.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu(); await clickTarget("#accountSettingsBtn", "Open Account Settings."); await clickTarget("#accountSecurityBtn", "Open Account Security.");
          await lecture("#securityChangePassword", "Change Password begins the protected password replacement workflow.");
          await lecture("#accountSecurityCenterBody", "The live product requires appropriate re-authentication before a sensitive credential is changed.");
          await closeVisibleModal();
        }),
        chapter("Authenticator App 2FA", "See where TOTP 2FA is configured and managed.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu(); await clickTarget("#accountSettingsBtn", "Open Account Settings."); await clickTarget("#accountSecurityBtn", "Open Account Security.");
          await lecture("#securityManage2fa", "Authenticator App 2FA adds a second sign-in factor on untrusted browsers.");
          await lecture("#accountSecurityCenterBody", "Setup in the live product uses an authenticator QR/manual key plus recovery codes.");
          await lecture("#securityManage2fa", "The guided demo does not generate or expose a real TOTP secret.");
        }),
        chapter("Passkeys and biometrics", "Understand Face ID, Touch ID, Windows Hello and quick sign-in controls.", 5, async () => {
          await clickNav("dashboard");
          await openAccountMenu(); await clickTarget("#accountSettingsBtn", "Open Account Settings."); await clickTarget("#accountSecurityBtn", "Open Account Security.");
          await lecture("#securitySetupPasskey", "Set up biometric sign-in creates or manages a standards-based device passkey in the live product.");
          await lecture("#securityQuickToggle", "Quick Sign-In can use the configured passkey on this browser.");
          await lecture("#securityPinBypassToggle", "Biometric before Smart PIN can skip the PIN after successful biometric verification.");
          await lecture("#accountSecurityCenterBody", "If biometric verification fails, the protected fallback remains available rather than silently granting access.");
        }),
        chapter("Smart PIN", "Locate Smart PIN setup/change/remove and explain its purpose.", 5, async () => {
          await clickNav("dashboard");
          await openAccountMenu(); await clickTarget("#accountSettingsBtn", "Open Account Settings."); await clickTarget("#accountSecurityBtn", "Open Account Security.");
          await lecture("#securityManageSmartPin", "Smart PIN provides a fast workspace lock after account sign-in.");
          await lecture("#securityRemoveSmartPin", "If enabled, Remove is deliberately separate from Change.");
          await lecture("#accountSecurityCenterBody", "Sensitive destructive actions can request Smart PIN confirmation in the live product.");
          await lecture("#securityManageSmartPin", "The guided demo never asks you to type a real PIN.");
        }),
        chapter("Recovery methods", "Review Recovery Key, Passkey and trusted-browser recovery options.", 5, async () => {
          await clickNav("dashboard");
          await openAccountMenu(); await clickTarget("#accountSettingsBtn", "Open Account Settings."); await clickTarget("#accountSecurityBtn", "Open Account Security.");
          await lecture("#securityManageRecovery", "Manage Recovery Methods opens self-service password recovery protections.");
          await lecture("#accountSecurityCenterBody", "Recovery can use a Recovery Key, compatible passkey or trusted-browser approval depending on configuration.");
          await lecture("#securityManageRecovery", "Recovery methods are designed to reset access without revealing the old password.");
          await lecture("#accountSecurityCenterBody", "The demo describes the flow but does not create real recovery secrets.");
        }),
        chapter("Trusted browsers", "Inspect current/other trusted browsers and revocation controls.", 6, async () => {
          await clickNav("dashboard");
          await openAccountMenu(); await clickTarget("#accountSettingsBtn", "Open Account Settings."); await clickTarget("#accountSecurityBtn", "Open Account Security.");
          await lecture("#securityTrustCurrent", "Trust This Browser records the current browser as trusted in the live product when security requirements are satisfied.");
          await lecture(() => firstVisible('#accountSecurityCenterBody .account-security-device-list'), "Trusted browsers list their labels, browser information and expiry.");
          await lecture(() => firstVisible('#accountSecurityCenterBody [data-revoke-2fa-device]'), "Individual trusted browsers can be revoked.");
          await lecture("#securityRemoveOtherTrustedBrowsers", "Remove All Other Trusted Browsers keeps the current trusted browser and revokes the others.");
          await lecture("#securityRefreshTrusted", "Refresh reloads the trusted-browser state.");
          await lecture("#accountSecurityCenterBody", "The guided demo does not alter real trust state.");
        }),
        chapter("Login history and sessions", "Locate session/device history and sign-out controls where available.", 5, async () => {
          await clickNav("dashboard");
          await openAccountMenu(); await clickTarget("#accountSettingsBtn", "Open Account Settings."); await clickTarget("#accountSecurityBtn", "Open Account Security.");
          await lecture(() => firstVisible('#accountSecurityCenterBody .account-security-session-list,#accountSecurityCenterBody [data-session],#accountSecurityCenterBody .account-security-device'), "Session and device entries show where the account has been used.");
          await lecture(() => firstVisible('#accountSecurityCenterBody [id*="SignOut"],#accountSecurityCenterBody button'), "Session controls can revoke other signed-in devices while preserving the current session when supported.");
          await lecture("#accountSecurityCenterBody", "Old history is managed separately from active trusted-browser state.");
          await lecture("#accountSecurityCenterBody", "The demo keeps session history fictional and local.");
        })
      ]
    },

    about: {
      label: "About",
      chapters: [
        chapter("Product information", "Open the About view and read the product summary.", 3, async () => {
          await clickNav("about");
          await lecture("#aboutPanel", "About summarizes Triplem VIP and the scope of the workspace.");
          await lecture(() => firstVisible('#aboutPanel a,#aboutPanel button'), "Relevant product information and supporting links remain available here.");
          await lecture("#aboutPanel", "Nothing in About changes financial data.");
        }),
        chapter("Global report and data exports", "Locate whole-account exports from the account menu.", 4, async () => {
          await clickNav("dashboard");
          await openAccountMenu();
          await lecture("#downloadAllSectionsPdfBtn", "Download Full Report combines supported sections into a broader PDF package.");
          await lecture("#downloadAllDataJsonBtn", "JSON export provides a structured backup/data representation.");
          await lecture("#downloadAllDataCsvBtn", "CSV export supports spreadsheet-compatible review.");
          await lecture("#importJsonInput", "Import is intentionally separate from download so restoration is a deliberate action.");
        })
      ]
    }
  };

  function ensureSpecialAreaOrder() {
    // All keys are intentionally retained in insertion order for the chooser.
    return Object.keys(GUIDES);
  }

  function clearChapterGateTimers() {
    if (chapterGateTimer) global.clearTimeout(chapterGateTimer);
    if (chapterGateCountdown) global.clearInterval(chapterGateCountdown);
    chapterGateTimer = null;
    chapterGateCountdown = null;
  }

  function ensureChapterGate() {
    installStyle();
    if (chapterGate) return chapterGate;
    chapterGate = doc.createElement("div");
    chapterGate.id = "triplemDemoChapterGateV4";
    chapterGate.className = "hide";
    doc.body.appendChild(chapterGate);
    chapterGate.addEventListener("click", event => {
      const button = event.target.closest("[data-gate-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.gateAction || "start";
      clearChapterGateTimers();
      cancelNarration();
      chapterGate.classList.add("hide");
      const resolvePending = chapterGateResolve;
      chapterGateResolve = null;
      if (resolvePending) resolvePending(action);
    });
    return chapterGate;
  }

  function hideChapterGate() {
    clearChapterGateTimers();
    chapterGate?.classList.add("hide");
  }

  function ensureExerciseDock() {
    installStyle();
    if (exerciseDock) return exerciseDock;
    exerciseDock = doc.createElement("div");
    exerciseDock.id = "triplemDemoExerciseDockV4";
    exerciseDock.className = "hide";
    doc.body.appendChild(exerciseDock);
    exerciseDock.addEventListener("click", event => {
      const button = event.target.closest("[data-exercise-action]");
      if (!button) return;
      const action = button.dataset.exerciseAction || "resume";
      cancelNarration();
      exerciseDock.classList.add("hide");
      const resolvePending = exerciseResolve;
      exerciseResolve = null;
      if (resolvePending) resolvePending(action);
    });
    return exerciseDock;
  }

  function hideExerciseDock() {
    exerciseDock?.classList.add("hide");
  }

  function chapterGateHtml(areaKey, index) {
    const guide = GUIDES[areaKey] || GUIDES.dashboard;
    const ch = guide.chapters[index] || guide.chapters[0];
    const count = guide.chapters.length;
    const section = AREA_LABELS[areaKey] || guide.label || "Demo";
    return `<div class="tdg-card" role="dialog" aria-modal="true" aria-labelledby="tdgTitle">
      <div class="tdg-top"><span class="tdg-kicker">${esc(section)}</span><span class="tdg-count">Chapter ${index + 1} of ${count}</span></div>
      <div class="tdg-body">
        <h3 id="tdgTitle">${esc(ch.title)}</h3>
        <p class="tdg-summary">${esc(ch.summary)}</p>
        <div class="tdg-auto"><i class="fa-solid fa-circle-play" aria-hidden="true"></i><span>Guided playback begins automatically in <strong class="tdg-seconds">${isMobile() ? 6 : 5}</strong> seconds unless you choose another action.</span></div>
      </div>
      <div class="tdg-actions">
        <button type="button" data-gate-action="previous"${index <= 0 ? " disabled" : ""}><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Previous Chapter</button>
        <button type="button" data-gate-action="next"${index >= count - 1 ? " disabled" : ""}>Next Chapter <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
        <button type="button" data-gate-action="exercise"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Exercise</button>
        <button type="button" data-gate-action="list"><i class="fa-solid fa-list" aria-hidden="true"></i> Chapters</button>
        <button type="button" class="tdg-stop" data-gate-action="stop"><i class="fa-solid fa-stop" aria-hidden="true"></i> Stop</button>
        <button type="button" class="tdg-primary" data-gate-action="start"><i class="fa-solid fa-play" aria-hidden="true"></i> Start Chapter</button>
      </div>
    </div>`;
  }

  function showChapterGate(areaKey, index) {
    const guide = GUIDES[areaKey];
    if (!guide?.chapters?.[index]) return Promise.resolve("stop");
    ensureChapterGate();
    hideRemark();
    clearHighlight();
    if (cursor) cursor.style.opacity = "0";
    if (keycap) keycap.classList.remove("is-visible");
    chapterGate.innerHTML = chapterGateHtml(areaKey, index);
    chapterGate.classList.remove("hide");
    clearChapterGateTimers();

    const ch = guide.chapters[index];
    const section = AREA_LABELS[areaKey] || guide.label || "Demo";
    const spokenIntro = `${section}. Chapter ${index + 1} of ${guide.chapters.length}. ${ch.title}. ${ch.summary}`;
    const estimatedMs = estimateNarrationMs(spokenIntro) + (isMobile() ? 1450 : 1200);
    let seconds = Math.max(2, Math.ceil(estimatedMs / 1000));
    const updateSeconds = () => {
      const node = chapterGate?.querySelector(".tdg-seconds");
      if (node) node.textContent = String(Math.max(1, seconds));
    };
    updateSeconds();
    chapterGateCountdown = global.setInterval(() => { seconds = Math.max(1, seconds - 1); updateSeconds(); }, 1000);

    return new Promise(resolvePromise => {
      chapterGateResolve = resolvePromise;
      (async () => {
        await Promise.all([narrateText(spokenIntro, { kind: "intro" }), sleep(isMobile() ? 900 : 720)]);
        if (!chapterGateResolve || cancelled || chapterGate.classList.contains("hide")) return;
        clearChapterGateTimers();
        const node = chapterGate?.querySelector(".tdg-seconds");
        if (node) node.textContent = "1";
        chapterGateTimer = global.setTimeout(() => {
          chapterGate.classList.add("hide");
          const resolvePending = chapterGateResolve;
          chapterGateResolve = null;
          if (resolvePending) resolvePending("start");
        }, 180);
      })();
    });
  }

  function waitForExercise(areaKey, index) {
    const guide = GUIDES[areaKey] || GUIDES.dashboard;
    const ch = guide.chapters[index] || guide.chapters[0];
    ensureExerciseDock();
    hideRemark();
    clearHighlight();
    if (cursor) cursor.style.opacity = "0";
    exerciseDock.innerHTML = `<div class="tde-copy"><strong>Exercise · ${esc(ch.title)}</strong><span>Guided playback is paused. Try this chapter yourself in the live Demo interface: ${esc(ch.summary)}</span></div><div class="tde-actions"><button type="button" data-exercise-action="previous"${index <= 0 ? " disabled" : ""}>Previous</button><button type="button" data-exercise-action="next"${index >= guide.chapters.length - 1 ? " disabled" : ""}>Next</button><button type="button" data-exercise-action="stop">Stop</button><button type="button" class="tde-resume" data-exercise-action="resume"><i class="fa-solid fa-play" aria-hidden="true"></i> Resume Demo</button></div>`;
    exerciseDock.classList.remove("hide");
    narrateText(`Exercise. ${ch.title}. Try the process yourself. When you are ready, choose Resume Demo to continue.`, { kind: "exercise" });
    return new Promise(resolvePromise => { exerciseResolve = resolvePromise; });
  }

  function chooserHtml(areaKey) {
    const keys = ensureSpecialAreaOrder();
    const guide = GUIDES[areaKey] || GUIDES.dashboard;
    const options = keys.map(k => `<option value="${esc(k)}"${k === areaKey ? " selected" : ""}>${esc(AREA_LABELS[k] || GUIDES[k].label || k)}</option>`).join("");
    const rows = guide.chapters.map((ch, i) => `<button type="button" class="tdc-chapter" data-chapter-index="${i}"><span class="tdc-num">${i + 1}</span><span class="tdc-copy"><strong>${esc(ch.title)}</strong><span>${esc(ch.summary)}</span></span><span class="tdc-play"><i class="fa-solid fa-play" aria-hidden="true"></i></span></button>`).join("");
    return `<div class="tdc-card" role="dialog" aria-modal="true" aria-labelledby="tdcTitle"><div class="tdc-head"><div><h3 id="tdcTitle">${esc(AREA_LABELS[areaKey] || guide.label)} · Chapters</h3><p>Choose any chapter, or play from the beginning. Once started, the next chapter continues automatically until you stop the guided demo.</p></div><button class="tdc-close" type="button" aria-label="Close">×</button></div><div class="tdc-controls"><select id="tdcAreaSelect" aria-label="Demo section">${options}</select><select id="tdcPaceSelect" aria-label="Demo pace"><option value="relaxed"${paceName === "relaxed" ? " selected" : ""}>Relaxed pace</option><option value="detailed"${paceName === "detailed" ? " selected" : ""}>Detailed pace</option><option value="brisk"${paceName === "brisk" ? " selected" : ""}>Brisk pace</option></select></div><div class="tdc-list">${rows}</div><div class="tdc-foot"><small>${guide.chapters.length} playable chapter${guide.chapters.length === 1 ? "" : "s"}</small><button type="button" class="tdc-playall"><i class="fa-solid fa-play"></i> Play from Chapter 1</button></div></div>`;
  }

  function renderChooser(areaKey = areaForCurrentUi()) {
    installStyle();
    currentArea = GUIDES[areaKey] ? areaKey : "dashboard";
    if (!chooser) {
      chooser = doc.createElement("div");
      chooser.id = "triplemDemoChapterChooser";
      chooser.className = "hide";
      doc.body.appendChild(chooser);
      chooser.addEventListener("click", event => {
        if (event.target === chooser || event.target.closest(".tdc-close")) { hideChooser(); return; }
        const row = event.target.closest(".tdc-chapter");
        if (row) {
          const index = Number(row.dataset.chapterIndex || 0);
          hideChooser();
          startChapter(currentArea, index);
          return;
        }
        if (event.target.closest(".tdc-playall")) {
          hideChooser();
          startChapter(currentArea, 0);
        }
      });
      chooser.addEventListener("change", event => {
        if (event.target.id === "tdcAreaSelect") {
          currentArea = event.target.value;
          chooser.innerHTML = chooserHtml(currentArea);
        }
        if (event.target.id === "tdcPaceSelect") paceName = event.target.value in PACE ? event.target.value : "relaxed";
      });
    }
    chooser.innerHTML = chooserHtml(currentArea);
  }

  function showChooser(areaKey = areaForCurrentUi()) {
    if (running) return;
    renderChooser(areaKey);
    chooser.classList.remove("hide");
  }
  function hideChooser() { chooser?.classList.add("hide"); }

  function controlAreaAndIndex() {
    const area = running ? currentArea : areaForCurrentUi();
    const guide = GUIDES[area] || GUIDES.dashboard;
    const remembered = Number.isFinite(lastChapterByArea[area]) ? lastChapterByArea[area] : 0;
    const index = clamp(currentArea === area ? currentChapterIndex : remembered, 0, Math.max(0, guide.chapters.length - 1));
    return { area, guide, index };
  }

  function updateDemoCard() {
    const badge = doc.getElementById("triplemDemoBadge");
    if (!badge) return;
    const { area, guide, index } = controlAreaAndIndex();
    const areaName = AREA_LABELS[area] || guide.label || "Demo";
    if (demoStatus) demoStatus.textContent = `${areaName} · ${index + 1}/${guide.chapters.length}`;
    if (demoChapterLabel) demoChapterLabel.textContent = guide.chapters[index]?.title || "Guided chapter";
    if (demoPrevBtn) demoPrevBtn.disabled = index <= 0;
    if (demoNextBtn) demoNextBtn.disabled = index >= guide.chapters.length - 1;
    if (playBtn) {
      playBtn.title = running ? "Stop guided demo" : `Play ${areaName} chapter ${index + 1}`;
      playBtn.setAttribute("aria-label", playBtn.title);
      playBtn.innerHTML = running ? '<i class="fa-solid fa-stop" aria-hidden="true"></i><span>Stop</span>' : '<i class="fa-solid fa-play" aria-hidden="true"></i><span>Play</span>';
    }
    const voiceState = badge.querySelector(".td-voice-state");
    if (voiceState) {
      const voice = narrationVoice();
      if (!speechAvailable) voiceState.textContent = "Narration unavailable in this browser";
      else if (voice) {
        const natural = /natural|neural|online|premium|enhanced|multilingual/i.test(String(voice.name || ""));
        voiceState.textContent = `${natural ? "Natural female" : "Female-preferred"} · ${voice.name}`;
      } else voiceState.textContent = "Female narration · browser voice";
    }
  }

  function updatePlayButton() { updateDemoCard(); }

  function queueChapterJump(delta) {
    const { area, guide, index } = controlAreaAndIndex();
    const nextIndex = clamp(index + delta, 0, guide.chapters.length - 1);
    if (nextIndex === index && ((delta < 0 && index === 0) || (delta > 0 && index === guide.chapters.length - 1))) return;
    lastChapterByArea[area] = nextIndex;
    if (running) {
      pendingJump = { area, index: nextIndex };
      stopTour();
    } else {
      currentArea = area;
      currentChapterIndex = nextIndex;
      currentChapterTitle = guide.chapters[nextIndex]?.title || "";
      updateDemoCard();
    }
  }

  function requestChapterList() {
    const { area } = controlAreaAndIndex();
    if (running) { pendingListArea = area; stopTour(); }
    else showChooser(area);
  }

  function installPlayControl() {
    const attach = () => {
      const badge = doc.getElementById("triplemDemoBadge");
      if (!badge) return false;
      if (badge.dataset.guidedCardReady === "1") { updateDemoCard(); return true; }
      badge.dataset.guidedCardReady = "1";
      badge.classList.add("triplem-demo-control-card");
      badge.setAttribute("role", "group");
      badge.setAttribute("aria-label", "Interactive Demo controls");

      const originalIcon = badge.querySelector(':scope > i.fa-flask');
      const originalLabel = Array.from(badge.children).find(el => el.tagName === "SPAN" && /Interactive Demo/i.test(el.textContent || ""));
      const reset = doc.getElementById("triplemDemoReset");
      const head = doc.createElement("div");
      head.className = "td-mini-head";
      if (originalIcon) head.appendChild(originalIcon);
      const title = originalLabel || doc.createElement("span");
      title.className = "td-mini-title";
      title.textContent = "Interactive Demo";
      head.appendChild(title);
      demoStatus = doc.createElement("span");
      demoStatus.className = "td-mini-status";
      head.appendChild(demoStatus);
      demoChapterLabel = doc.createElement("div");
      demoChapterLabel.className = "td-mini-chapter";

      const actions = doc.createElement("div");
      actions.className = "td-mini-actions";
      const mk = (id, icon, text, titleText) => {
        const b = doc.createElement("button"); b.type = "button"; b.id = id; b.title = titleText; b.setAttribute("aria-label", titleText);
        b.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${text}</span>`;
        return b;
      };
      demoPrevBtn = mk("triplemDemoPrev", "fa-chevron-left", "Prev", "Previous chapter");
      demoListBtn = mk("triplemDemoList", "fa-list", "List", "Open chapter list");
      playBtn = mk("triplemDemoPlay", "fa-play", "Play", "Play guided chapter");
      demoNextBtn = mk("triplemDemoNext", "fa-chevron-right", "Next", "Next chapter");
      actions.append(demoPrevBtn, demoListBtn, playBtn, demoNextBtn);
      if (reset) { reset.title = "Reset fictional demo data"; reset.setAttribute("aria-label", reset.title); reset.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>Reset</span>'; actions.appendChild(reset); }

      const voice = doc.createElement("div");
      voice.className = "td-voice-state";
      badge.replaceChildren(head, demoChapterLabel, actions, voice);

      demoPrevBtn.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); queueChapterJump(-1); });
      demoNextBtn.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); queueChapterJump(1); });
      demoListBtn.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); requestChapterList(); });
      playBtn.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        prepareNarrationForGesture();
        if (running) stopTour();
        else { const { area, index } = controlAreaAndIndex(); startChapter(area, index); }
      });
      updateDemoCard();
      return true;
    };
    if (attach()) return;
    let attempts = 0;
    const timer = global.setInterval(() => {
      attempts += 1;
      if (attach() || attempts > 100) global.clearInterval(timer);
    }, 120);
  }

  async function executeChapter(areaKey, index, { chained = false } = {}) {
    const guide = GUIDES[areaKey];
    const ch = guide?.chapters?.[index];
    if (!ch) return;
    currentArea = areaKey;
    currentChapterIndex = index;
    lastChapterByArea[areaKey] = index;
    currentChapterTitle = ch.title;
    updateDemoCard();
    currentStep = 0;
    totalSteps = Math.max(1, Number(ch.steps || 1));
    try {
      await closeVisibleModal();
      closeTransientMenus();
      await sleep(90);
      await ch.run();
      if (!cancelled) {
        clearHighlight();
        currentStep = totalSteps;
        await showRemark(`${ch.title} complete.`, { narrate: false });
        if (cursor) cursor.style.opacity = "0";
        await sleep(chained ? 180 : 280);
      }
    } catch (error) {
      if (String(error?.message || error) !== "tour-cancelled") {
        console.warn("Triplem Demo chapter stopped:", areaKey, ch.title, error);
        await showRemark("Continuing with the next guided part of this workflow.", { narrate: false });
        await sleep(160);
      }
    } finally {
      clearHighlight();
      if (keycap) keycap.classList.remove("is-visible");
      if (!chained) {
        hideRemark();
        if (cursor) cursor.style.opacity = "0";
      }
    }
  }

  async function runChapterSequence(areaKey, startIndex = 0) {
    const guide = GUIDES[areaKey];
    if (!guide?.chapters?.length) return "stop";
    let index = clamp(Number(startIndex || 0), 0, guide.chapters.length - 1);
    while (!cancelled && index >= 0 && index < guide.chapters.length) {
      currentArea = areaKey;
      currentChapterIndex = index;
      lastChapterByArea[areaKey] = index;
      currentChapterTitle = guide.chapters[index].title;
      updateDemoCard();
      const action = await showChapterGate(areaKey, index);
      if (cancelled || action === "stop") return "stop";
      if (action === "list") return "list";
      if (action === "previous") { index = Math.max(0, index - 1); continue; }
      if (action === "next") { index = Math.min(guide.chapters.length - 1, index + 1); continue; }
      if (action === "exercise") {
        const exerciseAction = await waitForExercise(areaKey, index);
        if (cancelled || exerciseAction === "stop") return "stop";
        if (exerciseAction === "previous") { index = Math.max(0, index - 1); continue; }
        if (exerciseAction === "next") { index = Math.min(guide.chapters.length - 1, index + 1); continue; }
        // "resume" continues into the same chapter automatically.
      }
      hideExerciseDock();
      await executeChapter(areaKey, index, { chained: true });
      if (cancelled) return "stop";
      hideRemark();
      if (cursor) cursor.style.opacity = "0";
      await closeVisibleModal();
      closeTransientMenus();
      await sleep(isMobile() ? 650 : 450);
      index += 1;
    }
    return cancelled ? "stop" : "complete";
  }

  async function startChapter(areaKey, index = 0) {
    if (running) return;
    installOverlays();
    running = true;
    cancelled = false;
    updatePlayButton();
    let outcome = "stop";
    try {
      outcome = await runChapterSequence(areaKey, index);
      if (outcome === "complete" && !cancelled) {
        currentArea = areaKey;
        currentChapterTitle = "Chapter series complete";
        currentStep = 1;
        totalSteps = 1;
        await showRemark(`${AREA_LABELS[areaKey] || GUIDES[areaKey]?.label || "This section"} guided chapter series is complete.`);
        await sleep(900);
      }
    } finally {
      running = false;
      cancelled = false;
      chapterGateResolve = null;
      exerciseResolve = null;
      hideChapterGate();
      hideExerciseDock();
      clearHighlight();
      hideRemark();
      if (cursor) cursor.style.opacity = "0";
      updatePlayButton();
    }
    if (pendingJump) {
      const jump = pendingJump; pendingJump = null;
      global.setTimeout(() => startChapter(jump.area, jump.index), 140);
      return;
    }
    if (pendingListArea) {
      const listArea = pendingListArea; pendingListArea = null;
      global.setTimeout(() => showChooser(listArea), 140);
      return;
    }
    if (outcome === "list") showChooser(areaKey);
  }

  function startAllChapters(areaKey) {
    return startChapter(areaKey, 0);
  }

  function stopTour() {
    cancelled = true;
    cancelNarration();
    // Keep the run locked until the current asynchronous step unwinds.
    // This prevents a second tour from starting on top of the first one.
    clearChapterGateTimers();
    if (chapterGateResolve) {
      const resolvePending = chapterGateResolve;
      chapterGateResolve = null;
      resolvePending("stop");
    }
    if (exerciseResolve) {
      const resolvePending = exerciseResolve;
      exerciseResolve = null;
      resolvePending("stop");
    }
    hideChapterGate();
    hideExerciseDock();
    clearHighlight();
    hideRemark();
    if (cursor) cursor.style.opacity = "0";
    if (keycap) keycap.classList.remove("is-visible");
    updatePlayButton();
  }

  doc.addEventListener("click", event => {
    if (event.target?.closest?.("button.tab[data-tab]")) global.setTimeout(() => {
      const area = areaForCurrentUi();
      currentArea = area;
      currentChapterIndex = Number.isFinite(lastChapterByArea[area]) ? lastChapterByArea[area] : 0;
      updateDemoCard();
    }, 180);
  }, true);
  doc.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (running) { event.preventDefault(); stopTour(); }
      else if (chooser && !chooser.classList.contains("hide")) { event.preventDefault(); hideChooser(); }
    }
  }, true);

  function init() {
    installOverlays();
    installPlayControl();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  global.TriplemDemoTour = {
    start(areaKey, chapterIndex = 0) { return startChapter(areaKey, Number(chapterIndex || 0)); },
    startAll(areaKey) { return startAllChapters(areaKey); },
    openChapters(areaKey) { showChooser(areaKey || areaForCurrentUi()); },
    stop: stopTour,
    get running() { return running; },
    get pace() { return paceName; },
    set pace(value) { if (value in PACE) paceName = value; },
    get narrationSupported() { return speechAvailable; },
    get narration() { return narrationEnabled; },
    set narration(value) { narrationEnabled = value !== false; if (!narrationEnabled) cancelNarration(); },
    get narrationVoice() {
      const voice = narrationVoice();
      return voice ? { name: voice.name, lang: voice.lang, gender: "female-preferred", natural: /natural|neural|online|premium|enhanced|multilingual/i.test(String(voice.name || "")) } : null;
    },
    areas: Object.keys(GUIDES),
    chapters(areaKey) { return (GUIDES[areaKey]?.chapters || []).map((c, i) => ({ index: i, title: c.title, summary: c.summary })); }
  };
})(window);
