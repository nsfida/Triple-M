(function () {
  const $ = id => document.getElementById(id);
  let wired = false, activeUser = '', channel = null, rosterPollTimer = null, registrations = [], results = [], control = null, busy = false, editingRegistrationId = '', permissions = {};
  const selectedRunnerIds = new Set();
  const lpRows = new Map();                       // live-position list rows, kept in place (keyed by registration id)
  let pendingMoves = 0, moveQueue = Promise.resolve(), reloadTimer = null, rosterReloadTimer = null, renderQueued = false, sheetState = null;
  const ordinal = n => { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'); };
  // Same rule as the database: moving a runner shifts everybody in between by one place.
  function applyMoveLocal(rows, registrationId, newPos) {
    const me = rows.find(r => r.registration_id === registrationId);
    if (!me || me.current_position == null) return false;
    const old = me.current_position;
    rows.forEach(r => {
      if (r === me || r.current_position == null) return;
      const p = r.current_position;
      if (newPos < old && p >= newPos && p < old) r.current_position = p + 1;
      else if (newPos > old && p > old && p <= newPos) r.current_position = p - 1;
    });
    me.current_position = newPos; me.updated_at = new Date().toISOString();
    return true;
  }
  const participantRows = () => results.filter(r => r.current_position != null).sort((a, b) => a.current_position - b.current_position);
  const announcementPresets = Object.freeze({
    registration_reminder: 'Registration is open. Please complete your registration before the deadline and arrive early on race day.',
    race_day_arrival: 'Race-day reminder: please arrive early for registration check-in and warm-up. Follow the organisers’ instructions.',
    race_starting_soon: 'The race will start shortly. Runners should move to the starting area and follow the organisers’ instructions.',
    race_started: 'The race has officially started. Best of luck to all runners!',
    race_in_progress: 'The marathon is in progress. Please keep the course clear and follow the marshals’ instructions.',
    finish_line_open: 'The finish line is open. Congratulations to every runner taking part. Finish times will be verified before results are finalised.',
    results_updating: 'Race results are being updated. Please check the live results board for the latest verified standings.',
    race_completed: 'The race has officially concluded. Congratulations to all runners, and thank you to the volunteers and supporters.',
    start_delayed: 'Race update: the start is delayed. Please remain at the event area and follow announcements from the organisers.',
    safety_reminder: 'Safety reminder: follow the marshals’ instructions, stay on the designated route and ask event staff for assistance if needed.',
    thank_you: 'Thank you to all runners, volunteers, supporters and organisers for being part of Khawrai Marathon Race Season Three.'
  });

  const timeToSeconds = value => {
    const m = /^([0-9]{1,2}):([0-5][0-9]):([0-5][0-9])$/.exec(String(value || '').trim());
    if (!m) return null;
    const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    return sec >= 1 && sec <= 172800 ? sec : null;
  };
  const secondsToTime = sec => {
    if (sec == null || !Number.isFinite(Number(sec))) return '';
    const n = Number(sec); return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60].map(v => String(v).padStart(2, '0')).join(':');
  };
  const labelStatus = s => ({ scheduled: 'Scheduled', in_progress: 'Race In Progress', completed: 'Race Completed', registered: 'Registered', running: 'Running', finished: 'Finished', dnf: 'Did Not Finish', dsq: 'Disqualified' }[s] || s || '—');
  const formatTime = sec => sec == null ? '—' : secondsToTime(sec);
  const formatStamp = value => { if (!value) return 'Not recorded'; try { return new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value)) + ' PKT'; } catch (_) { return new Date(value).toLocaleString(); } };
  const drawMessage = (text, bad = false) => { const node = $('raceAdminMsg'); node.textContent = text; node.className = 'msg' + (bad ? ' bad' : ''); };
  const setBusy = value => {
    busy = value;
    const finalized = !!(control && control.results_finalized_at);
    document.querySelectorAll('#paneResultsAdmin button, #paneResultsAdmin select, #paneResultsAdmin input, #raceBulkFinishDialog button, #raceBulkFinishDialog input, .race-ctrl-bar button').forEach(node => {
      const lockedResultEdit = finalized && node.matches('#raceResultForm input, #raceResultForm select, #raceResultForm button, [data-race-action], .lp-edit, #raceStatusAdmin, #raceStartNow, #raceEndNow, #raceFinalizeResults, #raceFullResetOpen');
      const lockedReset = finalized && node.matches('#raceResetScheduled') && !(permissions && permissions.is_owner === true);
      node.disabled = value || !!lockedResultEdit || !!lockedReset;
    });
    // End button: only active when race is actually in_progress
    const endBtn = $('raceEndNow');
    if (endBtn && !value) endBtn.disabled = !(control && control.race_status === 'in_progress') || finalized;
    syncBulkSelectionUI();
    if (typeof renderLive === 'function') renderLive();
  };
  function resetForm() {
    editingRegistrationId = '';
    $('raceResultForm').reset();
    updateFinishTimeVisibility();
    $('raceResultFormTitle').textContent = 'Add or update a runner result';
    $('raceSaveResult').textContent = 'Save result';
    $('raceCancelEdit').hidden = true;
  }
  function fillRunnerChoices() {
    const current = $('raceResultRunner').value;
    const active = registrations.filter(r => r.status === 'confirmed' && !r.is_cancelled);
    $('raceResultRunner').innerHTML = '<option value="">Choose a confirmed runner…</option>' + active.map(r => `<option value="${esc(r.id)}">${esc(r.reg_no)} · ${esc(r.name)}</option>`).join('');
    if (active.some(r => r.id === current)) $('raceResultRunner').value = current;
  }
  function updateFinishTimeVisibility() { const st = $('raceResultStatus').value; $('raceFinishTimeWrap').hidden = st !== 'finished'; $('raceCurrentPositionWrap').hidden = st !== 'running' && st !== 'finished'; }
  function syncAnnouncementPresetSelection() {
    const message = $('racePublicMessage').value.trim();
    const matchedPreset = Object.keys(announcementPresets).find(key => announcementPresets[key] === message);
    $('raceAnnouncementPreset').value = matchedPreset || (message ? 'custom' : '');
  }
  function applyAnnouncementPreset() {
    const preset = $('raceAnnouncementPreset').value;
    if (preset === 'custom') {
      $('racePublicMessage').focus();
      $('racePublicMessage').select();
      return;
    }
    if (!preset || !announcementPresets[preset]) return;
    $('racePublicMessage').value = announcementPresets[preset];
    $('racePublicMessage').focus();
    $('racePublicMessage').setSelectionRange($('racePublicMessage').value.length, $('racePublicMessage').value.length);
  }
  function applyFinalizationUI() {
    const finalized = !!(control && control.results_finalized_at);
    const raceEnded = !!(control && control.race_status === 'completed');
    const runningCount = results.filter(row => row.status === 'running').length;
    const canReopen = permissions && permissions.is_owner === true;
    const heading = $('raceFinalizationHeading');
    const help = $('raceFinalizationHelp');
    if (heading) heading.textContent = finalized ? 'Official results finalized and locked' : raceEnded ? 'Race ended · results are still provisional' : 'Results are provisional';
    if (help) help.textContent = finalized
      ? `Finalized ${formatStamp(control.results_finalized_at)}. To correct a result, nsfida must reopen editing first.`
      : !raceEnded ? 'After the race is ended, verify finish times and runner positions before finalizing.'
      : runningCount ? `${runningCount} runner${runningCount === 1 ? ' is' : 's are'} still marked Running. Update their status before finalization.`
      : 'Review the leaderboard and announcements. Finalization locks result changes until nsfida reopens editing.';
    const finalize = $('raceFinalizeResults');
    const reopen = $('raceReopenResults');
    if (finalize) { finalize.hidden = finalized; finalize.disabled = finalized || !raceEnded || runningCount > 0 || busy; }
    if (reopen) { reopen.hidden = !(finalized && canReopen); reopen.disabled = busy; }
    document.querySelectorAll('#raceResultForm input, #raceResultForm select, #raceResultForm button, [data-race-action], .lp-edit, [data-pos-btn], #raceSelectVisible, #raceBulkStatus, #raceBulkApply, [data-select-runner]').forEach(node => {
      node.disabled = finalized || busy;
    });
    const clearSelection = $('raceBulkClearSelection');
    if (clearSelection) clearSelection.disabled = busy;
    const statusSelect = $('raceStatusAdmin');
    if (statusSelect) statusSelect.disabled = finalized || busy;
    const isOwner = permissions && permissions.is_owner === true;
    const resetScheduled = $('raceResetScheduled');
    if (resetScheduled) {
      resetScheduled.hidden = !isOwner;
      resetScheduled.disabled = busy || (finalized && !canReopen);
    }
    const fullReset = $('raceFullResetOpen');
    if (fullReset) {
      fullReset.hidden = !isOwner;
      fullReset.disabled = busy || finalized;
    }
    const saveControlButton = document.querySelector('#raceControlForm button[type="submit"]');
    if (saveControlButton) saveControlButton.disabled = busy;
    if (finalized) drawMessage('Official results are finalized. Result edits are locked; only nsfida can reopen editing.', false);
  }
  async function finalizeResults() {
    if (busy) return;
    if (!control || control.race_status !== 'completed') return drawMessage('End the race before finalizing official results.', true);
    if (results.some(row => row.status === 'running')) return drawMessage('At least one runner is still marked Running. Update their result or mark them DNF first.', true);
    if (!confirm('Finalize the official race results now? All result updates will be locked until nsfida reopens editing.')) return;
    setBusy(true); drawMessage('Finalizing official results…');
    try {
      const { error } = await sb.rpc('admin_finalize_marathon_results', { p_finalize: true });
      if (error) throw error;
      await Promise.all([loadControl(), loadResults()]);
      drawMessage('Official results finalized. The public results page now shows the final standings.');
    } catch (error) { drawMessage(error && error.message ? error.message : 'Could not finalize results.', true); }
    finally { setBusy(false); applyFinalizationUI(); }
  }
  async function reopenResults() {
    if (busy || !permissions || permissions.is_owner !== true) return drawMessage('Only nsfida can reopen official results.', true);
    if (!confirm('Reopen editing for the finalized results? The public board will return to provisional status until finalization is completed again.')) return;
    setBusy(true); drawMessage('Reopening result editing…');
    try {
      const { error } = await sb.rpc('admin_finalize_marathon_results', { p_finalize: false });
      if (error) throw error;
      await loadControl();
      drawMessage('Result editing reopened. Corrections are allowed again; finalize the results when ready.');
    } catch (error) { drawMessage(error && error.message ? error.message : 'Could not reopen results.', true); }
    finally { setBusy(false); applyFinalizationUI(); }
  }

  function renderControl() {
    if (!control) return;
    $('raceStatusAdmin').value = control.race_status || 'scheduled';
    $('racePublicMessage').value = control.public_message || '';
    syncAnnouncementPresetSelection();
    const started = control.started_at ? formatStamp(control.started_at) : 'Not started';
    const ended = control.ended_at ? formatStamp(control.ended_at) : 'Not ended';
    $('raceAdminCurrentStatus').textContent = labelStatus(control.race_status);
    $('raceAdminStartedAt').textContent = started;
    $('raceAdminEndedAt').textContent = ended;
    $('raceAdminFinalizedAt').textContent = control.results_finalized_at ? formatStamp(control.results_finalized_at) + (control.results_finalized_by ? ' · by ' + control.results_finalized_by : '') : 'Not finalized';
    // Sticky bar badge
    const badge = $('raceCtrlBadge');
    if (badge) {
      const s = control.race_status || 'scheduled';
      badge.textContent = { scheduled: 'Scheduled', in_progress: 'Live', completed: 'Ended' }[s] || labelStatus(s);
      badge.className = 'race-ctrl-badge s-' + s;
    }
    // Announce preview
    const preview = $('announcePreview');
    if (preview) {
      const msg = (control.public_message || '').trim();
      preview.textContent = msg ? '· ' + msg.slice(0, 60) + (msg.length > 60 ? '…' : '') : '';
    }
    // End button: only enabled when race is in_progress
    const endBtn = $('raceEndNow');
    if (endBtn) endBtn.disabled = control.race_status !== 'in_progress' || busy;

    // Banner status text field (nsfida only)
    const bannerWrap = $('bannerStatusWrap');
    const bannerInput = $('bannerStatusText');
    if (bannerWrap) {
      const isOwner = permissions && permissions.is_owner === true;
      bannerWrap.hidden = !isOwner;
      if (isOwner && bannerInput) {
        bannerInput.value = control.banner_text || '';
      }
    }

    applyFinalizationUI();
  }
  async function loadRegistrations() {
    const { data, error } = await sb.from('public_marathon_runner_roster').select('id,reg_no,name,status,is_cancelled,photo_path').order('reg_no', { ascending: true });
    if (error) throw error;
    registrations = data || [];
    const activeIds = new Set(registrations.filter(r => r.status === 'confirmed' && !r.is_cancelled).map(r => r.id));
    [...selectedRunnerIds].forEach(id => { if (!activeIds.has(id)) selectedRunnerIds.delete(id); });
    fillRunnerChoices();
    renderAll();
  }
  async function loadControl() {
    const { data, error } = await sb.from('marathon_race_control').select('*').eq('id', true).maybeSingle();
    if (error) throw error;
    control = data; renderControl(); renderAll();
  }
  async function loadResults() {
    const raw = await sb.from('marathon_results').select('id,registration_id,status,finish_time_seconds,current_position,updated_at').order('updated_at', { ascending: false });
    if (raw.error) throw raw.error;
    results = raw.data || [];
    renderAll();
    applyFinalizationUI();
  }
  // Realtime can deliver one event per shifted runner; collapse them into a single reload.
  function reloadSoon(delay = 450) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      if (pendingMoves > 0 || busy) return reloadSoon(500);
      try { await loadResults(); } catch (error) { drawMessage(error && error.message || 'Could not refresh results.', true); }
    }, delay);
  }
  function renderAll() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderResults(); renderLive(); });
  }
  function registrationCompare(a, b) {
    return String(a.reg_no || '').localeCompare(String(b.reg_no || ''), undefined, { numeric: true, sensitivity: 'base' }) || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  }
  function getRosterRows() {
    const resultByRegistration = new Map(results.map(r => [r.registration_id, r]));
    const all = registrations
      .filter(r => r.status === 'confirmed' && !r.is_cancelled)
      .map(runner => ({ runner, result: resultByRegistration.get(runner.id) || null }))
      .sort((a, b) => registrationCompare(a.runner, b.runner));
    const search = ($('raceRunnerSearch')?.value || '').trim().toLocaleLowerCase();
    const filter = $('raceRunnerFilter')?.value || 'all';
    const sort = $('raceRunnerSort')?.value || 'position';
    let rows = all.filter(({ runner, result }) => {
      const matchesSearch = !search || `${runner.reg_no || ''} ${runner.name || ''}`.toLocaleLowerCase().includes(search);
      let matchesFilter = filter === 'all';
      if (filter === 'awaiting') matchesFilter = !result;
      else if (['registered', 'running', 'finished', 'dnf', 'dsq'].includes(filter)) matchesFilter = !!result && result.status === filter;
      return matchesSearch && matchesFilter;
    });
    const pos = item => item.result && item.result.current_position != null ? Number(item.result.current_position) : Infinity;
    if (sort === 'name') rows.sort((a, b) => String(a.runner.name || '').localeCompare(String(b.runner.name || ''), undefined, { sensitivity: 'base' }) || registrationCompare(a.runner, b.runner));
    else if (sort === 'finish_time') rows.sort((a, b) => {
      const at = a.result && a.result.status === 'finished' && Number.isFinite(Number(a.result.finish_time_seconds)) ? Number(a.result.finish_time_seconds) : Infinity;
      const bt = b.result && b.result.status === 'finished' && Number.isFinite(Number(b.result.finish_time_seconds)) ? Number(b.result.finish_time_seconds) : Infinity;
      return at - bt || registrationCompare(a.runner, b.runner);
    });
    else if (sort === 'position') rows.sort((a, b) => pos(a) - pos(b) || registrationCompare(a.runner, b.runner));
    else if (sort === 'updated') rows.sort((a, b) => {
      const at = a.result && a.result.updated_at ? new Date(a.result.updated_at).getTime() : 0;
      const bt = b.result && b.result.updated_at ? new Date(b.result.updated_at).getTime() : 0;
      return bt - at || registrationCompare(a.runner, b.runner);
    });
    return { all, rows };
  }
  function renderResults() {
    const { all, rows } = getRosterRows();
    if (!rows.length) {
      const message = all.length ? 'No runners match these search and filter settings. Clear filters to see everyone.' : 'No confirmed, active runners are available. Confirm a registration first.';
      $('raceAdminResultsBody').innerHTML = `<tr class="race-admin-empty-row"><td colspan="8" class="race-admin-empty">${message}</td></tr>`;
      syncBulkSelectionUI([]);
      return;
    }
    const total = participantRows().length;
    $('raceAdminResultsBody').innerHTML = rows.map(({ runner, result }) => {
      const status = result ? result.status : 'registered';
      const finish = result && result.status === 'finished' ? formatTime(result.finish_time_seconds) : '—';
      const position = result && result.current_position != null ? Number(result.current_position) : null;
      const updated = result && result.updated_at ? esc(formatStamp(result.updated_at)) : '<span class="race-admin-not-entered">Not entered</span>';
      const posCell = position
        ? `<button type="button" class="race-pos-btn pos-${position <= 3 ? position : 0}" data-pos-btn data-registration-id="${esc(runner.id)}" aria-haspopup="dialog" aria-label="Position ${position} of ${total} for ${esc(runner.name)}. Change position"><b>${position}</b><i aria-hidden="true">▾</i></button>`
        : '<span class="race-pos-none" title="Runners get a position when they are Running or Finished">—</span>';
      return `<tr data-registration-id="${esc(runner.id)}"${result ? ` data-result-id="${esc(result.id)}"` : ''}>
        <td data-label="Select" class="race-select-cell"><input type="checkbox" data-select-runner="${esc(runner.id)}" aria-label="Select ${esc(runner.name)}"${selectedRunnerIds.has(runner.id) ? ' checked' : ''}></td>
        <td data-label="Position" class="race-pos-cell">${posCell}</td>
        <td data-label="Registration No."><strong class="race-registration-no">${esc(runner.reg_no)}</strong></td>
        <td data-label="Player"><span class="race-admin-runner-name"><strong>${esc(runner.name)}</strong></span></td>
        <td data-label="Status"><span class="race-admin-status ${esc(status)}">${esc(labelStatus(status))}</span></td>
        <td data-label="Finish time"><b class="race-admin-time">${finish}</b></td>
        <td data-label="Last updated">${updated}</td>
        <td data-label="Actions"><label class="race-row-action-label"><span class="sr-only">Actions for ${esc(runner.name)}</span><select data-race-action data-registration-id="${esc(runner.id)}" aria-label="Actions for ${esc(runner.name)}">
          <option value="">Choose action…</option>
          <option value="position"${position ? '' : ' disabled'}>Change position…</option>
          <option value="running">Mark running</option>
          <option value="finished_now">Mark finished (no time)</option>
          <option value="finished">Record / edit finish time</option>
          <option value="registered">Mark not started</option>
          <option value="dnf">Mark DNF</option>
          <option value="dsq">Disqualify runner</option>
          <option value="edit">Edit result details</option>
          <option value="delete"${result ? '' : ' disabled'}>Remove result record</option>
        </select></label></td>
      </tr>`;
    }).join('');
    syncBulkSelectionUI(rows);
  }
  // ====================================================================================
  // LIVE POSITIONS: ordered list, position picker, quick moves and race tools
  // ====================================================================================
  const isFinalized = () => !!(control && control.results_finalized_at);
  const photoOf = path => (typeof photoUrl === 'function' && path && photoUrl(path)) || '../../assets/logo-left.png';
  const runnerOf = id => registrations.find(r => r.id === id);

  function lpBuild(id) {
    const li = document.createElement('li');
    li.className = 'lp-row'; li.dataset.registrationId = id;
    li.innerHTML = '<button type="button" class="lp-pos" data-pos-btn aria-haspopup="dialog"><b></b><i aria-hidden="true">▾</i></button>'
      + '<img class="lp-photo" alt="" width="40" height="40" loading="lazy" decoding="async">'
      + '<span class="lp-who"><strong></strong><small></small></span>'
      + '<span class="lp-status"></span>'
      + '<span class="lp-actions"><button type="button" class="lp-step" data-lp-up aria-label="Move up one place">▲</button><button type="button" class="lp-step" data-lp-down aria-label="Move down one place">▼</button>'
      + '<select class="lp-act" data-lp-act aria-label="Runner actions"><option value="">Actions…</option><option value="finished_now">Mark finished</option><option value="finished">Record finish time…</option><option value="dnf">Mark DNF</option><option value="dsq">Disqualify</option><option value="registered">Mark not started</option><option value="edit">Edit details…</option></select></span>';
    const refs = { pos: li.querySelector('.lp-pos'), num: li.querySelector('.lp-pos b'), photo: li.querySelector('.lp-photo'), name: li.querySelector('.lp-who strong'),
      reg: li.querySelector('.lp-who small'), status: li.querySelector('.lp-status'), up: li.querySelector('[data-lp-up]'), down: li.querySelector('[data-lp-down]'), act: li.querySelector('.lp-act') };
    refs.photo.addEventListener('error', () => { refs.photo.removeAttribute('src'); refs.photo.classList.add('missing'); }, { passive: true });
    return { el: li, sig: '', refs };
  }

  function renderLive() {
    const list = $('lpList');
    if (!list) return;
    const finalized = isFinalized();
    const status = control && control.race_status || 'scheduled';
    const parts = participantRows();
    const total = parts.length;
    const running = parts.filter(r => r.status === 'running').length;
    const finishedCount = total - running;
    const timed = parts.filter(r => r.status === 'finished' && r.finish_time_seconds != null).length;
    const eligible = registrations.filter(r => r.status === 'confirmed' && !r.is_cancelled);
    const inRace = new Set(parts.map(r => r.registration_id));
    const missing = eligible.filter(r => !inRace.has(r.id) && !(results.find(x => x.registration_id === r.id && ['dnf', 'dsq'].includes(x.status)))).length;

    $('lpSummary').textContent = total
      ? `${total} runner${total === 1 ? '' : 's'} in the race · ${running} running · ${finishedCount} finished${finalized ? ' · results are finalized (locked)' : ''}`
      : (status === 'scheduled' ? 'Start the race to give every confirmed runner a random starting position.' : 'No runners are in the race yet. Use “Add missing runners”.');
    const addBtn = $('lpAddMissing'), rankBtn = $('lpRankByTime'), finBtn = $('lpFinishAll');
    addBtn.hidden = !(status === 'in_progress' && missing > 0 && !finalized); addBtn.textContent = `＋ Add ${missing} missing runner${missing === 1 ? '' : 's'}`;
    rankBtn.hidden = !(timed >= 2 && !finalized);
    finBtn.hidden = !(running > 0 && status !== 'scheduled' && !finalized);
    finBtn.textContent = `✓ Mark all ${running} running as finished`;

    const q = ($('lpSearch').value || '').trim().toLocaleLowerCase();
    const shown = q ? parts.filter(r => { const rn = runnerOf(r.registration_id); return rn && `${rn.reg_no} ${rn.name}`.toLocaleLowerCase().includes(q); }) : parts;
    $('lpCount').textContent = q ? `${shown.length} of ${total}` : '';

    const seen = new Set();
    let cursor = list.firstElementChild;
    if (cursor && cursor.classList.contains('lp-empty')) { list.removeChild(cursor); cursor = list.firstElementChild; }
    shown.forEach(r => {
      const runner = runnerOf(r.registration_id);
      if (!runner) return;
      let rec = lpRows.get(r.registration_id);
      if (!rec) { rec = lpBuild(r.registration_id); lpRows.set(r.registration_id, rec); }
      const p = r.current_position;
      const sig = [p, total, runner.name, runner.reg_no, runner.photo_path, r.status, r.finish_time_seconds, finalized ? 1 : 0].join('|');
      if (rec.sig !== sig) {
        rec.sig = sig;
        const { el, refs } = rec;
        el.className = 'lp-row s-' + r.status + (p <= 3 ? ' p' + p : '');
        refs.num.textContent = p;
        refs.pos.className = 'lp-pos lp-edit pos-' + (p <= 3 ? p : 0);
        refs.pos.setAttribute('aria-label', `Position ${p} of ${total} for ${runner.name}. Change position`);
        const src = photoOf(runner.photo_path);
        if (refs.photo.dataset.src !== src) { refs.photo.dataset.src = src; refs.photo.classList.remove('missing'); refs.photo.setAttribute('src', src); }
        refs.name.textContent = runner.name; refs.reg.textContent = runner.reg_no;
        refs.status.className = 'lp-status ' + r.status;
        refs.status.textContent = r.status === 'finished' ? (r.finish_time_seconds != null ? 'Finished · ' + formatTime(r.finish_time_seconds) : 'Finished') : 'Running';
      }
      // enabled/disabled state is re-applied on every render (setBusy() toggles these controls too)
      const { refs: r2 } = rec;
      const lock = finalized || busy;
      r2.up.disabled = lock || p <= 1; r2.down.disabled = lock || p >= total;
      r2.pos.disabled = lock; r2.act.disabled = lock;
      [r2.up, r2.down, r2.act].forEach(node => node.classList.add('lp-edit'));
      seen.add(r.registration_id);
      if (rec.el === cursor) cursor = cursor.nextElementSibling; else list.insertBefore(rec.el, cursor);
    });
    while (cursor) { const next = cursor.nextElementSibling; list.removeChild(cursor); cursor = next; }
    lpRows.forEach((rec, id) => { if (!seen.has(id)) lpRows.delete(id); });
    if (!shown.length) {
      const li = document.createElement('li'); li.className = 'lp-empty';
      li.textContent = q ? 'No runner in the live list matches your search.' : status === 'scheduled' ? 'The race has not started. Press “Start race now” to set every confirmed runner to Running with a random starting position.' : 'No runners are Running or Finished yet.';
      list.appendChild(li);
    }
  }

  // ---------------- position picker (bottom sheet on phones, centered card on larger screens)
  function openPositionSheet(registrationId) {
    if (isFinalized()) return drawMessage('Official results are finalized. Ask nsfida to reopen editing before changing positions.', true);
    const row = results.find(r => r.registration_id === registrationId);
    const runner = runnerOf(registrationId);
    if (!row || row.current_position == null || !runner) return drawMessage('Only runners who are Running or Finished have a position. Mark the runner Running first.', true);
    const parts = participantRows(), n = parts.length, cur = row.current_position;
    const holder = new Map(parts.map(r => [r.current_position, runnerOf(r.registration_id)]));
    sheetState = { registrationId, cur, n, opener: document.activeElement };
    $('posSheetTitle').textContent = runner.name;
    $('posSheetCurrent').textContent = `${runner.reg_no} · currently ${ordinal(cur)} of ${n}`;
    $('posGrid').innerHTML = Array.from({ length: n }, (_, i) => {
      const pos = i + 1, who = holder.get(pos);
      const tip = pos === cur ? 'Current position' : `Move to ${ordinal(pos)}${who ? ' — ' + who.name + ' moves ' + (pos < cur ? 'down' : 'up') : ''}`;
      return `<button type="button" role="option" class="pos-n${pos === cur ? ' is-current' : ''}${pos <= 3 ? ' m' + pos : ''}" data-pos="${pos}" aria-selected="${pos === cur}" title="${esc(tip)}">${pos}</button>`;
    }).join('');
    const sheet = $('posSheet');
    sheet.hidden = false; document.body.classList.add('pos-open');
    requestAnimationFrame(() => {
      sheet.classList.add('show');
      const target = $('posGrid').querySelector('.is-current') || $('posGrid').firstElementChild;
      if (target) { target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
    });
  }
  function closePositionSheet() {
    const sheet = $('posSheet');
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('show'); sheet.hidden = true; document.body.classList.remove('pos-open');
    const opener = sheetState && sheetState.opener; sheetState = null;
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  }

  // ---------------- moving a runner (instant on screen, saved in order, confirmed by the database)
  function moveRunner(registrationId, newPos) {
    const row = results.find(r => r.registration_id === registrationId);
    const runner = runnerOf(registrationId);
    if (!row || row.current_position == null || !runner) return;
    if (isFinalized()) return drawMessage('Official results are finalized. Ask nsfida to reopen editing before changing positions.', true);
    const n = participantRows().length, old = row.current_position;
    newPos = Number(newPos);
    if (!Number.isInteger(newPos) || newPos < 1 || newPos > n) return drawMessage(`Choose a position from 1 to ${n}.`, true);
    if (newPos === old) return;
    applyMoveLocal(results, registrationId, newPos);
    pendingMoves++; renderAll();
    drawMessage(`${runner.name}: ${ordinal(old)} → ${ordinal(newPos)}. Saving…`);
    moveQueue = moveQueue.then(async () => {
      const { error } = await sb.rpc('admin_move_runner_position', { p_registration_id: registrationId, p_new_position: newPos });
      if (error) throw error;
      drawMessage(`${runner.name} is now ${ordinal(newPos)}. Runners in between were shifted and the public live screen is updating.`);
    }).catch(error => {
      drawMessage(`Could not move ${runner.name}: ${String(error && error.message ? error.message : 'unknown error').replace(/[.\s]+$/, '')}. Showing the real order again.`, true);
    }).finally(() => {
      pendingMoves = Math.max(0, pendingMoves - 1);
      if (pendingMoves === 0) reloadSoon(250);
    });
  }

  // ---------------- race tools
  async function runTool(fn, workingText, doneText) {
    if (busy) return;
    setBusy(true); drawMessage(workingText);
    try {
      const { data, error } = await sb.rpc(fn);
      if (error) throw error;
      await Promise.all([loadResults(), loadControl()]);
      drawMessage(doneText(Number(data) || 0));
    } catch (error) { drawMessage(error && error.message ? error.message : 'The action failed.', true); }
    finally { setBusy(false); applyFinalizationUI(); renderLive(); }
  }
  function addMissingRunners() {
    if (!confirm('Add every confirmed runner who is not racing yet as Running at the END of the live positions?')) return;
    runTool('admin_add_missing_runners', 'Adding missing runners…', n => `${n} runner${n === 1 ? '' : 's'} added at the end of the live positions.`);
  }
  function rankFinishedByTime() {
    if (!confirm('Order the finished runners that have a finish time by that time (fastest first), ahead of everyone else? Other runners keep their relative order.')) return;
    runTool('admin_rank_finished_by_time', 'Sorting finished runners by time…', n => n ? `Positions updated: ${n} runner${n === 1 ? '' : 's'} moved.` : 'Finished runners were already in time order.');
  }
  function finishAllRunning() {
    const n = results.filter(r => r.status === 'running').length;
    if (!confirm(`Mark all ${n} running runner${n === 1 ? '' : 's'} as Finished? Their positions stay exactly as they are and no finish time is added.`)) return;
    runTool('admin_finish_all_running', 'Marking running runners as finished…', c => `${c} runner${c === 1 ? '' : 's'} marked Finished. You can now finalize the results.`);
  }

  function beginResultEdit(registrationId, row, preferredStatus) {
    const runner = registrations.find(r => r.id === registrationId);
    if (!runner) return drawMessage('This runner is not in the current confirmed participant list. Refresh registrations before editing.', true);
    $('raceResultRunner').value = registrationId;
    if (!$('raceResultRunner').value) return drawMessage('Only confirmed, non-cancelled runners can be edited.', true);
    editingRegistrationId = registrationId;
    $('raceResultStatus').value = preferredStatus || row && row.status || 'registered';
    $('raceFinishTime').value = row && row.finish_time_seconds != null ? secondsToTime(row.finish_time_seconds) : '';
    $('raceCurrentPosition').value = row && row.current_position != null && ['running', 'finished'].includes($('raceResultStatus').value) ? String(row.current_position) : '';
    updateFinishTimeVisibility();
    $('raceResultFormTitle').textContent = (row ? 'Editing result · ' : 'Add result · ') + runner.name;
    $('raceSaveResult').textContent = row ? 'Update result' : 'Save result';
    $('raceCancelEdit').hidden = false;
    $('raceResultForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function quickSetStatus(registrationId, status) {
    if (busy) return;
    const runner = registrations.find(r => r.id === registrationId);
    if (!runner) return drawMessage('Runner not found. Refresh race data and try again.', true);
    if (!['registered', 'running', 'finished', 'dnf', 'dsq'].includes(status)) return;
    if (status === 'dnf' && !confirm(`Mark ${runner.name} as Did Not Finish (DNF)? Runners behind them move up one place.`)) return;
    if (status === 'dsq' && !confirm(`Disqualify ${runner.name} from official results? Runners behind them move up one place.`)) return;
    if (status === 'registered' && !confirm(`Mark ${runner.name} as not started? They leave the live positions and runners behind them move up one place.`)) return;
    setBusy(true); drawMessage(`Updating ${runner.name}…`);
    try {
      const { error } = await sb.rpc('admin_upsert_marathon_result', {
        p_registration_id: registrationId, p_status: status, p_finish_time_seconds: null, p_current_position: null
      });
      if (error) throw error;
      await loadResults();
      drawMessage(`${runner.name} updated to ${labelStatus(status)}. The public board will update automatically.`);
    } catch (error) { drawMessage(error && error.message ? error.message : 'Could not update this runner.', true); }
    finally { setBusy(false); }
  }
  async function handleRosterAction(select) {
    const registrationId = select.dataset.registrationId;
    const action = select.value; select.value = '';
    if (!action) return;
    const result = results.find(r => r.registration_id === registrationId);
    if (action === 'edit') return beginResultEdit(registrationId, result, null);
    if (action === 'finished') return beginResultEdit(registrationId, result, 'finished');
    if (action === 'position') return openPositionSheet(registrationId);
    if (action === 'delete') { if (result) return deleteResult(result.id); return; }
    if (action === 'finished_now') return quickSetStatus(registrationId, 'finished');
    if (['registered', 'running', 'dnf', 'dsq'].includes(action)) return quickSetStatus(registrationId, action);
  }
  async function saveControl(statusOverride) {
    if (busy) return;
    const status = statusOverride || $('raceStatusAdmin').value;
    if (!['scheduled', 'in_progress', 'completed'].includes(status)) { drawMessage('Choose a valid race state.', true); return; }
    if (statusOverride === 'in_progress' && !confirm(control && control.race_status === 'scheduled' || !control ? `Start the race now?\n\n• every confirmed runner is set to Running\n• every runner gets a RANDOM starting position\n• the public live screen switches to the live banner` : 'Mark the marathon as IN PROGRESS again? Existing runner positions are kept.')) return;
    if (statusOverride === 'completed' && !confirm('Mark the marathon as COMPLETED? This will display Race Completed publicly.')) return;
    if (statusOverride === 'scheduled' && control && control.race_status !== 'scheduled' && !confirm('Reset the race state to Scheduled? Start/end timestamps will be cleared.')) return;
    setBusy(true); drawMessage('Saving race control…');
    try {
      const wasScheduled = !control || control.race_status === 'scheduled';
      // Pass the browser's real clock so started_at / ended_at reflect Pakistan time
      // exactly when the admin pressed the button, not the DB server's clock.
      const { error } = await sb.rpc('admin_update_race_control', { p_race_status: status, p_public_message: $('racePublicMessage').value.trim(), p_client_now: new Date().toISOString() });
      if (error) throw error;
      await Promise.all([loadControl(), loadResults()]);
      const started = status === 'in_progress' && wasScheduled;
      drawMessage(started ? `Race started. ${participantRows().length} runner${participantRows().length === 1 ? ' is' : 's are'} now Running with random starting positions. The public live screen is updating.` : 'Race state and public announcement saved securely. Live public page will update automatically.');
    } catch (error) { drawMessage(error && error.message ? error.message : 'Could not save race control.', true); }
    finally { setBusy(false); }
  }
  async function saveBannerText() {
    if (busy || !(permissions && permissions.is_owner)) return;
    const text = ($('bannerStatusText').value || '').trim() || null;
    setBusy(true); drawMessage('Saving banner status text…');
    try {
      const { error } = await sb.rpc('admin_save_banner_text', { p_text: text });
      if (error) throw error;
      await loadControl();
      drawMessage(text ? 'Banner status text saved. It will appear on the public results banner.' : 'Banner status text cleared.');
    } catch (error) {
      drawMessage(error && error.message ? error.message : 'Could not save banner text.', true);
    } finally { setBusy(false); }
  }

  async function resetRaceStatusOnly() {
    if (busy) return;
    if (!(permissions && permissions.is_owner)) return drawMessage('Only nsfida can reset the race status.', true);
    if (!confirm('Reset race status only? The race will return to Scheduled, start/end timestamps and the public announcement will be cleared, but all saved runner results will remain.')) return;
    setBusy(true); drawMessage('Resetting race status…');
    try {
      const { error } = await sb.rpc('admin_update_race_control', { p_race_status: 'scheduled', p_public_message: '' });
      if (error) throw error;
      await loadControl();
      drawMessage('Race status reset to Scheduled. Start/end timestamps and announcement cleared; saved runner results were kept.');
    } catch (error) {
      drawMessage(error && error.message ? error.message : 'Could not reset race status.', true);
    } finally { setBusy(false); }
  }

  function openFullResetDialog() {
    const dialog = $('raceResetDialog');
    $('raceResetResultCount').textContent = `${results.length} saved result record${results.length === 1 ? '' : 's'} will be removed. All registrations and financial records will remain.`;
    $('raceResetConfirmText').value = '';
    $('raceResetConfirm').disabled = true;
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
      $('raceResetConfirmText').focus();
      return;
    }
    // Fallback for older browsers that do not implement the dialog element.
    if (confirm(`Reset the entire race session? This removes ${results.length} saved result record(s), resets the race to Scheduled and clears its timestamps and public announcement. Registrations and participant records will remain.`)) {
      const typed = prompt('Type RESET to confirm:');
      if (String(typed || '').trim().toUpperCase() === 'RESET') fullResetRaceSession();
    }
  }

  async function fullResetRaceSession() {
    if (busy) return;
    const count = results.length;
    setBusy(true);
    drawMessage(`Resetting race state and removing ${count} saved result record${count === 1 ? '' : 's'}…`);
    try {
      const { data, error } = await sb.rpc('admin_reset_race_results');
      if (error) throw error;
      await Promise.all([loadControl(), loadResults()]);
      resetForm();
      const removed = Number(data) || count;
      drawMessage(`Full reset complete. Race is Scheduled, timestamps and public announcement are cleared, and ${removed} saved result record${removed === 1 ? '' : 's'} ${removed === 1 ? 'was' : 'were'} removed. Registrations, photos and participant records were not changed.`);
    } catch (error) {
      drawMessage('Full reset failed: ' + (error && error.message ? error.message : 'Unknown error.'), true);
    } finally { setBusy(false); }
  }
  async function saveResult(event) {
    event.preventDefault();
    if (busy) return;
    const registrationId = $('raceResultRunner').value;
    const status = $('raceResultStatus').value;
    let seconds = null, currentPosition = null;
    if (!registrationId) return drawMessage('Choose a confirmed runner first.', true);
    if (status === 'finished' && $('raceFinishTime').value.trim()) {
      seconds = timeToSeconds($('raceFinishTime').value);
      if (seconds == null) return drawMessage('Enter the finish time as HH:MM:SS between 00:00:01 and 48:00:00, or leave it empty.', true);
    }
    if ((status === 'running' || status === 'finished') && $('raceCurrentPosition').value.trim()) {
      currentPosition = Number($('raceCurrentPosition').value);
      if (!Number.isInteger(currentPosition) || currentPosition < 1 || currentPosition > 10000) return drawMessage('Position must be a whole number of 1 or more.', true);
    }
    setBusy(true); drawMessage('Saving result securely…');
    try {
      const { error } = await sb.rpc('admin_upsert_marathon_result', {
        p_registration_id: registrationId,
        p_status: status,
        p_finish_time_seconds: seconds,
        p_current_position: currentPosition
      });
      if (error) throw error;
      resetForm(); await Promise.all([loadResults(), loadControl()]);
      drawMessage('Result saved. Public standings and the podium will update automatically.');
    } catch (error) { drawMessage(error && error.message ? error.message : 'Could not save this result.', true); }
    finally { setBusy(false); }
  }
  async function deleteResult(id) {
    if (busy) return;
    const row = results.find(r => r.id === id); if (!row) return;
    const runner = registrations.find(r => r.id === row.registration_id);
    if (!confirm(`Delete the result record for ${runner ? runner.name : 'this runner'}? This cannot be undone.`)) return;
    setBusy(true); drawMessage('Deleting result…');
    try {
      const { error } = await sb.rpc('admin_delete_marathon_result', { p_result_id: id });
      if (error) throw error;
      await loadResults();
      if (editingRegistrationId === row.registration_id) resetForm();
      drawMessage('Result deleted. The public leaderboard has been updated.');
    } catch (error) { drawMessage(error && error.message ? error.message : 'Could not delete result.', true); }
    finally { setBusy(false); }
  }
  function editResult(id) {
    const row = results.find(r => r.id === id); if (!row) return;
    beginResultEdit(row.registration_id, row, null);
  }
  function getSelectedRunners() {
    const active = new Map(registrations.filter(r => r.status === 'confirmed' && !r.is_cancelled).map(r => [r.id, r]));
    return [...selectedRunnerIds].map(id => active.get(id)).filter(Boolean);
  }
  function syncBulkSelectionUI(rows) {
    const tbody = $('raceAdminResultsBody');
    const boxes = tbody ? [...tbody.querySelectorAll('[data-select-runner]')] : [];
    const visibleIds = boxes.map(box => box.dataset.selectRunner);
    const selectedVisible = visibleIds.filter(id => selectedRunnerIds.has(id)).length;
    const allVisibleSelected = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    const selectVisible = $('raceSelectVisible');
    if (selectVisible) {
      selectVisible.checked = allVisibleSelected;
      selectVisible.indeterminate = selectedVisible > 0 && !allVisibleSelected;
      selectVisible.disabled = busy || !!(control && control.results_finalized_at) || visibleIds.length === 0;
    }
    const count = $('raceBulkSelectedCount');
    const selected = getSelectedRunners();
    if (count) count.textContent = `${selected.length} selected`;
    const status = $('raceBulkStatus');
    const apply = $('raceBulkApply');
    if (status) status.disabled = busy || !!(control && control.results_finalized_at);
    if (apply) apply.disabled = busy || !!(control && control.results_finalized_at) || selected.length === 0 || !status || !status.value;
    if (boxes.length) {
      boxes.forEach(box => { box.checked = selectedRunnerIds.has(box.dataset.selectRunner); box.disabled = busy || !!(control && control.results_finalized_at); });
    }
  }
  function openBulkFinishedDialog(ids) {
    const dialog = $('raceBulkFinishDialog');
    const rows = ids.map(id => {
      const runner = registrations.find(item => item.id === id);
      const existing = results.find(item => item.registration_id === id);
      if (!runner) return null;
      return { id, runner, existing };
    }).filter(Boolean);
    if (!rows.length) return drawMessage('Select at least one active, confirmed runner first.', true);
    $('raceBulkFinishRows').innerHTML = rows.map(({ id, runner, existing }) => {
      const value = existing && existing.status === 'finished' && existing.finish_time_seconds != null ? secondsToTime(existing.finish_time_seconds) : '';
      return `<div class="race-bulk-finish-row"><div class="race-bulk-finish-runner"><strong>${esc(runner.reg_no)} · ${esc(runner.name)}</strong><small>${existing && existing.status === 'finished' && existing.finish_time_seconds != null ? 'Existing finish time prefilled' : 'Finish time (optional)'}</small></div><label><span class="sr-only">Finish time for ${esc(runner.name)}</span><input data-bulk-finish-time data-registration-id="${esc(id)}" inputmode="numeric" autocomplete="off" pattern="[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]" placeholder="HH:MM:SS" value="${esc(value)}"></label></div>`;
    }).join('');
    $('raceBulkFinishError').hidden = true;
    $('raceBulkFinishError').textContent = '';
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    else drawMessage('This browser does not support the secure finish-time dialog. Please update the browser and try again.', true);
  }
  async function applyBulkStatus(status, ids, finishTimes = {}) {
    if (busy) return;
    if (control && control.results_finalized_at) return drawMessage('Official results are finalized. Ask nsfida to reopen editing before making changes.', true);
    const allowedStatuses = ['registered', 'running', 'dnf', 'dsq', 'finished'];
    if (!allowedStatuses.includes(status)) return drawMessage('Choose a valid status for the selected runners.', true);
    const selected = ids.map(id => registrations.find(r => r.id === id)).filter(r => r && r.status === 'confirmed' && !r.is_cancelled);
    if (!selected.length) return drawMessage('Select at least one active, confirmed runner first.', true);
    const names = selected.slice(0, 5).map(r => `${r.reg_no} ${r.name}`).join(', ');
    const more = selected.length > 5 ? ` and ${selected.length - 5} more` : '';
    if (status !== 'finished' && !confirm(`Set ${selected.length} selected runner${selected.length === 1 ? '' : 's'} to ${labelStatus(status)}?\n\n${names}${more}\n\nOnly race-result status fields will be updated.`)) return;
    setBusy(true);
    drawMessage(`Updating ${selected.length} selected runner${selected.length === 1 ? '' : 's'}…`);
    try {
      const items = selected.map(r => ({ registration_id: r.id, status, finish_time_seconds: status === 'finished' && finishTimes[r.id] != null ? finishTimes[r.id] : null }));
      const { data, error } = await sb.rpc('admin_bulk_update_results', { p_items: items });
      if (error) throw error;
      selected.forEach(r => selectedRunnerIds.delete(r.id));
      await Promise.all([loadResults(), loadControl()]);
      const skipped = data && Array.isArray(data.skipped) ? data.skipped.length : 0;
      const updated = data && data.updated != null ? data.updated : selected.length;
      drawMessage(`${updated} runner${updated === 1 ? '' : 's'} updated to ${labelStatus(status)}${skipped ? `; ${skipped} skipped (not confirmed or cancelled)` : ''}. Public standings will refresh automatically.`, skipped > 0);
      if ($('raceBulkStatus')) $('raceBulkStatus').value = '';
    } catch (error) {
      drawMessage(error && error.message ? error.message : 'The bulk update failed. Nothing was changed.', true);
    } finally {
      setBusy(false);
      syncBulkSelectionUI();
    }
  }
  function beginBulkStatusUpdate() {
    if (busy) return;
    if (control && control.results_finalized_at) return drawMessage('Official results are finalized. Ask nsfida to reopen editing before making changes.', true);
    const selected = getSelectedRunners();
    if (!selected.length) return drawMessage('Select one or more players using the checkboxes first.', true);
    const status = $('raceBulkStatus').value;
    if (!status) return drawMessage('Choose the status to apply to the selected players.', true);
    const ids = selected.map(runner => runner.id);
    if (status === 'finished') return openBulkFinishedDialog(ids);
    applyBulkStatus(status, ids);
  }
  function wire() {
    if (wired) return; wired = true;
    $('raceControlForm').addEventListener('submit', e => { e.preventDefault(); saveControl(); });
    $('raceAnnouncementPreset').addEventListener('change', applyAnnouncementPreset);
    $('racePublicMessage').addEventListener('input', syncAnnouncementPresetSelection);
    $('raceResultForm').addEventListener('submit', saveResult);
    $('raceResultStatus').addEventListener('change', updateFinishTimeVisibility);
    $('raceCancelEdit').addEventListener('click', resetForm);
    $('raceStartNow').addEventListener('click', () => { $('raceStatusAdmin').value = 'in_progress'; saveControl('in_progress'); });
    $('raceEndNow').addEventListener('click', () => { $('raceStatusAdmin').value = 'completed'; saveControl('completed'); });
    $('raceFinalizeResults').addEventListener('click', finalizeResults);
    $('raceReopenResults').addEventListener('click', reopenResults);
    $('raceResetScheduled').addEventListener('click', resetRaceStatusOnly);
    $('raceFullResetOpen').addEventListener('click', openFullResetDialog);
    const bannerSaveBtn = $('bannerStatusSave');
    if (bannerSaveBtn) bannerSaveBtn.addEventListener('click', saveBannerText);
    $('raceResetCancel').addEventListener('click', () => $('raceResetDialog').close());
    $('raceResetConfirmText').addEventListener('input', () => {
      $('raceResetConfirm').disabled = $('raceResetConfirmText').value.trim().toUpperCase() !== 'RESET';
    });
    $('raceResetDialogForm').addEventListener('submit', event => {
      event.preventDefault();
      if ($('raceResetConfirmText').value.trim().toUpperCase() !== 'RESET') return;
      $('raceResetDialog').close();
      fullResetRaceSession();
    });
    $('raceRefreshData').addEventListener('click', async () => {
      setBusy(true); drawMessage('Refreshing race data…');
      try { await Promise.all([loadRegistrations(), loadControl(), loadResults()]); drawMessage('Race data refreshed.'); }
      catch (error) { drawMessage(error && error.message ? error.message : 'Could not refresh race data.', true); }
      finally { setBusy(false); }
    });
    $('raceAdminResultsBody').addEventListener('change', e => {
      const checkbox = e.target.closest('[data-select-runner]');
      if (checkbox) {
        if (checkbox.checked) selectedRunnerIds.add(checkbox.dataset.selectRunner);
        else selectedRunnerIds.delete(checkbox.dataset.selectRunner);
        syncBulkSelectionUI();
        return;
      }
      const select = e.target.closest('[data-race-action]');
      if (select) handleRosterAction(select);
    });
    $('raceSelectVisible').addEventListener('change', () => {
      const boxes = [...$('raceAdminResultsBody').querySelectorAll('[data-select-runner]')];
      boxes.forEach(box => { if ($('raceSelectVisible').checked) selectedRunnerIds.add(box.dataset.selectRunner); else selectedRunnerIds.delete(box.dataset.selectRunner); });
      syncBulkSelectionUI();
    });
    $('raceBulkStatus').addEventListener('change', syncBulkSelectionUI);
    $('raceBulkApply').addEventListener('click', beginBulkStatusUpdate);
    $('raceBulkClearSelection').addEventListener('click', () => { selectedRunnerIds.clear(); renderResults(); drawMessage('Runner selection cleared.'); });
    $('raceBulkFinishCancel').addEventListener('click', () => $('raceBulkFinishDialog').close());
    $('raceBulkFinishForm').addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      const inputs = [...$('raceBulkFinishRows').querySelectorAll('[data-bulk-finish-time]')];
      const finishTimes = {};
      let invalid = null;
      inputs.forEach(input => {
        input.removeAttribute('aria-invalid');
        if (!input.value.trim()) return;                       // empty = finished without a time
        const seconds = timeToSeconds(input.value);
        if (seconds == null) { input.setAttribute('aria-invalid', 'true'); if (!invalid) invalid = input; }
        else finishTimes[input.dataset.registrationId] = seconds;
      });
      if (invalid) {
        $('raceBulkFinishError').textContent = 'Use HH:MM:SS between 00:00:01 and 48:00:00, or leave the time empty.';
        $('raceBulkFinishError').hidden = false;
        invalid.focus();
        return;
      }
      const ids = inputs.map(input => input.dataset.registrationId);
      $('raceBulkFinishDialog').close();
      applyBulkStatus('finished', ids, finishTimes);
    });
    $('raceRunnerSearch').addEventListener('input', renderResults);
    $('raceRunnerFilter').addEventListener('change', renderResults);
    $('raceRunnerSort').addEventListener('change', renderResults);
    $('raceClearRunnerFilters').addEventListener('click', () => {
      $('raceRunnerSearch').value = '';
      $('raceRunnerFilter').value = 'all';
      $('raceRunnerSort').value = 'position';
      renderResults();
      $('raceRunnerSearch').focus();
    });
    $('raceNextPendingRunner').addEventListener('click', () => {
      const { all } = getRosterRows();
      const next = all.find(item => !item.result);
      if (!next) return drawMessage('All eligible runners already have a result record. Use the status filter to review or correct an existing result.');
      beginResultEdit(next.runner.id, null, 'registered');
      drawMessage(`Ready to enter a result for ${next.runner.name} (${next.runner.reg_no}).`);
    });
    // ---- live positions: list, picker, quick moves, tools
    const rowId = el => { const li = el.closest('[data-registration-id]'); return li ? li.dataset.registrationId : ''; };
    $('lpList').addEventListener('click', e => {
      const id = rowId(e.target);
      if (!id) return;
      if (e.target.closest('[data-pos-btn]')) return openPositionSheet(id);
      const up = e.target.closest('[data-lp-up]'), down = e.target.closest('[data-lp-down]');
      if (up || down) { const row = results.find(r => r.registration_id === id); if (row && row.current_position != null) moveRunner(id, row.current_position + (up ? -1 : 1)); }
    });
    $('lpList').addEventListener('change', e => {
      const select = e.target.closest('[data-lp-act]'); if (!select) return;
      const registrationId = rowId(select), value = select.value; select.value = '';
      if (registrationId && value) handleRosterAction({ dataset: { registrationId }, value: value });
    });
    $('raceAdminResultsBody').addEventListener('click', e => {
      const btn = e.target.closest('[data-pos-btn]'); if (btn) openPositionSheet(btn.dataset.registrationId);
    });
    $('lpSearch').addEventListener('input', renderLive);
    $('lpAddMissing').addEventListener('click', addMissingRunners);
    $('lpRankByTime').addEventListener('click', rankFinishedByTime);
    $('lpFinishAll').addEventListener('click', finishAllRunning);
    const sheet = $('posSheet');
    sheet.addEventListener('click', e => {
      if (e.target.closest('[data-pos-close]')) return closePositionSheet();
      const btn = e.target.closest('[data-pos]');
      if (btn && sheetState) { const id = sheetState.registrationId, pos = Number(btn.dataset.pos); closePositionSheet(); moveRunner(id, pos); }
    });
    document.addEventListener('keydown', e => {
      if (sheet.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); return closePositionSheet(); }
      const grid = $('posGrid'), items = [...grid.querySelectorAll('.pos-n')], i = items.indexOf(document.activeElement);
      if (i < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : e.key === 'ArrowDown' ? cols : 0;
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.min(items.length - 1, Math.max(0, i + step));
      e.preventDefault(); items[next].focus();
    });
    $('raceCurrentPosition').addEventListener('input', () => { if (!['running', 'finished'].includes($('raceResultStatus').value)) $('raceCurrentPosition').value = ''; });
  }
  async function init(username, userPermissions = {}) {
    if (!username || !userPermissions || userPermissions.can_results !== true) return dispose();
    if (activeUser === username && channel) { permissions = userPermissions; applyFinalizationUI(); return; }
    dispose(); activeUser = username; permissions = userPermissions;
    // dispose() also hides the app for sign-out/permission-loss flows; restore it only
    // after init has received the authenticated Results permission from the route guard.
    const authorisedApp = $('app'); if (authorisedApp) authorisedApp.hidden = false;
    wire(); resetForm(); drawMessage('Connecting to race controls…');
    try {
      await Promise.all([loadRegistrations(), loadControl(), loadResults()]);
      drawMessage('Race controls are ready. All changes are verified again by the database.');
      applyFinalizationUI();
    } catch (error) { drawMessage(error && error.message ? error.message : 'Could not load race data. Run the results SQL migration first.', true); }
    try {
      // One admin action can change many rows; every handler below is debounced into a single reload.
      channel = sb.channel('kmr-admin-race-results')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marathon_results' }, () => reloadSoon(450))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marathon_race_control' }, () => loadControl().catch(e => drawMessage(e.message || 'Could not refresh race status.', true)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
          clearTimeout(rosterReloadTimer);
          rosterReloadTimer = setTimeout(async () => { try { await loadRegistrations(); reloadSoon(0); } catch (e) { drawMessage(e.message || 'Could not refresh the runner roster.', true); } }, 800);
        })
        .subscribe();
    } catch (_) { channel = null; }
    if (!rosterPollTimer) rosterPollTimer = window.setInterval(() => {
      if (!activeUser || document.hidden) return;
      loadRegistrations().catch(error => drawMessage(error && error.message || 'Could not refresh the public runner roster.', true));
    }, 30000);
  }
  function dispose() {
    const previous = channel; channel = null; activeUser = ''; permissions = {}; selectedRunnerIds.clear(); syncBulkSelectionUI();
    if (rosterPollTimer) { window.clearInterval(rosterPollTimer); rosterPollTimer = null; }
    clearTimeout(reloadTimer); clearTimeout(rosterReloadTimer); closePositionSheet(); lpRows.clear();
    const app = $('app'); if (app) app.hidden = true;
    if (previous) sb.removeChannel(previous);
  }
  window.KMRRaceAdmin = { init, dispose, _test: { applyMoveLocal, moveRunner, openPositionSheet, get results() { return results; } } };
})();
