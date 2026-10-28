(function () {
  const $ = id => document.getElementById(id);
  let wired = false, activeUser = '', channel = null, registrations = [], results = [], publicResults = [], control = null, busy = false, editingRegistrationId = '';
  const randomOrder = new Map();

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
  function renderControl() {
    if (!control) return;
    $('raceStatusAdmin').value = control.race_status || 'scheduled';
    $('racePublicMessage').value = control.public_message || '';
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
    registrations.filter(r => r.status === 'confirmed' && !r.is_cancelled).forEach(r => { if (!randomOrder.has(r.id)) randomOrder.set(r.id, Math.random()); });
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
      sb.from('marathon_results').select('*').order('updated_at', { ascending: false }),
      sb.from('public_marathon_results').select('result_id,registration_id,place')
    ]);
    if (raw.error) throw raw.error;
    results = raw.data || [];
    publicResults = publicRows.error ? [] : (publicRows.data || []);
    renderResults();
  }
  function renderResults() {
    const resultByRegistration = new Map(results.map(r => [r.registration_id, r]));
    const places = new Map(publicResults.map(r => [r.result_id, r.place]));
    // Each active runner receives a stable random position for this admin-page session;
    // realtime result refreshes update values without resorting the whole roster.
    const roster = registrations
      .filter(r => r.status === 'confirmed' && !r.is_cancelled)
      .sort((a, b) => (randomOrder.get(a.id) ?? 0) - (randomOrder.get(b.id) ?? 0));
    const withResults = roster.filter(r => resultByRegistration.has(r.id)).length;
    $('raceResultCount').textContent = `${roster.length} eligible runners · ${withResults} with result · ${roster.length - withResults} awaiting update`;
    if (!roster.length) {
      $('raceAdminResultsBody').innerHTML = '<tr><td colspan="7" class="race-admin-empty">No confirmed, active runners are available. Confirm a registration first.</td></tr>';
      return;
    }
    $('raceAdminResultsBody').innerHTML = roster.map(runner => {
      const result = resultByRegistration.get(runner.id);
      const place = result ? places.get(result.id) : null;
      const status = result ? result.status : 'registered';
      const bib = result && result.bib_number ? result.bib_number : runner.reg_no;
      const finish = result && result.status === 'finished' ? formatTime(result.finish_time_seconds) : '—';
      const updated = result && result.updated_at ? esc(formatStamp(result.updated_at)) : '<span class="race-admin-not-entered">Not entered</span>';
      return `<tr data-registration-id="${esc(runner.id)}"${result ? ` data-result-id="${esc(result.id)}"` : ''}>
        <td>${place ? `<b class="race-place race-place-${place <= 3 ? place : 0}">${place}</b>` : '—'}</td>
        <td><strong>${esc(bib)}</strong></td>
        <td><strong>${esc(runner.name)}</strong><small>${esc(runner.reg_no)}</small></td>
        <td><span class="race-admin-status ${esc(status)}">${esc(labelStatus(status))}</span></td>
        <td><b class="race-admin-time">${finish}</b></td>
        <td>${updated}</td>
        <td><label class="race-row-action-label"><span class="sr-only">Actions for ${esc(runner.name)}</span><select data-race-action data-registration-id="${esc(runner.id)}" aria-label="Actions for ${esc(runner.name)}">
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
    $('raceBibNumber').value = row && row.bib_number || '';
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
    const current = results.find(r => r.registration_id === registrationId);
    if (status === 'dnf' && !confirm(`Mark ${runner.name} as Did Not Finish (DNF)?`)) return;
    if (status === 'dsq' && !confirm(`Disqualify ${runner.name} from official results?`)) return;
    setBusy(true); drawMessage(`Updating ${runner.name}…`);
    try {
      const { error } = await sb.rpc('admin_upsert_marathon_result', {
        p_registration_id: registrationId,
        p_bib_number: current && current.bib_number || null,
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
  async function saveResult(event) {
    event.preventDefault();
    if (busy) return;
    const registrationId = $('raceResultRunner').value;
    const status = $('raceResultStatus').value;
    const bib = $('raceBibNumber').value.trim();
    let seconds = null;
    if (!registrationId) return drawMessage('Choose a confirmed runner first.', true);
    if (bib.length > 20) return drawMessage('Bib number must be 20 characters or fewer.', true);
    if (status === 'finished') {
      seconds = timeToSeconds($('raceFinishTime').value);
      if (seconds == null) return drawMessage('Enter finish time as HH:MM:SS, between 00:00:01 and 48:00:00.', true);
    }
    setBusy(true); drawMessage('Saving result securely…');
    try {
      const { error } = await sb.rpc('admin_upsert_marathon_result', {
        p_registration_id: registrationId,
        p_bib_number: bib || null,
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
  function wire() {
    if (wired) return; wired = true;
    $('raceControlForm').addEventListener('submit', e => { e.preventDefault(); saveControl(); });
    $('raceResultForm').addEventListener('submit', saveResult);
    $('raceResultStatus').addEventListener('change', updateFinishTimeVisibility);
    $('raceCancelEdit').addEventListener('click', resetForm);
    $('raceStartNow').addEventListener('click', () => { $('raceStatusAdmin').value = 'in_progress'; saveControl('in_progress'); });
    $('raceEndNow').addEventListener('click', () => { $('raceStatusAdmin').value = 'completed'; saveControl('completed'); });
    $('raceResetScheduled').addEventListener('click', () => { $('raceStatusAdmin').value = 'scheduled'; saveControl('scheduled'); });
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
