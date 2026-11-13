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
  // Race postponed (DSO Nowshera notice, 13 Nov 2026): no fixed race date, so the
  // public pre-race countdown has been removed. The new date will be announced.
  const POSTPONED = !!(window.KMR && window.KMR.POSTPONEMENT && window.KMR.POSTPONEMENT.ENABLED !== false);
  const TOP_LIMIT = 25;                       // rows shown before "Show all"
  const MOVE_MS = 8000;                       // how long a position-change marker stays visible
  const PRIZES = ['Rs. 15,000 + Winning Trophy', 'Rs. 10,000 + Trophy', 'Rs. 5,000 + Trophy'];

  const S = {
    v: 0, bv: 0, ctl: null, banner: { top: [], c: {}, ctl: {} }, board: [], feed: [], updatedAt: null, offset: 0,
    filter: 'all', query: '', showAll: false, connected: false, loaded: false,
    moves: new Map(), prevPos: new Map(), viewers: 0
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
    const postponedNow = POSTPONED && status === 'scheduled';
    if (badge) {
      badge.textContent = postponedNow ? 'Race Postponed' : statusLabel(status);
      badge.className = 'results-status' + (postponedNow ? ' postponed' : status === 'in_progress' ? ' live' : status === 'completed' ? ' done' : '');
    }
    if ($('raceLiveNote')) {
      const postponedNote = 'The race has been postponed due to unavoidable circumstances. The new date will be announced by District Sports Office Nowshera.';
      // Ignore any stale organiser message that still mentions the original race date.
      const organiserMessage = /15\s*nov/i.test(String(ctl.public_message || '')) ? '' : String(ctl.public_message || '').trim();
      $('raceLiveNote').textContent = status === 'scheduled'
        ? (postponedNow ? postponedNote + (organiserMessage ? ' Organiser update: ' + organiserMessage : '') : safeText(organiserMessage, 'The official start will be announced by the organisers.'))
        : safeText(ctl.public_message, status === 'in_progress' ? 'The race is in progress.' : 'The race has been completed.');
    }

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
      // Banner status text (nsfida-only custom message shown above the announce bar)
      const bannerStatus = String(ctl.banner_text || '').trim();
      if ($('lvBannerStatus')) {
        $('lvBannerStatus').hidden = !bannerStatus;
        $('lvBannerStatusText').textContent = bannerStatus;
      }
    }
    renderFinalizationBanner();
    renderViewers();
    syncPresence();
    renderClock();
    // PDF button: only available after race is completed. Any reset sets race_status back
    // to 'scheduled', which automatically re-locks the button.
    const pdfBtn = $('downloadResultsPdf');
    if (pdfBtn) {
      const pdfAllowed = mode === 'completed' || mode === 'final';
      pdfBtn.hidden = !pdfAllowed;
      pdfBtn.disabled = !pdfAllowed;
      pdfBtn.title = pdfAllowed ? 'Download official results PDF' : 'PDF download is only available after the race is completed';
    }
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
    requestAnimationFrame(() => { renderQueued = false; renderControl(); renderLeaders(); renderStats(); renderBoard(); renderSummary(); renderFeed(); renderViewers(); });
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
    S.ctl = b.ctl && b.ctl.race_status ? b.ctl : (S.ctl || { race_status: 'scheduled', scheduled_at: null, public_message: '' });
    if (Number(b.v || 0) >= S.v) { S.v = Number(b.v || 0); S.banner = b.banner && b.banner.top ? b.banner : S.banner; }
    S.bv = Number(b.bv || 0);
    S.updatedAt = b.updated_at || S.updatedAt;
    if (b.now) S.offset = new Date(b.now).getTime() - Date.now();
    const board = (Array.isArray(b.board) ? b.board : []).map(toRow);
    noteMoves(board);
    S.board = board; results = board; S.loaded = true;
    if (Array.isArray(b.feed)) S.feed = b.feed;
    scheduleRender();
    return true;
  }

  // ---------------------------------------------------------------- race event feed
  const FEED_ICONS = { start: '🏃', finish: '🏁', dnf: '⛔', dsq: '🚫', position: '↕', note: '📣', reset: '🔄', end: '🏁' };
  function renderFeed() {
    const wrap = $('raceFeedWrap');
    if (!wrap) return;
    const mode = raceMode();
    // only show feed while race is live or just finished (not finalized, not scheduled)
    const showFeed = (mode === 'live' || mode === 'completed') && S.feed && S.feed.length > 0;
    wrap.hidden = !showFeed;
    if (!showFeed) return;

    const list = $('raceFeedList');
    if (!list) return;

    // keyed update: only rebuild if content changed
    const newKey = S.feed.map(e => e.id || e.ts).join(',');
    if (list.dataset.feedKey === newKey) return;
    list.dataset.feedKey = newKey;

    list.innerHTML = S.feed.map(ev => {
      const icon = FEED_ICONS[ev.event_type] || '•';
      const clock = ev.race_clock_seconds != null ? formatTime(ev.race_clock_seconds) : '';
      const name = ev.runner_name ? esc(ev.runner_name) : '';
      const reg = ev.reg_no ? `<span class="feed-reg">#${esc(ev.reg_no)}</span>` : '';
      const msg = ev.message ? esc(ev.message) : '';
      const detail = name ? `${name}${reg ? ' ' + reg : ''}${msg ? ' · ' + msg : ''}` : msg;
      return `<li class="feed-item feed-${esc(ev.event_type || 'note')}">
        <span class="feed-icon" aria-hidden="true">${icon}</span>
        <span class="feed-body">${detail}</span>
        ${clock ? `<span class="feed-clock">${clock}</span>` : ''}
      </li>`;
    }).join('');
  }

  // ---------------------------------------------------------------- live viewer count
  // Uses Supabase Realtime Presence: each tab is one presence entry.
  // The count is only shown when race is in_progress or completed.
  let presenceChannel = null;
  const VIEWER_KEY = () => Math.random().toString(36).slice(2) + Date.now().toString(36); // unique per tab
  let myViewerKey = null;

  function renderViewers() {
    const el = $('lvBadgeViewers');
    if (!el) return;
    const mode = raceMode();
    const show = (mode === 'live' || mode === 'completed') && S.viewers > 0;
    el.hidden = !show;
    if (!show) return;
    el.textContent = '';
    // eye icon + count, no "viewers" text
    el.innerHTML = `<span aria-hidden="true">👁</span>${S.viewers}`;
    el.setAttribute('aria-label', `${S.viewers} ${S.viewers === 1 ? 'viewer' : 'viewers'} watching`);
  }

  function joinPresence() {
    // Leave any existing channel first
    if (presenceChannel) { try { sb.removeChannel(presenceChannel); } catch (_) {} presenceChannel = null; }
    myViewerKey = VIEWER_KEY();
    try {
      presenceChannel = sb.channel('kmr-viewers', { config: { presence: { key: myViewerKey } } })
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          S.viewers = Object.keys(state).length;
          renderViewers();
        })
        .on('presence', { event: 'join' }, () => {
          const state = presenceChannel.presenceState();
          S.viewers = Object.keys(state).length;
          renderViewers();
        })
        .on('presence', { event: 'leave' }, () => {
          const state = presenceChannel.presenceState();
          S.viewers = Object.keys(state).length;
          renderViewers();
        })
        .subscribe(async status => {
          if (status === 'SUBSCRIBED') {
            await presenceChannel.track({ joined_at: Date.now() });
          }
        });
    } catch (_) { /* presence unavailable; silently skip */ }
  }

  function leavePresence() {
    if (presenceChannel) { try { presenceChannel.untrack(); sb.removeChannel(presenceChannel); } catch (_) {} presenceChannel = null; }
    S.viewers = 0;
    renderViewers();
  }

  function syncPresence() {
    // Join only when race is live or completed; leave otherwise.
    const mode = raceMode();
    const shouldTrack = mode === 'live' || mode === 'completed';
    if (shouldTrack && !presenceChannel) joinPresence();
    else if (!shouldTrack && presenceChannel) leavePresence();
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
    button.disabled = true;
    const old = button.textContent;
    button.textContent = 'Preparing PDF…';
    try {
      await loadPdfLibrary();
      const { jsPDF } = window.jspdf;

      // ── constants ────────────────────────────────────────────────────────
      const A4W = 595.28, A4H = 841.89, M = 36; // pt
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const ctl = S.ctl || {};
      const sorted = ordered(results);

      // ── logos ────────────────────────────────────────────────────────────
      button.textContent = 'Loading logos…';
      const logos = await loadPdfLogos();

      // ── fetch enriched player data (address, district) ───────────────────
      button.textContent = 'Loading player data…';
      let participantMap = {};   // reg_no → { address, district_tehsil }
      try {
        const { data: pData } = await sb.from('public_participants')
          .select('reg_no, address, district_tehsil')
          .order('reg_no');
        if (Array.isArray(pData)) pData.forEach(p => { participantMap[p.reg_no] = p; });
      } catch (_) { /* non-fatal; address column just stays blank */ }

      // ── fetch race event log ─────────────────────────────────────────────
      button.textContent = 'Loading race events…';
      let eventLog = [];
      try {
        const { data: eData } = await sb.from('marathon_race_log')
          .select('id, event_type, race_clock_seconds, reg_no, runner_name, message, created_at')
          .order('id', { ascending: true });
        if (Array.isArray(eData)) eventLog = eData;
      } catch (_) { /* non-fatal */ }

      // ── load photo images for top-10 runners ────────────────────────────
      button.textContent = 'Loading photos…';
      const photoCache = {};
      const top10 = sorted.slice(0, 10).filter(r => r.photo_path);
      await Promise.allSettled(top10.map(async r => {
        const url = photoSrc(r.photo_path);
        const data = await imageAsPngDataUrl(url);
        if (data) photoCache[r.reg_no] = data;
      }));

      button.textContent = 'Building PDF…';

      // ── helpers ──────────────────────────────────────────────────────────
      const clip = (str, maxLen) => { const s = String(str || ''); return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s; };

      // Draw the standard page header:
      //   LEFT : pageLogo (Khawrai Unity) 50×50 pt
      //   RIGHT: leftLogo + rightLogo side by side, 38×38 pt each, flush with right margin
      //   TITLE: centred between the two logo groups
      const drawHeader = (subtitle) => {
        const logoY = 16;
        // ── Left: main page logo ─────────────────────────────────────────
        addContainedLogo(doc, logos.pageLogo, M, logoY, 50, 50, 'kmr-page-logo');
        // ── Right: two partner logos, right-aligned ──────────────────────
        const partnerSz = 38, partnerGap = 6;
        const r2X = A4W - M - partnerSz;         // rightmost logo x
        const r1X = r2X - partnerGap - partnerSz; // second-from-right x
        addContainedLogo(doc, logos.leftLogo,  r1X, logoY + 6, partnerSz, partnerSz, 'kmr-left-logo');
        addContainedLogo(doc, logos.rightLogo, r2X, logoY + 6, partnerSz, partnerSz, 'kmr-right-logo');
        // ── Title block: left-aligned, next to pageLogo ──────────────────
        const titleX = M + 58;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(18, 54, 45);
        doc.text('KHAWRAI MARATHON RACE', titleX, 33);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 91, 82);
        doc.text('SEASON THREE  ·  ' + subtitle.toUpperCase(), titleX, 47);
        // ── Divider ───────────────────────────────────────────────────────
        doc.setDrawColor(180, 210, 196); doc.setLineWidth(0.8);
        doc.line(M, 66, A4W - M, 66);
      };

      // Footer for every page (call after all pages are created)
      const drawFooters = () => {
        const total = doc.internal.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
          doc.setPage(p);
          doc.setDrawColor(200, 218, 210); doc.setLineWidth(0.5);
          doc.line(M, A4H - 28, A4W - M, A4H - 28);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140, 150, 145);
          doc.text(`Khawrai Marathon Race Season Three  ·  Official results  ·  Generated ${dateTime(new Date().toISOString())}`, M, A4H - 16);
          doc.text(`Page ${p} of ${total}`, A4W - M, A4H - 16, { align: 'right' });
        }
      };

      // ════════════════════════════════════════════════════════════════════
      // PAGE 1 — race summary + leaderboard
      // ════════════════════════════════════════════════════════════════════
      drawHeader('Official Results');

      // Race info block
      let y = 82;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 95, 90);
      const infoLeft  = `Race status: ${statusLabel(ctl.race_status || 'scheduled')}`;
      const infoRight = ctl.results_finalized_at ? `Finalized: ${dateTime(ctl.results_finalized_at)}` : '';
      doc.text(infoLeft, M, y);
      if (infoRight) doc.text(infoRight, A4W - M, y, { align: 'right' });
      y += 11;
      if (ctl.started_at) {
        doc.text(`Started: ${dateTime(ctl.started_at)}`, M, y);
        if (ctl.ended_at) doc.text(`Ended: ${dateTime(ctl.ended_at)}`, A4W - M, y, { align: 'right' });
        y += 11;
      }
      const c = S.banner && S.banner.c || {};
      const totals = `${c.participants != null ? c.participants : sorted.length} runners · ${c.finished || 0} finished · ${c.running || 0} still running`;
      doc.text(totals, M, y); y += 11;
      if (ctl.public_message) {
        doc.setTextColor(30, 80, 60); doc.setFont('helvetica', 'bold');
        doc.text(clip('Announcement: ' + ctl.public_message, 110), M, y); y += 11;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 95, 90);
      }

      // Prizes banner
      y += 4;
      doc.setFillColor(19, 65, 52); doc.roundedRect(M, y, A4W - M * 2, 20, 3, 3, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.text('PRIZES', M + 8, y + 13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.text('1st: Rs. 15,000 + Winning Trophy', M + 54, y + 13);
      doc.text('2nd: Rs. 10,000 + Trophy', M + 230, y + 13);
      doc.text('3rd: Rs. 5,000 + Trophy', M + 380, y + 13);
      y += 28;

      // ── Leaderboard table ───────────────────────────────────────────────
      // Columns: photo | place | reg | name | address | status | time
      // Widths (sum = A4W - 2*M = 523 pt):
      const colPhoto  = M;          // 32 pt photo box
      const colPlace  = M + 32;     // 28
      const colReg    = M + 60;     // 46
      const colName   = M + 106;    // 160
      const colAddr   = M + 266;    // 140
      const colStatus = M + 406;    // 60
      const colTime   = M + 466;    // 57  → total 523

      const ROW_H = 32;  // pt per data row (tall enough for two text lines + photo)
      const HDR_H = 20;

      const drawTableHeader = () => {
        doc.setFillColor(19, 65, 52); doc.rect(M, y, A4W - M * 2, HDR_H, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        doc.text('#',        colPlace  + 2, y + 13);
        doc.text('REG',      colReg    + 2, y + 13);
        doc.text('RUNNER',   colName   + 2, y + 13);
        doc.text('ADDRESS',  colAddr   + 2, y + 13);
        doc.text('STATUS',   colStatus + 2, y + 13);
        doc.text('TIME',     colTime   + 2, y + 13);
        y += HDR_H;
      };

      drawTableHeader();

      if (!sorted.length) {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 110, 108); doc.setFontSize(9);
        doc.text('Official results have not been published yet.', M, y + 20); y += 40;
      }

      sorted.forEach((r, i) => {
        // Page break check
        if (y > A4H - 60) {
          doc.addPage();
          drawHeader('Official Results (continued)');
          y = 80;
          drawTableHeader();
        }

        // Row background
        const pl = Number(r.place);
        if (pl === 1)      { doc.setFillColor(255, 247, 205); doc.rect(M, y, A4W - M * 2, ROW_H, 'F'); }
        else if (pl === 2) { doc.setFillColor(236, 242, 248); doc.rect(M, y, A4W - M * 2, ROW_H, 'F'); }
        else if (pl === 3) { doc.setFillColor(252, 236, 220); doc.rect(M, y, A4W - M * 2, ROW_H, 'F'); }
        else if (i % 2 === 0) { doc.setFillColor(248, 251, 249); doc.rect(M, y, A4W - M * 2, ROW_H, 'F'); }

        // Thin row separator
        doc.setDrawColor(220, 232, 226); doc.setLineWidth(0.3);
        doc.line(M, y + ROW_H, A4W - M, y + ROW_H);

        // Photo (top-10 only)
        const photoData = photoCache[r.reg_no];
        if (photoData) {
          try {
            doc.addImage(photoData, 'PNG', colPhoto + 1, y + 2, 28, 28, `photo-${r.reg_no}`, 'FAST');
          } catch (_) { /* skip if image embedding fails */ }
        }

        // Podium medal strip on left edge for top 3
        if (pl <= 3) {
          const medalColor = pl === 1 ? [210, 160, 20] : pl === 2 ? [150, 160, 170] : [180, 100, 50];
          doc.setFillColor(...medalColor);
          doc.rect(M, y, 3, ROW_H, 'F');
        }

        const textY1 = y + 11; // first line baseline
        const textY2 = y + 22; // second line baseline

        // Place
        doc.setTextColor(30, 50, 42);
        doc.setFont('helvetica', pl <= 3 ? 'bold' : 'normal');
        doc.setFontSize(pl <= 3 ? 9 : 8);
        doc.text(r.place != null ? String(r.place) : '—', colPlace + 2, textY1 + (ROW_H - 22) / 2);

        // Reg no
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80, 95, 90);
        doc.text(clip(r.reg_no, 10), colReg + 2, textY1);

        // Runner name + address
        const pInfo = participantMap[r.reg_no] || {};
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(22, 44, 36);
        doc.text(clip(r.runner_name, 28), colName + 2, textY1);
        if (pInfo.district_tehsil) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 115, 108);
          doc.text(clip(pInfo.district_tehsil, 30), colName + 2, textY2);
        }

        // Address column
        if (pInfo.address) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 115, 108);
          const addrLines = doc.splitTextToSize(clip(pInfo.address, 55), 134);
          doc.text(addrLines.slice(0, 2), colAddr + 2, textY1);
        }

        // Status
        const statusColors = { finished: [11, 107, 75], running: [20, 100, 50], dnf: [160, 100, 20], dsq: [160, 40, 40] };
        const sc = statusColors[r.status] || [80, 90, 85];
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...sc);
        doc.text(statusLabel(r.status), colStatus + 2, textY1 + 4);

        // Finish time
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(22, 44, 36);
        doc.text(r.status === 'finished' ? formatTime(r.finish_time_seconds) : '—', colTime + 2, textY1 + 4);

        y += ROW_H;
      });

      // ════════════════════════════════════════════════════════════════════
      // PAGE — Race event log (only if there are events)
      // ════════════════════════════════════════════════════════════════════
      if (eventLog.length > 0) {
        doc.addPage();
        drawHeader('Race Event Log');
        y = 80;

        // Section title
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(18, 54, 45);
        doc.text('COMPLETE RACE EVENT LOG', M, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 115, 108);
        doc.text(`${eventLog.length} event${eventLog.length === 1 ? '' : 's'} recorded during this race`, M, y); y += 14;

        // Event table header
        const evCols = { time: M, clock: M + 68, type: M + 118, reg: M + 170, name: M + 210, msg: M + 335 };
        const EV_H = 18;
        const drawEvHeader = () => {
          doc.setFillColor(19, 65, 52); doc.rect(M, y, A4W - M * 2, 18, 'F');
          doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8);
          doc.text('PKT TIME',   evCols.time  + 2, y + 12);
          doc.text('RACE CLOCK', evCols.clock + 2, y + 12);
          doc.text('EVENT',      evCols.type  + 2, y + 12);
          doc.text('REG',        evCols.reg   + 2, y + 12);
          doc.text('RUNNER',     evCols.name  + 2, y + 12);
          doc.text('NOTE',       evCols.msg   + 2, y + 12);
          y += 18;
        };
        drawEvHeader();

        const EVENT_ICONS = { start: 'START', finish: 'FINISH', dnf: 'DNF', dsq: 'DSQ', position: 'POS', note: 'NOTE', reset: 'RESET', end: 'END' };
        const EVENT_COLORS = { start: [0, 120, 80], finish: [11, 107, 75], dnf: [150, 90, 10], dsq: [160, 40, 40], end: [30, 70, 120], reset: [120, 60, 10], note: [60, 60, 100], position: [40, 80, 60] };

        eventLog.forEach((ev, i) => {
          if (y > A4H - 56) {
            doc.addPage();
            drawHeader('Race Event Log (continued)');
            y = 80;
            drawEvHeader();
          }
          if (i % 2 === 0) { doc.setFillColor(247, 250, 248); doc.rect(M, y, A4W - M * 2, EV_H, 'F'); }
          doc.setDrawColor(220, 232, 226); doc.setLineWidth(0.3);
          doc.line(M, y + EV_H, A4W - M, y + EV_H);

          const evBase = y + 12;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(80, 95, 90);
          doc.text(ev.created_at ? timeOnly(ev.created_at) : '—', evCols.time + 2, evBase);
          doc.text(ev.race_clock_seconds != null ? formatTime(ev.race_clock_seconds) : '—', evCols.clock + 2, evBase);

          const ec = EVENT_COLORS[ev.event_type] || [60, 80, 70];
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...ec);
          doc.text(EVENT_ICONS[ev.event_type] || (ev.event_type || '').toUpperCase(), evCols.type + 2, evBase);

          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(60, 80, 70);
          doc.text(clip(ev.reg_no, 8), evCols.reg + 2, evBase);
          doc.text(clip(ev.runner_name, 20), evCols.name + 2, evBase);
          doc.setTextColor(90, 100, 95);
          doc.text(clip(ev.message, 42), evCols.msg + 2, evBase);
          y += EV_H;
        });
      }

      // ── footers on every page ────────────────────────────────────────────
      drawFooters();
      doc.save('Khawrai-Marathon-Season-Three-Results.pdf');

    } catch (error) {
      alert(error && error.message ? error.message : 'Could not create the results PDF.');
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
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
    window.addEventListener('beforeunload', () => { clearTimeout(pollTimer); clearTimeout(boardTimer); if (channel) sb.removeChannel(channel); leavePresence(); });
  }

  wire();
  fetchBundle().then(() => { schedulePoll(); });
  subscribe();
  setInterval(renderClock, 1000);
  // exposed for automated tests only
  window.__kmrLive = { S, applyBundle, applyState, scheduleRender, requestBoard, syncPresence, leavePresence };
})();
