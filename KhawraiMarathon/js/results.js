/* KMR public live results.
   Efficient by design for hundreds of simultaneous viewers:
   - the only Realtime subscription is ONE tiny row (marathon_live_state: version, top 3, counts, race control);
   - the full leaderboard is ONE row fetched on demand, after a random delay so viewers do not hit the server together;
   - every update carries a version number, so duplicate or out-of-order events are ignored;
   - a slow, jittered poll covers blocked WebSockets; polling pauses while the tab is hidden;
   - the leaderboard DOM is updated in place (keyed rows), so photos never reload and nothing flickers. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const scheduledFallback = '2026-11-15T16:00:00+05:00';
  const TOP_LIMIT = 25;                       // rows shown before "Show all"
  const MOVE_MS = 8000;                       // how long a position-change marker stays visible
  const PRIZES = ['Rs. 15,000 + Winning Trophy', 'Rs. 10,000 + Trophy', 'Rs. 5,000 + Trophy'];

  const S = {
    v: 0, bv: 0, ctl: null, banner: { top: [], c: {}, ctl: {} }, board: [], updatedAt: null, offset: 0,
    filter: 'all', query: '', showAll: false, connected: false, loaded: false,
    moves: new Map(), prevPos: new Map()
  };
  let results = [];                           // board rows (PDF uses this)
  const ordered = rows => rows;               // the board is already in live order

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeText = (value, fallback = '—') => value == null || value === '' ? fallback : String(value);
  const formatTime = seconds => {
    if (seconds == null || seconds === '') return '—';
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return '—';
    const h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60), s = Math.floor(value % 60);
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
  };
  const statusLabel = s => ({ scheduled: 'Scheduled', in_progress: 'Race In Progress', completed: 'Race Completed', registered: 'Registered', running: 'Running', finished: 'Finished', dnf: 'Did Not Finish', dsq: 'Disqualified' }[s] || 'Status unavailable');
  const dateTime = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value)) + ' PKT'; }
    catch (_) { return new Date(value).toLocaleString(); }
  };
  const timeOnly = value => {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(value)); }
    catch (_) { return ''; }
  };
  const ordinal = n => { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'); };
  const nowServer = () => Date.now() + S.offset;
  const photoSrc = path => (typeof photoUrl === 'function' && photoUrl(path)) || '../assets/logo-left.png';

  // compact snapshot item -> readable row
  const toRow = i => ({ reg_no: i.i, runner_name: i.n, photo_path: i.ph || null, status: i.s, place: i.p == null ? null : Number(i.p),
    current_position: i.p == null ? null : Number(i.p), finish_time_seconds: i.t == null ? null : Number(i.t) });

  // ---------------------------------------------------------------- banner / hero
  function raceMode() {
    const status = S.ctl && S.ctl.race_status || 'scheduled';
    return status === 'in_progress' ? 'live' : status === 'completed' ? (S.ctl.results_finalized_at ? 'final' : 'completed') : 'scheduled';
  }

  function renderFinalizationBanner() {
    const banner = $('resultsFinalizationBanner');
    if (!banner) return;
    const ctl = S.ctl || {};
    if (ctl.race_status !== 'completed') { banner.hidden = true; $('resultsFinalizationAnnouncement').hidden = true; return; }
    const finalized = !!ctl.results_finalized_at;
    banner.hidden = false;
    $('resultsFinalizationTitle').textContent = finalized ? 'Official results finalized' : 'Race finished · results being finalized';
    $('resultsFinalizationText').textContent = finalized
      ? `The organisers have verified and finalized the official standings${ctl.results_finalized_at ? ' on ' + dateTime(ctl.results_finalized_at) : ''}. The leaderboard below is the published final result.`
      : 'The race has ended. Organisers are reviewing runner positions before publishing the official final standings. The leaderboard remains provisional until finalization.';
    const announcement = String(ctl.public_message || '').trim();
    const node = $('resultsFinalizationAnnouncement');
    node.hidden = !announcement;
    node.textContent = announcement ? `Organiser announcement: ${announcement}` : '';
  }

  function renderControl() {
    const ctl = S.ctl || {};
    const status = ctl.race_status || 'scheduled';
    const mode = raceMode();
    document.body.dataset.raceMode = mode;
    const hero = $('resultsHero'), live = $('liveBanner');
    if (hero) hero.hidden = mode !== 'scheduled';
    if (live) { live.hidden = mode === 'scheduled'; live.dataset.mode = mode; }

    // hero card (scheduled)
    const badge = $('raceStatusBadge');
    if (badge) { badge.textContent = statusLabel(status); badge.className = 'results-status' + (status === 'in_progress' ? ' live' : status === 'completed' ? ' done' : ''); }
    if ($('raceCountdownWrap')) $('raceCountdownWrap').hidden = status !== 'scheduled';
    if ($('raceLiveNote')) {
      $('raceLiveNote').textContent = status === 'scheduled'
        ? safeText(ctl.public_message, 'The race is scheduled for 15 November 2026 at 04:00 PM Pakistan Time. The official start will be announced by organisers.')
        : safeText(ctl.public_message, status === 'in_progress' ? 'The race is in progress.' : 'The race has been completed.');
    }
    updateCountdown();

    // live banner
    if (live && mode !== 'scheduled') {
      const titles = { live: 'Race in progress', completed: 'Race completed', final: 'Official final results' };
      const subs = { live: 'Live positions · updated by the race organisers', completed: 'Standings are provisional until the organisers finalize them', final: 'Verified and published by the race organisers' };
      const badges = { live: 'LIVE', completed: 'FINISHED', final: 'OFFICIAL' };
      $('lvBadgeText').textContent = badges[mode];
      $('lvTitle').textContent = titles[mode];
      $('lvSub').textContent = subs[mode];
      $('lvClockLabel').textContent = mode === 'live' ? 'Race time' : 'Total time';
      const message = String(ctl.public_message || '').trim();
      $('lvAnnounce').hidden = !message;
      $('lvAnnounceText').textContent = message;
    }
    renderFinalizationBanner();
    renderClock();
  }

  function updateCountdown() {
    const ctl = S.ctl || {};
    if ((ctl.race_status || 'scheduled') !== 'scheduled' || !$('raceCountdown')) return;
    const target = new Date(ctl.scheduled_at || scheduledFallback).getTime();
    const remaining = Math.max(0, target - nowServer());
    const values = [Math.floor(remaining / 86400000), Math.floor((remaining % 86400000) / 3600000), Math.floor((remaining % 3600000) / 60000), Math.floor((remaining % 60000) / 1000)];
    const cells = $('raceCountdown').querySelectorAll('.time-cell strong');
    if (cells.length === 4) values.forEach((n, i) => { const t = String(n).padStart(2, '0'); if (cells[i].textContent !== t) cells[i].textContent = t; });
    else $('raceCountdown').innerHTML = values.map((n, i) => `<div class="time-cell"><strong>${String(n).padStart(2, '0')}</strong><small>${['Days', 'Hours', 'Minutes', 'Seconds'][i]}</small></div>`).join('');
  }

  function renderClock() {
    const ctl = S.ctl || {};
    const clock = $('lvClock');
    if (!clock || !ctl.started_at) { if (clock) clock.textContent = '00:00:00'; return; }
    const start = new Date(ctl.started_at).getTime();
    const end = ctl.race_status === 'completed' && ctl.ended_at ? new Date(ctl.ended_at).getTime() : nowServer();
    const text = formatTime(Math.max(0, Math.floor((end - start) / 1000)));
    if (clock.textContent !== text) clock.textContent = text;
  }

  // ---------------------------------------------------------------- leaders (1st / 2nd / 3rd)
  const leaderKeys = [null, null, null];
  function renderLeaders() {
    const top = (S.banner && S.banner.top || []).map(toRow);
    for (let slot = 0; slot < 3; slot++) {
      const el = document.querySelector(`#lvLeaders [data-slot="${slot}"]`);
      if (!el) continue;
      const r = top[slot] || null;
      const key = r ? [r.reg_no, r.runner_name, r.photo_path, r.status, r.finish_time_seconds].join('|') : 'empty';
      if (leaderKeys[slot] === key) continue;
      const changedPerson = leaderKeys[slot] !== null && leaderKeys[slot].split('|')[0] !== (r ? r.reg_no : 'empty');
      leaderKeys[slot] = key;
      el.classList.toggle('is-empty', !r);
      el.querySelector('.lv-name').textContent = r ? r.runner_name : 'Waiting for runners';
      el.querySelector('.lv-reg').textContent = r ? r.reg_no : '';
      const photo = el.querySelector('.lv-photo');
      if (r) { const src = photoSrc(r.photo_path); if (photo.getAttribute('src') !== src) photo.setAttribute('src', src); photo.alt = r.runner_name; photo.hidden = false; }
      else { photo.removeAttribute('src'); photo.alt = ''; photo.hidden = true; }
      const status = el.querySelector('.lv-status'), time = el.querySelector('.lv-time');
      if (r) {
        status.textContent = r.status === 'finished' ? 'Finished' : 'Running';
        status.className = 'lv-status ' + r.status;
        time.textContent = r.status === 'finished' && r.finish_time_seconds != null ? formatTime(r.finish_time_seconds) : '';
      } else { status.textContent = ''; status.className = 'lv-status'; time.textContent = ''; }
      if (changedPerson) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
    }
  }

  function renderStats() {
    const c = S.banner && S.banner.c || {};
    const set = (id, v) => { const el = $(id); if (!el) return; const t = String(v == null ? 0 : v); if (el.textContent !== t) el.textContent = t; };
    set('lvStatRunning', c.running); set('lvStatFinished', c.finished); set('lvStatOther', (c.dnf || 0) + (c.dsq || 0)); set('lvStatTotal', c.participants != null ? c.participants : c.total);
  }

  // ---------------------------------------------------------------- leaderboard (keyed, in place)
  const rows = new Map();   // reg_no -> { el, sig, refs }
  function buildRow(reg) {
    const li = document.createElement('li');
    li.className = 'lv-row'; li.dataset.reg = reg;
    li.innerHTML = '<span class="lv-pos"><b></b><em class="lv-move" hidden></em></span>'
      + '<img class="lv-photo" alt="" width="44" height="44" loading="lazy" decoding="async">'
      + '<span class="lv-who"><strong></strong><small></small></span>'
      + '<span class="lv-res"><b class="lv-chip"></b><small class="lv-t"></small></span>';
    const refs = { pos: li.querySelector('.lv-pos b'), move: li.querySelector('.lv-move'), photo: li.querySelector('.lv-photo'),
      name: li.querySelector('.lv-who strong'), reg: li.querySelector('.lv-who small'), chip: li.querySelector('.lv-chip'), time: li.querySelector('.lv-t') };
    refs.photo.addEventListener('error', () => { refs.photo.removeAttribute('src'); refs.photo.classList.add('missing'); }, { passive: true });
    return { el: li, sig: '', refs };
  }
  function fillRow(rec, r, mv) {
    const sig = [r.runner_name, r.photo_path, r.status, r.place, r.finish_time_seconds, mv ? mv.delta + ':' + mv.until : ''].join('|');
    if (rec.sig === sig) return;
    rec.sig = sig;
    const { el, refs } = rec;
    const p = r.place || 0;
    el.className = 'lv-row s-' + r.status + (p >= 1 && p <= 3 ? ' p' + p : '') + (mv ? (mv.delta > 0 ? ' moved-up' : ' moved-down') : '');
    refs.pos.textContent = p > 0 ? p : '—';
    if (mv) { refs.move.hidden = false; refs.move.className = 'lv-move ' + (mv.delta > 0 ? 'up' : 'down'); refs.move.textContent = (mv.delta > 0 ? '▲' : '▼') + Math.abs(mv.delta); }
    else refs.move.hidden = true;
    const src = photoSrc(r.photo_path);
    if (refs.photo.dataset.src !== src) { refs.photo.dataset.src = src; refs.photo.classList.remove('missing'); refs.photo.setAttribute('src', src); }
    refs.photo.alt = '';
    refs.name.textContent = r.runner_name; refs.reg.textContent = r.reg_no;
    refs.chip.textContent = statusLabel(r.status); refs.chip.className = 'lv-chip ' + r.status;
    refs.time.textContent = r.status === 'finished' && r.finish_time_seconds != null ? formatTime(r.finish_time_seconds) : '';
  }

  let moveTimer = null;
  function renderBoard() {
    const list = $('lvBoard');
    if (!list) return;
    const now = Date.now();
    S.moves.forEach((mv, reg) => { if (mv.until <= now) S.moves.delete(reg); });
    const q = S.query.trim().toLowerCase();
    let matched = S.board.filter(r => {
      if (S.filter === 'running' && r.status !== 'running') return false;
      if (S.filter === 'finished' && r.status !== 'finished') return false;
      if (S.filter === 'other' && (r.status === 'running' || r.status === 'finished')) return false;
      if (q && !(String(r.runner_name || '').toLowerCase().includes(q) || String(r.reg_no || '').toLowerCase().includes(q))) return false;
      return true;
    });
    const limited = !q && S.filter === 'all' && !S.showAll && matched.length > TOP_LIMIT;
    const visible = limited ? matched.slice(0, TOP_LIMIT) : matched;

    const seen = new Set();
    let cursor = list.firstElementChild;
    if (cursor && cursor.classList.contains('lv-empty')) { list.removeChild(cursor); cursor = list.firstElementChild; }
    visible.forEach(r => {
      let rec = rows.get(r.reg_no);
      if (!rec) { rec = buildRow(r.reg_no); rows.set(r.reg_no, rec); }
      fillRow(rec, r, S.moves.get(r.reg_no));
      seen.add(r.reg_no);
      if (rec.el === cursor) cursor = cursor.nextElementSibling;
      else list.insertBefore(rec.el, cursor);
    });
    while (cursor) { const next = cursor.nextElementSibling; list.removeChild(cursor); cursor = next; }
    rows.forEach((rec, reg) => { if (!seen.has(reg)) rows.delete(reg); });

    if (!visible.length) {
      const li = document.createElement('li'); li.className = 'lv-empty';
      li.textContent = !S.loaded ? 'Loading live results…' : S.board.length ? 'No runner matches your search.' : 'Official results have not been published yet. Please check back during the race.';
      list.appendChild(li);
    }
    const more = $('lvMore');
    if (more) {
      more.hidden = !(limited || (S.showAll && !q && S.filter === 'all' && matched.length > TOP_LIMIT));
      more.textContent = limited ? `Show all ${matched.length} runners` : 'Show top 25 only';
    }
    const note = $('lvMoreNote');
    if (note) note.textContent = limited ? `Showing the top ${TOP_LIMIT} of ${matched.length}. Use the search box to find any runner.` : '';

    clearTimeout(moveTimer);
    if (S.moves.size) { const next = Math.min(...[...S.moves.values()].map(m => m.until)); moveTimer = setTimeout(scheduleRender, Math.max(300, next - Date.now() + 50)); }
  }

  function renderSummary() {
    const c = S.banner && S.banner.c || {};
    const el = $('leaderboardSummary');
    if (!el) return;
    const base = `${c.participants != null ? c.participants : S.board.length} runner${(c.participants != null ? c.participants : S.board.length) === 1 ? '' : 's'} · ${c.running || 0} running · ${c.finished || 0} finished`;
    const ctl = S.ctl || {};
    el.textContent = ctl.results_finalized_at ? `${base} · Official final standings.`
      : ctl.race_status === 'completed' ? `${base} · Standings are provisional while organisers verify and finalize them.`
      : ctl.race_status === 'in_progress' ? `${base} · Live positions are updated by race organisers.` : base;
    const upd = $('lvUpdated');
    if (upd) upd.textContent = S.updatedAt ? 'Updated ' + timeOnly(S.updatedAt) : '';
  }

  function setConnection(ok) {
    S.connected = !!ok;
    ['liveConnection', 'lvConn'].forEach(id => {
      const node = $(id); if (!node) return;
      node.textContent = S.connected ? 'Live updates connected' : 'Reconnecting…';
      node.classList.toggle('offline', !S.connected);
    });
  }

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderControl(); renderLeaders(); renderStats(); renderBoard(); renderSummary(); });
  }

  // ---------------------------------------------------------------- data flow
  function noteMoves(newBoard) {
    const until = Date.now() + MOVE_MS, next = new Map();
    newBoard.forEach(r => { if (r.place != null) next.set(r.reg_no, r.place); });
    if (S.prevPos.size) next.forEach((pos, reg) => {
      const was = S.prevPos.get(reg);
      if (was != null && was !== pos) S.moves.set(reg, { delta: was - pos, until });
    });
    S.prevPos = next;
  }

  function applyBundle(b) {
    if (!b || typeof b !== 'object') return false;
    if (Number(b.bv || 0) < S.bv) return false;                       // an older snapshot never replaces a newer one
    S.ctl = b.ctl && b.ctl.race_status ? b.ctl : (S.ctl || { race_status: 'scheduled', scheduled_at: scheduledFallback, public_message: '' });
    if (Number(b.v || 0) >= S.v) { S.v = Number(b.v || 0); S.banner = b.banner && b.banner.top ? b.banner : S.banner; }
    S.bv = Number(b.bv || 0);
    S.updatedAt = b.updated_at || S.updatedAt;
    if (b.now) S.offset = new Date(b.now).getTime() - Date.now();
    const board = (Array.isArray(b.board) ? b.board : []).map(toRow);
    noteMoves(board);
    S.board = board; results = board; S.loaded = true;
    scheduleRender();
    return true;
  }

  // The tiny realtime row: update the banner at once, then fetch the board after a random delay.
  function applyState(row) {
    if (!row || Number(row.version) <= S.v) return;
    S.v = Number(row.version);
    if (row.banner && row.banner.top) { S.banner = row.banner; if (row.banner.ctl && row.banner.ctl.race_status) S.ctl = Object.assign({}, S.ctl, row.banner.ctl); }
    if (row.updated_at) S.updatedAt = row.updated_at;
    scheduleRender();
    requestBoard(150 + Math.random() * 1450);
  }

  let boardTimer = null, fetching = false, retries = 0;
  function requestBoard(delay) {
    if (boardTimer) return;                                            // already scheduled: coalesce
    boardTimer = setTimeout(() => { boardTimer = null; fetchBundle(); }, Math.max(0, delay || 0));
  }
  async function fetchBundle() {
    if (fetching) { requestBoard(400); return; }
    fetching = true;
    try {
      const { data, error } = await sb.rpc('kmr_live_bundle');
      if (error) throw error;
      applyBundle(data);
      if (S.bv < S.v && retries < 3) { retries++; requestBoard(700 * retries); } else retries = 0;   // snapshot not yet visible: retry shortly
    } catch (error) {
      console.warn('Could not load live results:', error && error.message || error);
      if (!S.loaded) {
        if ($('raceLiveNote')) $('raceLiveNote').textContent = 'Could not connect to official race updates. The page will retry automatically.';
        if ($('lvBoard') && !S.board.length) renderBoard();
      }
    } finally { fetching = false; }
  }

  // Slow safety-net poll (tiny request). Faster only when Realtime is not connected. Paused while hidden.
  let pollTimer = null;
  function schedulePoll() {
    clearTimeout(pollTimer);
    const base = S.connected ? 45000 : 12000;
    pollTimer = setTimeout(poll, base * (0.8 + Math.random() * 0.4));
  }
  async function poll() {
    try {
      if (!document.hidden && navigator.onLine !== false) {
        if (!S.loaded) await fetchBundle();
        else {
          const { data, error } = await sb.from('marathon_live_state').select('version').eq('id', true).maybeSingle();
          if (!error && data && Number(data.version) > Math.max(S.v, S.bv)) { S.v = Math.max(S.v, Number(data.version)); requestBoard(Math.random() * 1200); }
        }
      }
    } catch (_) { /* retry on the next tick */ }
    schedulePoll();
  }

  let channel = null;
  function subscribe() {
    try {
      channel = sb.channel('kmr-live-state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marathon_live_state' }, payload => applyState(payload && payload.new))
        .subscribe(status => {
          setConnection(status === 'SUBSCRIBED');
          if (status === 'SUBSCRIBED' && S.loaded) requestBoard(Math.random() * 800);   // catch up on anything missed while reconnecting
        });
    } catch (_) { setConnection(false); }
  }

  async function loadPdfLibrary() {
    if (window.jspdf && window.jspdf.jsPDF) return;
    await new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(s => s.src.includes('jspdf.umd.min.js'));
      if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; script.onload = resolve; script.onerror = () => reject(new Error('PDF library unavailable. Check the internet connection.'));
      document.head.appendChild(script);
    });
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF library failed to load.');
  }

  // Decode each logo in the browser and re-encode it as a real PNG data URL. This
  // also fixes logo-left.png, whose file bytes are JPEG despite its .png suffix.
  async function imageAsPngDataUrl(url, existingImage = null) {
    let objectUrl = null;
    try {
      let image;
      try {
        const response = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' });
        if (!response.ok) throw new Error('Logo request failed');
        objectUrl = URL.createObjectURL(await response.blob());
        image = new Image();
        image.src = objectUrl;
        if (image.decode) await image.decode();
        else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      } catch (error) {
        if (!existingImage || !existingImage.complete || !existingImage.naturalWidth) throw error;
        image = existingImage;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, image.naturalWidth || image.width);
      canvas.height = Math.max(1, image.naturalHeight || image.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch (_) {
      return null;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  async function loadPdfLogos() {
    const pageLogoElement = document.querySelector('.top .logo');
    const pageLogoUrl = pageLogoElement && (pageLogoElement.currentSrc || pageLogoElement.src)
      || (window.KMR && window.KMR.LOGO_URL)
      || 'https://triplem.vip/KhawraiUnity/logo.png';
    const [pageLogo, leftLogo, rightLogo] = await Promise.all([
      imageAsPngDataUrl(pageLogoUrl, pageLogoElement),
      imageAsPngDataUrl('../assets/logo-left.png'),
      imageAsPngDataUrl('../assets/logo-right.png')
    ]);
    return { pageLogo, leftLogo, rightLogo };
  }

  function addContainedLogo(doc, dataUrl, x, y, boxW, boxH, alias) {
    if (!dataUrl) return;
    try {
      const info = doc.getImageProperties(dataUrl);
      const width = Number(info.width) || boxW, height = Number(info.height) || boxH;
      const scale = Math.min(boxW / width, boxH / height);
      const drawW = width * scale, drawH = height * scale;
      doc.addImage(dataUrl, 'PNG', x + (boxW - drawW) / 2, y + (boxH - drawH) / 2, drawW, drawH, alias, 'FAST');
    } catch (_) { /* A missing logo must not prevent the results PDF from downloading. */ }
  }

  async function downloadPdf() {
    const button = $('downloadResultsPdf');
    if (button.disabled) return;
    button.disabled = true; const old = button.textContent; button.textContent = 'Preparing PDF…';
    try {
      await loadPdfLibrary();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight(), margin = 36;
      const logos = await loadPdfLogos();

      // The page's own header logo stays beside the title. The district and sports
      // department logos sit together at the upper-right with identical box sizes.
      const drawBrandHeader = continued => {
        addContainedLogo(doc, logos.pageLogo, margin, 20, 46, 46, 'kmr-page-logo');
        const partnerSize = 36, partnerGap = 8;
        const partnerRightX = pageW - margin - partnerSize;
        const partnerLeftX = partnerRightX - partnerGap - partnerSize;
        addContainedLogo(doc, logos.leftLogo, partnerLeftX, 25, partnerSize, partnerSize, 'kmr-district-logo');
        addContainedLogo(doc, logos.rightLogo, partnerRightX, 25, partnerSize, partnerSize, 'kmr-sports-logo');
        const titleX = margin + 55;
        doc.setTextColor(18, 54, 45); doc.setFont('helvetica', 'bold'); doc.setFontSize(16.5);
        doc.text('KHAWRAI MARATHON RACE', titleX, 40);
        doc.setFontSize(10.5);
        doc.setTextColor(70, 91, 82);
        doc.text(continued ? 'SEASON THREE · OFFICIAL RESULTS · CONTINUED' : 'SEASON THREE · OFFICIAL RESULTS', titleX, 57);
        doc.setDrawColor(211, 224, 217); doc.setLineWidth(0.8); doc.line(margin, 75, pageW - margin, 75);
      };

      drawBrandHeader(false);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(94, 108, 104); doc.setFontSize(8.5);
      doc.text('Race date: 15 November 2026 · 04:00 PM Pakistan Time', margin, 91);
      doc.text('Race status: ' + statusLabel(control && control.race_status), margin, 105);
      if (control && control.started_at) doc.text('Started: ' + dateTime(control.started_at), margin, 119);
      if (control && control.ended_at) doc.text('Ended: ' + dateTime(control.ended_at), margin + 230, 119);
      doc.setDrawColor(211, 224, 217); doc.line(margin, 130, pageW - margin, 130);
      doc.setTextColor(35, 54, 47); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text('PODIUM PRIZES', margin, 149);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(93, 103, 100);
      doc.text('1st: Rs. 15,000 + Winning Trophy', margin, 165); doc.text('2nd: Rs. 10,000 + Trophy', margin + 190, 165); doc.text('3rd: Rs. 5,000 + Trophy', margin + 355, 165);
      let y = 196;
      const cols = [margin, margin + 48, margin + 105, margin + 330, margin + 420];
      const drawHeader = () => {
        doc.setFillColor(19, 65, 52); doc.roundedRect(margin, y - 13, pageW - margin * 2, 24, 4, 4, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.text('PLACE', cols[0] + 7, y + 2); doc.text('REG. NO.', cols[1] + 3, y + 2); doc.text('RUNNER', cols[2] + 3, y + 2); doc.text('STATUS', cols[3] + 3, y + 2); doc.text('TIME', cols[4] + 3, y + 2); y += 22;
      };
      drawHeader();
      const sorted = ordered(results);
      if (!sorted.length) {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 110, 108); doc.setFontSize(10); doc.text('Official results have not been published yet.', margin, y + 20); y += 42;
      }
      sorted.forEach((r, i) => {
        if (y > pageH - 48) {
          doc.addPage();
          drawBrandHeader(true);
          y = 96;
          drawHeader();
        }
        if (Number(r.place) === 1) { doc.setFillColor(255, 244, 200); doc.rect(margin, y - 11, pageW - margin * 2, 25, 'F'); }
        else if (Number(r.place) === 2) { doc.setFillColor(235, 241, 245); doc.rect(margin, y - 11, pageW - margin * 2, 25, 'F'); }
        else if (Number(r.place) === 3) { doc.setFillColor(250, 230, 214); doc.rect(margin, y - 11, pageW - margin * 2, 25, 'F'); }
        else if (i % 2 === 0) { doc.setFillColor(247, 250, 248); doc.rect(margin, y - 11, pageW - margin * 2, 25, 'F'); }
        doc.setTextColor(32, 49, 43); doc.setFont('helvetica', r.place && r.place <= 3 ? 'bold' : 'normal'); doc.setFontSize(8.2);
        doc.text(r.place ? String(r.place) : '—', cols[0] + 7, y + 4);
        doc.text(String(r.reg_no || '—').slice(0, 13), cols[1] + 3, y + 4);
        doc.text(doc.splitTextToSize(String(r.runner_name || ''), 215)[0] || '', cols[2] + 3, y + 4);
        doc.setFont('helvetica', 'normal'); doc.text(statusLabel(r.status), cols[3] + 3, y + 4);
        doc.setFont('helvetica', 'bold'); doc.text(r.status === 'finished' ? formatTime(r.finish_time_seconds) : '—', cols[4] + 3, y + 4);
        y += 25;
      });
      for (let p = 1; p <= doc.internal.getNumberOfPages(); p++) {
        doc.setPage(p); doc.setDrawColor(219, 228, 222); doc.line(margin, pageH - 33, pageW - margin, pageH - 33);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(115, 126, 120); doc.setFontSize(7.5); doc.text('Official live board · Generated ' + dateTime(new Date().toISOString()), margin, pageH - 19);
        doc.text(`Page ${p} of ${doc.internal.getNumberOfPages()}`, pageW - margin, pageH - 19, { align: 'right' });
      }
      doc.save('Khawrai-Marathon-Season-Three-Results.pdf');
    } catch (error) {
      alert(error && error.message ? error.message : 'Could not create the results PDF.');
    } finally { button.disabled = false; button.textContent = old; }
  }


  // ---------------------------------------------------------------- interactions
  function wire() {
    const search = $('lvSearch');
    if (search) {
      let t = null;
      search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.query = search.value; scheduleRender(); }, 120); });
    }
    document.querySelectorAll('[data-lv-filter]').forEach(btn => btn.addEventListener('click', () => {
      S.filter = btn.dataset.lvFilter; S.showAll = false;
      document.querySelectorAll('[data-lv-filter]').forEach(b => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      scheduleRender();
    }));
    const more = $('lvMore');
    if (more) more.addEventListener('click', () => { S.showAll = !S.showAll; scheduleRender(); });
    $('downloadResultsPdf').addEventListener('click', downloadPdf);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { requestBoard(Math.random() * 600); renderClock(); } });
    window.addEventListener('online', () => { requestBoard(200); setConnection(S.connected); });
    window.addEventListener('offline', () => setConnection(false));
    window.addEventListener('beforeunload', () => { clearTimeout(pollTimer); clearTimeout(boardTimer); if (channel) sb.removeChannel(channel); });
  }

  wire();
  fetchBundle().then(() => { schedulePoll(); });
  subscribe();
  setInterval(() => { updateCountdown(); renderClock(); }, 1000);
  // exposed for automated tests only
  window.__kmrLive = { S, applyBundle, applyState, scheduleRender, requestBoard };
})();
