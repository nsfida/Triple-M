(function () {
  const $ = id => document.getElementById(id);
  let wired = false, activeUser = '', channel = null, rosterPollTimer = null, registrations = [], results = [], publicResults = [], control = null, busy = false, editingRegistrationId = '', permissions = {};
  const selectedRunnerIds = new Set();
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
    document.querySelectorAll('#paneResultsAdmin button, #paneResultsAdmin select, #paneResultsAdmin input, #raceBulkFinishDialog button, #raceBulkFinishDialog input').forEach(node => {
      const lockedResultEdit = finalized && node.matches('#raceResultForm input, #raceResultForm select, #raceResultForm button, [data-race-action], #raceStatusAdmin, #raceStartNow, #raceEndNow, #raceFinalizeResults, #raceFullResetOpen');
      const lockedReset = finalized && node.matches('#raceResetScheduled') && !(permissions && permissions.is_owner === true);
      node.disabled = value || !!lockedResultEdit || !!lockedReset;
    });
    syncBulkSelectionUI();
  };
  function resetForm() {
    editingRegistrationId = '';
    $('raceResultForm').reset();
    $('raceFinishTimeWrap').hidden = $('raceResultStatus').value !== 'finished';
    $('raceCurrentPositionWrap').hidden = $('raceResultStatus').value !== 'running';
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
  function updateFinishTimeVisibility() { $('raceFinishTimeWrap').hidden = $('raceResultStatus').value !== 'finished'; $('raceCurrentPositionWrap').hidden = $('raceResultStatus').value !== 'running'; }
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
    document.querySelectorAll('#raceResultForm input, #raceResultForm select, #raceResultForm button, [data-race-action], #raceSelectVisible, #raceBulkStatus, #raceBulkApply, [data-select-runner]').forEach(node => {
      node.disabled = finalized || busy;
    });
    const clearSelection = $('raceBulkClearSelection');
    if (clearSelection) clearSelection.disabled = busy;
    const statusSelect = $('raceStatusAdmin');
    if (statusSelect) statusSelect.disabled = finalized || busy;
    const resetScheduled = $('raceResetScheduled');
    if (resetScheduled) resetScheduled.disabled = busy || (finalized && !canReopen);
    const fullReset = $('raceFullResetOpen');
    if (fullReset) fullReset.disabled = busy || finalized;
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
    applyFinalizationUI();
  }
  async function loadRegistrations() {
    const { data, error } = await sb.from('public_marathon_runner_roster').select('id,reg_no,name,status,is_cancelled,photo_path').order('reg_no', { ascending: true });
    if (error) throw error;
    registrations = data || [];
    const activeIds = new Set(registrations.filter(r => r.status === 'confirmed' && !r.is_cancelled).map(r => r.id));
    [...selectedRunnerIds].forEach(id => { if (!activeIds.has(id)) selectedRunnerIds.delete(id); });
    fillRunnerChoices();
    renderResults();
  }
  async function loadControl() {
    const { data, error } = await sb.from('marathon_race_control').select('*').eq('id', true).maybeSingle();
    if (error) throw error;
    control = data; renderControl();
  }
  async function loadResults() {
    const [raw, publicRows] = await Promise.all([
      sb.from('marathon_results').select('id,registration_id,status,finish_time_seconds,current_position,updated_at').order('updated_at', { ascending: false }),
      sb.from('public_marathon_results').select('result_id,registration_id,place,current_position,status')
    ]);
    if (raw.error) throw raw.error;
    results = raw.data || [];
    publicResults = publicRows.error ? [] : (publicRows.data || []);
    renderResults();
    applyFinalizationUI();
  }
  function registrationCompare(a, b) {
    return String(a.reg_no || '').localeCompare(String(b.reg_no || ''), undefined, { numeric: true, sensitivity: 'base' }) || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  }
  function getRosterRows() {
    const resultByRegistration = new Map(results.map(r => [r.registration_id, r]));
    const places = new Map(publicResults.map(r => [r.result_id, r.place]));
    const all = registrations
      .filter(r => r.status === 'confirmed' && !r.is_cancelled)
      .map(runner => ({ runner, result: resultByRegistration.get(runner.id) || null }))
      .sort((a, b) => registrationCompare(a.runner, b.runner));
    const search = ($('raceRunnerSearch')?.value || '').trim().toLocaleLowerCase();
    const filter = $('raceRunnerFilter')?.value || 'all';
    const sort = $('raceRunnerSort')?.value || 'reg_no';
    let rows = all.filter(({ runner, result }) => {
      const matchesSearch = !search || `${runner.reg_no || ''} ${runner.name || ''}`.toLocaleLowerCase().includes(search);
      let matchesFilter = filter === 'all';
      if (filter === 'awaiting') matchesFilter = !result;
      else if (['registered', 'running', 'finished', 'dnf', 'dsq'].includes(filter)) matchesFilter = !!result && result.status === filter;
      return matchesSearch && matchesFilter;
    });
    if (sort === 'name') rows.sort((a, b) => String(a.runner.name || '').localeCompare(String(b.runner.name || ''), undefined, { sensitivity: 'base' }) || registrationCompare(a.runner, b.runner));
    else if (sort === 'finish_time') rows.sort((a, b) => {
      const at = a.result && a.result.status === 'finished' && Number.isFinite(Number(a.result.finish_time_seconds)) ? Number(a.result.finish_time_seconds) : Infinity;
      const bt = b.result && b.result.status === 'finished' && Number.isFinite(Number(b.result.finish_time_seconds)) ? Number(b.result.finish_time_seconds) : Infinity;
      return at - bt || registrationCompare(a.runner, b.runner);
    });
    else if (sort === 'position') rows.sort((a, b) => { const ap = a.result && a.result.status === 'running' ? Number(a.result.current_position || Infinity) : Infinity; const bp = b.result && b.result.status === 'running' ? Number(b.result.current_position || Infinity) : Infinity; return ap - bp || registrationCompare(a.runner, b.runner); });
    else if (sort === 'updated') rows.sort((a, b) => {
      const at = a.result && a.result.updated_at ? new Date(a.result.updated_at).getTime() : 0;
      const bt = b.result && b.result.updated_at ? new Date(b.result.updated_at).getTime() : 0;
      return bt - at || registrationCompare(a.runner, b.runner);
    });
    return { all, rows: rows.map(item => ({ ...item, place: item.result && item.result.status === 'finished' ? places.get(item.result.id) : null })) };
  }
  function renderResults() {
    const { all, rows } = getRosterRows();
    if (!rows.length) {
      const message = all.length ? 'No runners match these search and filter settings. Clear filters to see everyone.' : 'No confirmed, active runners are available. Confirm a registration first.';
      $('raceAdminResultsBody').innerHTML = `<tr class="race-admin-empty-row"><td colspan="9" class="race-admin-empty">${message}</td></tr>`;
      syncBulkSelectionUI([]);
      return;
    }
    $('raceAdminResultsBody').innerHTML = rows.map(({ runner, result, place }) => {
      const status = result ? result.status : 'registered';
      const finish = result && result.status === 'finished' ? formatTime(result.finish_time_seconds) : '—';
      const currentPosition = result && result.status === 'running' && result.current_position != null ? String(result.current_position) : '—';
      const updated = result && result.updated_at ? esc(formatStamp(result.updated_at)) : '<span class="race-admin-not-entered">Not entered</span>';
      return `<tr data-registration-id="${esc(runner.id)}"${result ? ` data-result-id="${esc(result.id)}"` : ''}>
        <td data-label="Select" class="race-select-cell"><input type="checkbox" data-select-runner="${esc(runner.id)}" aria-label="Select ${esc(runner.name)}"${selectedRunnerIds.has(runner.id) ? ' checked' : ''}></td>
        <td data-label="Place">${place ? `<b class="race-place race-place-${place <= 3 ? place : 0}">${place}</b>` : '—'}</td>
        <td data-label="Registration No."><strong class="race-registration-no">${esc(runner.reg_no)}</strong></td>
        <td data-label="Player"><span class="race-admin-runner-name"><strong>${esc(runner.name)}</strong></span></td>
        <td data-label="Status"><span class="race-admin-status ${esc(status)}">${esc(labelStatus(status))}</span></td>
        <td data-label="Current position"><b class="race-admin-time">${esc(currentPosition)}</b></td>
        <td data-label="Finish time"><b class="race-admin-time">${finish}</b></td>
        <td data-label="Last updated">${updated}</td>
        <td data-label="Actions"><label class="race-row-action-label"><span class="sr-only">Actions for ${esc(runner.name)}</span><select data-race-action data-registration-id="${esc(runner.id)}" aria-label="Actions for ${esc(runner.name)}">
          <option value="">Choose action…</option>
          <option value="edit">Edit result details</option>
          <option value="registered">Mark not started</option>
          <option value="running">Mark running</option>
          <option value="finished">Record / edit finish time</option>
          <option value="position">Set current position</option>
          <option value="dnf">Mark DNF</option>
          <option value="dsq">Disqualify runner</option>
          <option value="delete"${result ? '' : ' disabled'}>Remove result record</option>
        </select></label></td>
      </tr>`;
    }).join('');
    syncBulkSelectionUI(rows);
  }
  function beginResultEdit(registrationId, row, preferredStatus) {
    const runner = registrations.find(r => r.id === registrationId);
    if (!runner) return drawMessage('This runner is not in the current confirmed participant list. Refresh registrations before editing.', true);
    $('raceResultRunner').value = registrationId;
    if (!$('raceResultRunner').value) return drawMessage('Only confirmed, non-cancelled runners can be edited.', true);
    editingRegistrationId = registrationId;
    $('raceResultStatus').value = preferredStatus || row && row.status || 'registered';
    $('raceFinishTime').value = secondsToTime(row && row.finish_time_seconds);
    $('raceCurrentPosition').value = $('raceResultStatus').value === 'running' && row && row.current_position != null ? String(row.current_position) : '';
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
    if (!['registered', 'running', 'dnf', 'dsq'].includes(status)) return;
    if (status === 'dnf' && !confirm(`Mark ${runner.name} as Did Not Finish (DNF)?`)) return;
    if (status === 'dsq' && !confirm(`Disqualify ${runner.name} from official results?`)) return;
    setBusy(true); drawMessage(`Updating ${runner.name}…`);
    try {
      const existingResult = results.find(row => row.registration_id === registrationId);
      const preservedPosition = status === 'running' && existingResult && existingResult.status === 'running'
        ? existingResult.current_position : null;
      const { error } = await sb.rpc('admin_upsert_marathon_result', {
        p_registration_id: registrationId,
        p_status: status,
        p_finish_time_seconds: null,
        p_current_position: preservedPosition
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
    if (action === 'position') return beginResultEdit(registrationId, result, 'running');
    if (action === 'delete') { if (result) return deleteResult(result.id); return; }
    if (['registered', 'running', 'dnf', 'dsq'].includes(action)) return quickSetStatus(registrationId, action);
  }
  async function saveControl(statusOverride) {
    if (busy) return;
    const status = statusOverride || $('raceStatusAdmin').value;
    if (!['scheduled', 'in_progress', 'completed'].includes(status)) { drawMessage('Choose a valid race state.', true); return; }
    if (statusOverride === 'in_progress' && !confirm('Mark the marathon as STARTED now? The public results page will show Race In Progress.')) return;
    if (statusOverride === 'completed' && !confirm('Mark the marathon as COMPLETED? This will display Race Completed publicly.')) return;
    if (statusOverride === 'scheduled' && control && control.race_status !== 'scheduled' && !confirm('Reset the race state to Scheduled? Start/end timestamps will be cleared.')) return;
    setBusy(true); drawMessage('Saving race control…');
    try {
      const { error } = await sb.rpc('admin_update_race_control', { p_race_status: status, p_public_message: $('racePublicMessage').value.trim() });
      if (error) throw error;
      await loadControl();
      drawMessage('Race state and public announcement saved securely. Live public page will update automatically.');
    } catch (error) { drawMessage(error && error.message ? error.message : 'Could not save race control.', true); }
    finally { setBusy(false); }
  }
  async function resetRaceStatusOnly() {
    if (busy) return;
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
    // Snapshot IDs before the first write; realtime updates may refresh the live array during this loop.
    const resultSnapshot = results.slice();
    setBusy(true);
    drawMessage(`Resetting race state and removing ${resultSnapshot.length} saved result record${resultSnapshot.length === 1 ? '' : 's'}…`);

    // Reset the race state first so a later deletion failure never leaves a test race marked live.
    try {
      const { error } = await sb.rpc('admin_update_race_control', { p_race_status: 'scheduled', p_public_message: '' });
      if (error) throw error;
    } catch (error) {
      setBusy(false);
      drawMessage('Reset stopped before any runner results were deleted. Could not reset the race state: ' + (error && error.message ? error.message : 'Unknown error.'), true);
      return;
    }

    let removed = 0;
    const failed = [];
    const batchSize = 6;
    for (let offset = 0; offset < resultSnapshot.length; offset += batchSize) {
      const batch = resultSnapshot.slice(offset, offset + batchSize);
      const settled = await Promise.all(batch.map(async row => {
        try {
          const { error } = await sb.rpc('admin_delete_marathon_result', { p_result_id: row.id });
          if (error) throw error;
          return { ok: true, id: row.id };
        } catch (error) {
          return { ok: false, id: row.id, message: error && error.message ? error.message : 'Unknown error.' };
        }
      }));
      for (const item of settled) {
        if (item.ok) removed += 1;
        else failed.push(item);
      }
      drawMessage(`Resetting race data… ${Math.min(offset + batch.length, resultSnapshot.length)} of ${resultSnapshot.length} result records checked.`);
    }

    let refreshError = '';
    try { await Promise.all([loadControl(), loadResults()]); }
    catch (error) { refreshError = error && error.message ? error.message : 'Could not refresh the displayed data.'; }

    if (failed.length) {
      drawMessage(`Race status is reset. ${removed} of ${resultSnapshot.length} result records were removed; ${failed.length} could not be removed. Run the full reset again or remove the remaining records individually.`, true);
    } else if (refreshError) {
      drawMessage(`Reset requests completed: race is Scheduled and ${removed} result records were removed, but the display could not refresh. Refresh race data to verify. ${refreshError}`, true);
    } else {
      resetForm();
      drawMessage(`Full reset complete. Race is Scheduled, timestamps and public announcement are cleared, and ${removed} saved result record${removed === 1 ? '' : 's'} ${removed === 1 ? 'was' : 'were'} removed. Registrations, photos and participant records were not changed.`);
    }
    setBusy(false);
  }

  async function saveResult(event) {
    event.preventDefault();
    if (busy) return;
    const registrationId = $('raceResultRunner').value;
    const status = $('raceResultStatus').value;
    let seconds = null, currentPosition = null;
    if (!registrationId) return drawMessage('Choose a confirmed runner first.', true);
    if (status === 'finished') {
      seconds = timeToSeconds($('raceFinishTime').value);
      if (seconds == null) return drawMessage('Enter finish time as HH:MM:SS, between 00:00:01 and 48:00:00.', true);
    }
    if (status === 'running' && $('raceCurrentPosition').value.trim()) {
      currentPosition = Number($('raceCurrentPosition').value);
      if (!Number.isInteger(currentPosition) || currentPosition < 1 || currentPosition > 10000) return drawMessage('Current position must be a whole number from 1 to 10000.', true);
      const collision = results.find(row => row.registration_id !== registrationId && row.status === 'running' && Number(row.current_position) === currentPosition);
      if (collision) { const other = registrations.find(item => item.id === collision.registration_id); return drawMessage(`Position ${currentPosition} is already assigned to ${other ? other.name : 'another runner'}. Clear or change that position first.`, true); }
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
      const value = existing && existing.status === 'finished' ? secondsToTime(existing.finish_time_seconds) : '';
      return `<div class="race-bulk-finish-row"><div class="race-bulk-finish-runner"><strong>${esc(runner.reg_no)} · ${esc(runner.name)}</strong><small>${existing && existing.status === 'finished' ? 'Existing finish time prefilled' : 'Enter this runner’s finish time'}</small></div><label><span class="sr-only">Finish time for ${esc(runner.name)}</span><input data-bulk-finish-time data-registration-id="${esc(id)}" inputmode="numeric" autocomplete="off" pattern="[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]" placeholder="HH:MM:SS" value="${esc(value)}" required></label></div>`;
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
    let succeeded = 0;
    const failures = [];
    try {
      for (const runner of selected) {
        const existing = results.find(row => row.registration_id === runner.id);
        const finishSeconds = status === 'finished' ? finishTimes[runner.id] : null;
        const currentPosition = status === 'running' && existing && existing.status === 'running' && existing.current_position != null
          ? Number(existing.current_position) : null;
        const { error } = await sb.rpc('admin_upsert_marathon_result', {
          p_registration_id: runner.id,
          p_status: status,
          p_finish_time_seconds: finishSeconds,
          p_current_position: currentPosition
        });
        if (error) {
          failures.push({ runner, message: error.message || 'Update failed.' });
        } else {
          succeeded += 1;
          selectedRunnerIds.delete(runner.id);
        }
      }
      await Promise.all([loadResults(), loadControl()]);
      if (failures.length) {
        const failureSummary = failures.slice(0, 3).map(item => `${item.runner.reg_no} ${item.runner.name}: ${item.message}`).join(' · ');
        drawMessage(`${succeeded} runner${succeeded === 1 ? '' : 's'} updated; ${failures.length} failed. Failed runners remain selected so you can retry. ${failureSummary}`, true);
      } else {
        drawMessage(`${succeeded} runner${succeeded === 1 ? '' : 's'} updated to ${labelStatus(status)}. Public standings will refresh automatically.`);
        if ($('raceBulkStatus')) $('raceBulkStatus').value = '';
      }
    } catch (error) {
      drawMessage(error && error.message ? error.message : `Bulk update stopped after ${succeeded} successful change${succeeded === 1 ? '' : 's'}. Some changes may already have been saved.`, true);
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
        const seconds = timeToSeconds(input.value);
        input.removeAttribute('aria-invalid');
        if (seconds == null) { input.setAttribute('aria-invalid', 'true'); if (!invalid) invalid = input; }
        else finishTimes[input.dataset.registrationId] = seconds;
      });
      if (invalid) {
        $('raceBulkFinishError').textContent = 'Enter a valid finish time for every selected runner in HH:MM:SS format (00:00:01 to 48:00:00).';
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
      $('raceRunnerSort').value = 'reg_no';
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
    $('raceCurrentPosition').addEventListener('input', () => { if ($('raceResultStatus').value !== 'running') $('raceCurrentPosition').value = ''; });
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
      channel = sb.channel('kmr-admin-race-results')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marathon_results' }, () => loadResults().catch(e => drawMessage(e.message || 'Could not refresh results.', true)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marathon_race_control' }, () => loadControl().catch(e => drawMessage(e.message || 'Could not refresh race status.', true)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, async () => {
          try { await loadRegistrations(); await loadResults(); }
          catch (e) { drawMessage(e.message || 'Could not refresh the runner roster.', true); }
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
    const app = $('app'); if (app) app.hidden = true;
    if (previous) sb.removeChannel(previous);
  }
  window.KMRRaceAdmin = { init, dispose };
})();
