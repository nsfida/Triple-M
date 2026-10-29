(function () {
  const $ = id => document.getElementById(id);
  let wired = false, activeUser = '', channel = null, registrations = [], results = [], publicResults = [], control = null, busy = false, editingRegistrationId = '';
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
  const setBusy = value => { busy = value; document.querySelectorAll('#paneResultsAdmin button, #paneResultsAdmin select').forEach(b => { if (!b.dataset.keepEnabled) b.disabled = value; }); };
  function resetForm() {
    editingRegistrationId = '';
    $('raceResultForm').reset();
    $('raceFinishTimeWrap').hidden = $('raceResultStatus').value !== 'finished';
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
  function updateFinishTimeVisibility() { $('raceFinishTimeWrap').hidden = $('raceResultStatus').value !== 'finished'; }
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
  }
  async function loadRegistrations() {
    const { data, error } = await sb.from('registrations').select('id,reg_no,name,status,is_cancelled,photo_path').order('created_at', { ascending: true });
    if (error) throw error;
    registrations = data || [];
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
      sb.from('marathon_results').select('id,registration_id,status,finish_time_seconds,updated_at').order('updated_at', { ascending: false }),
      sb.from('public_marathon_results').select('result_id,registration_id,place')
    ]);
    if (raw.error) throw raw.error;
    results = raw.data || [];
    publicResults = publicRows.error ? [] : (publicRows.data || []);
    renderResults();
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
    else if (sort === 'updated') rows.sort((a, b) => {
      const at = a.result && a.result.updated_at ? new Date(a.result.updated_at).getTime() : 0;
      const bt = b.result && b.result.updated_at ? new Date(b.result.updated_at).getTime() : 0;
      return bt - at || registrationCompare(a.runner, b.runner);
    });
    return { all, rows: rows.map(item => ({ ...item, place: item.result ? places.get(item.result.id) : null })) };
  }
  function renderResults() {
    const { all, rows } = getRosterRows();
    const withResults = all.filter(item => item.result).length;
    const counts = { awaiting: all.filter(item => !item.result).length, registered: 0, running: 0, finished: 0, dnf: 0, dsq: 0 };
    all.forEach(({ result }) => { if (result && Object.prototype.hasOwnProperty.call(counts, result.status)) counts[result.status] += 1; });
    $('raceResultCount').textContent = `${all.length} eligible · ${withResults} with a result · ${counts.awaiting} awaiting entry · Showing ${rows.length}`;
    $('raceResultMetrics').innerHTML = [
      ['Awaiting', counts.awaiting, 'awaiting'], ['Not started', counts.registered, 'registered'], ['Running', counts.running, 'running'],
      ['Finished', counts.finished, 'finished'], ['DNF', counts.dnf, 'dnf'], ['Disqualified', counts.dsq, 'dsq']
    ].map(([label, count, key]) => `<span class="race-result-metric race-result-metric-${key}"><strong>${count}</strong><small>${label}</small></span>`).join('');
    if (!rows.length) {
      const message = all.length ? 'No runners match these search and filter settings. Clear filters to see everyone.' : 'No confirmed, active runners are available. Confirm a registration first.';
      $('raceAdminResultsBody').innerHTML = `<tr class="race-admin-empty-row"><td colspan="7" class="race-admin-empty">${message}</td></tr>`;
      return;
    }
    $('raceAdminResultsBody').innerHTML = rows.map(({ runner, result, place }) => {
      const status = result ? result.status : 'registered';
      const finish = result && result.status === 'finished' ? formatTime(result.finish_time_seconds) : '—';
      const updated = result && result.updated_at ? esc(formatStamp(result.updated_at)) : '<span class="race-admin-not-entered">Not entered</span>';
      return `<tr data-registration-id="${esc(runner.id)}"${result ? ` data-result-id="${esc(result.id)}"` : ''}>
        <td data-label="Place">${place ? `<b class="race-place race-place-${place <= 3 ? place : 0}">${place}</b>` : '—'}</td>
        <td data-label="Registration No."><strong class="race-registration-no">${esc(runner.reg_no)}</strong></td>
        <td data-label="Player"><span class="race-admin-runner-name"><strong>${esc(runner.name)}</strong></span></td>
        <td data-label="Status"><span class="race-admin-status ${esc(status)}">${esc(labelStatus(status))}</span></td>
        <td data-label="Finish time"><b class="race-admin-time">${finish}</b></td>
        <td data-label="Last updated">${updated}</td>
        <td data-label="Actions"><label class="race-row-action-label"><span class="sr-only">Actions for ${esc(runner.name)}</span><select data-race-action data-registration-id="${esc(runner.id)}" aria-label="Actions for ${esc(runner.name)}">
          <option value="">Choose action…</option>
          <option value="edit">Edit result details</option>
          <option value="registered">Mark not started</option>
          <option value="running">Mark running</option>
          <option value="finished">Record / edit finish time</option>
          <option value="dnf">Mark DNF</option>
          <option value="dsq">Disqualify runner</option>
          <option value="delete"${result ? '' : ' disabled'}>Remove result record</option>
        </select></label></td>
      </tr>`;
    }).join('');
  }
  function beginResultEdit(registrationId, row, preferredStatus) {
    const runner = registrations.find(r => r.id === registrationId);
    if (!runner) return drawMessage('This runner is not in the current confirmed participant list. Refresh registrations before editing.', true);
    $('raceResultRunner').value = registrationId;
    if (!$('raceResultRunner').value) return drawMessage('Only confirmed, non-cancelled runners can be edited.', true);
    editingRegistrationId = registrationId;
    $('raceResultStatus').value = preferredStatus || row && row.status || 'registered';
    $('raceFinishTime').value = secondsToTime(row && row.finish_time_seconds);
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
      const { error } = await sb.rpc('admin_upsert_marathon_result', {
        p_registration_id: registrationId,
        p_status: status,
        p_finish_time_seconds: null
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
    if (confirm(`Reset the entire race session? This removes ${results.length} saved result record(s), resets the race to Scheduled and clears its timestamps and public announcement. Registrations, payments, funds and expenses will remain.`)) {
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
      drawMessage(`Full reset complete. Race is Scheduled, timestamps and public announcement are cleared, and ${removed} saved result record${removed === 1 ? '' : 's'} ${removed === 1 ? 'was' : 'were'} removed. Registrations, photos, payments, funds and expenses were not changed.`);
    }
    setBusy(false);
  }

  async function saveResult(event) {
    event.preventDefault();
    if (busy) return;
    const registrationId = $('raceResultRunner').value;
    const status = $('raceResultStatus').value;
    let seconds = null;
    if (!registrationId) return drawMessage('Choose a confirmed runner first.', true);
    if (status === 'finished') {
      seconds = timeToSeconds($('raceFinishTime').value);
      if (seconds == null) return drawMessage('Enter finish time as HH:MM:SS, between 00:00:01 and 48:00:00.', true);
    }
    setBusy(true); drawMessage('Saving result securely…');
    try {
      const { error } = await sb.rpc('admin_upsert_marathon_result', {
        p_registration_id: registrationId,
        p_status: status,
        p_finish_time_seconds: seconds
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
  function exportFilteredResultsCsv() {
    const { rows } = getRosterRows();
    if (!rows.length) return drawMessage('There are no visible rows to export. Adjust the filters and try again.', true);
    const cell = value => {
      let text = String(value == null ? '' : value);
      if (/^[\u0000-\u0020]*[=+@\-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const header = ['Registration Number', 'Player Name', 'Result Status', 'Place', 'Finish Time', 'Last Updated'];
    const lines = [header, ...rows.map(({ runner, result, place }) => [
      runner.reg_no || '', runner.name || '', result ? labelStatus(result.status) : 'Awaiting result', place || '',
      result && result.status === 'finished' ? formatTime(result.finish_time_seconds) : '',
      result && result.updated_at ? formatStamp(result.updated_at) : ''
    ])].map(row => row.map(cell).join(','));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'khawrai-marathon-runner-results.csv';
    link.style.display = 'none';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    drawMessage(`Exported ${rows.length} visible runner record${rows.length === 1 ? '' : 's'} to CSV.`);
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
      const select = e.target.closest('[data-race-action]');
      if (select) handleRosterAction(select);
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
    $('raceExportResults').addEventListener('click', exportFilteredResultsCsv);
  }
  async function init(username) {
    if (!username) return dispose();
    if (activeUser === username && channel) return;
    dispose(); activeUser = username; wire(); resetForm(); drawMessage('Connecting to race controls…');
    try {
      await Promise.all([loadRegistrations(), loadControl(), loadResults()]);
      drawMessage('Race controls are ready. All changes are verified again by the database.');
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
  }
  function dispose() {
    const previous = channel; channel = null; activeUser = '';
    if (previous) sb.removeChannel(previous);
  }
  window.KMRRaceAdmin = { init, dispose };
})();
