(function () {
  const $ = id => document.getElementById(id);
  const scheduledFallback = '2026-11-15T16:00:00+05:00';
  let control = null, results = [], channel = null, countdownTimer = null, pollTimer = null, connected = false, loading = false;

  const safeText = (value, fallback = '—') => value == null || value === '' ? fallback : String(value);
  const formatTime = seconds => {
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
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value)); }
    catch (_) { return ''; }
  };
  const ordered = rows => [...rows].sort((a, b) => {
    const aFinished = a.status === 'finished' && Number.isFinite(Number(a.finish_time_seconds));
    const bFinished = b.status === 'finished' && Number.isFinite(Number(b.finish_time_seconds));
    if (aFinished && bFinished) return Number(a.place || 999999) - Number(b.place || 999999) || Number(a.finish_time_seconds) - Number(b.finish_time_seconds);
    if (aFinished !== bFinished) return aFinished ? -1 : 1;
    const order = { running: 1, registered: 2, dnf: 3, dsq: 4 };
    return (order[a.status] || 9) - (order[b.status] || 9) || String(a.runner_name || '').localeCompare(String(b.runner_name || ''));
  });

  function renderControl() {
    const status = control && control.race_status || 'scheduled';
    const badge = $('raceStatusBadge');
    badge.textContent = statusLabel(status);
    badge.className = 'results-status' + (status === 'in_progress' ? ' live' : status === 'completed' ? ' done' : '');
    if (status === 'in_progress') {
      $('raceCountdownWrap').hidden = true;
      const started = control && control.started_at ? `Race started at ${dateTime(control.started_at)}.` : 'The organisers have marked the race as in progress.';
      $('raceLiveNote').textContent = safeText(control && control.public_message, started);
    } else if (status === 'completed') {
      $('raceCountdownWrap').hidden = true;
      const ended = control && control.ended_at ? `Race completed at ${dateTime(control.ended_at)}.` : 'The organisers have marked the race as completed.';
      $('raceLiveNote').textContent = safeText(control && control.public_message, ended);
    } else {
      $('raceCountdownWrap').hidden = false;
      $('raceLiveNote').textContent = safeText(control && control.public_message, 'The race is scheduled for 15 November 2026 at 04:00 PM Pakistan Time. The official start will be announced by organisers.');
      updateCountdown();
    }
  }

  function updateCountdown() {
    const status = control && control.race_status || 'scheduled';
    if (status !== 'scheduled') return;
    const target = new Date(control && control.scheduled_at || scheduledFallback).getTime();
    const remaining = Math.max(0, target - Date.now());
    const values = [Math.floor(remaining / 86400000), Math.floor((remaining % 86400000) / 3600000), Math.floor((remaining % 3600000) / 60000), Math.floor((remaining % 60000) / 1000)];
    $('raceCountdown').innerHTML = values.map((n, i) => `<div class="time-cell"><strong>${String(n).padStart(2, '0')}</strong><small>${['Days','Hours','Minutes','Seconds'][i]}</small></div>`).join('');
    if (remaining === 0) $('raceLiveNote').textContent = safeText(control && control.public_message, 'The scheduled start time has arrived. Awaiting the organisers’ official race-start update.');
  }

  function podiumCard(row, place) {
    const cls = place === 1 ? 'p1' : place === 2 ? 'p2' : 'p3';
    const medal = place === 1 ? '★' : place === 2 ? '◆' : '●';
    const prize = place === 1 ? 'Rs. 15,000 + Winning Trophy' : place === 2 ? 'Rs. 10,000 + Trophy' : 'Rs. 5,000 + Trophy';
    const person = row ? `<img class="podium-photo" src="${esc(photoUrl(row.photo_path) || '../assets/logo-left.png')}" alt="" loading="lazy"><h3>${esc(row.runner_name)}</h3><span class="podium-bib">BIB ${esc(row.bib_number)}</span><strong class="podium-time">${formatTime(row.finish_time_seconds)}</strong>` : `<div class="podium-number">${place}</div><h3>Awaiting result</h3><span class="podium-bib">${['','1ST PLACE','2ND PLACE','3RD PLACE'][place]}</span><strong class="podium-time">—</strong>`;
    return `<article class="podium-card ${cls}"><span class="podium-crown" aria-hidden="true">${medal}</span><span class="podium-number">${place}</span>${person}<span class="podium-prize">${prize}</span></article>`;
  }

  function drawPodium(sorted) {
    const winners = sorted.filter(r => r.status === 'finished' && r.place != null && Number(r.place) >= 1 && Number(r.place) <= 3).sort((a, b) => Number(a.place) - Number(b.place));
    $('podiumSection').hidden = winners.length === 0;
    if (!winners.length) return;
    const byPlace = new Map(winners.map(r => [Number(r.place), r]));
    $('podiumGrid').innerHTML = [2, 1, 3].map(place => podiumCard(byPlace.get(place), place)).join('');
  }

  function drawResults() {
    const sorted = ordered(results);
    drawPodium(sorted);
    const finished = sorted.filter(r => r.status === 'finished' && r.finish_time_seconds != null).length;
    const running = sorted.filter(r => r.status === 'running').length;
    $('leaderboardSummary').textContent = `${sorted.length} runner result${sorted.length === 1 ? '' : 's'} · ${finished} finished · ${running} running`;
    if (!sorted.length) {
      $('resultsTableBody').innerHTML = '<tr><td colspan="5" class="results-empty">Official results have not been published yet. Please check back during the race.</td></tr>';
      return;
    }
    $('resultsTableBody').innerHTML = sorted.map(r => {
      const p = Number(r.place || 0), medal = p >= 1 && p <= 3 ? ` p${p}` : '';
      const timeText = r.status === 'finished' ? formatTime(r.finish_time_seconds) : r.status === 'running' ? 'In progress' : '—';
      return `<tr><td class="place-cell"><span class="place-badge${medal}">${p > 0 ? p : '—'}</span></td><td class="runner-col"><div class="runner-cell"><img src="${esc(photoUrl(r.photo_path) || '../assets/logo-left.png')}" alt="" loading="lazy"><div><strong>${esc(r.runner_name)}</strong><small>${esc(r.bib_number)} · ${esc(r.reg_no)}</small></div></div></td><td class="status-col"><span class="result-status-pill ${esc(r.status)}">${esc(statusLabel(r.status))}</span></td><td class="time-col result-time">${timeText}</td><td class="updated-col">${timeOnly(r.updated_at)}</td></tr>`;
    }).join('');
  }

  function setConnection(ok) {
    connected = !!ok;
    const node = $('liveConnection');
    node.textContent = connected ? 'Live updates connected' : 'Reconnecting…';
    node.classList.toggle('offline', !connected);
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    try {
      const [controlRes, resultsRes] = await Promise.all([
        sb.from('marathon_race_control').select('*').eq('id', true).maybeSingle(),
        sb.from('public_marathon_results').select('*')
      ]);
      if (controlRes.error) throw controlRes.error;
      if (resultsRes.error) throw resultsRes.error;
      control = controlRes.data || { race_status: 'scheduled', scheduled_at: scheduledFallback, public_message: '' };
      results = Array.isArray(resultsRes.data) ? resultsRes.data : [];
      renderControl(); drawResults();
      $('podiumLiveState').textContent = control.race_status === 'in_progress' ? 'Live standings' : control.race_status === 'completed' ? 'Final standings' : 'Standings update live';
      // Connection state is driven by the Realtime subscription; data polling is a fallback.
    } catch (error) {
      console.warn('Could not load live results:', error && error.message || error);
      $('raceLiveNote').textContent = 'Could not connect to official race updates. The page will retry automatically.';
      if (!results.length) $('resultsTableBody').innerHTML = '<tr><td colspan="5" class="results-empty">Live results are temporarily unavailable. Reconnecting automatically…</td></tr>';
    } finally { loading = false; }
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

  async function logoDataUrl() {
    try {
      const response = await fetch('../assets/logo-left.png', { cache: 'force-cache' });
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise(resolve => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(null); fr.readAsDataURL(blob); });
    } catch (_) { return null; }
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
      const logo = await logoDataUrl();
      if (logo) { try { doc.addImage(logo, 'PNG', margin, 27, 43, 43, 'kmr-logo', 'FAST'); } catch (_) {} }
      doc.setTextColor(18, 54, 45); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('KHAWRAI MARATHON RACE', logo ? margin + 54 : margin, 43);
      doc.setFontSize(11); doc.text('SEASON THREE · OFFICIAL RESULTS', logo ? margin + 54 : margin, 60);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(94, 108, 104); doc.setFontSize(8.5);
      doc.text('Race date: 15 November 2026 · 04:00 PM Pakistan Time', margin, 89);
      doc.text('Race status: ' + statusLabel(control && control.race_status), margin, 103);
      if (control && control.started_at) doc.text('Started: ' + dateTime(control.started_at), margin, 117);
      if (control && control.ended_at) doc.text('Ended: ' + dateTime(control.ended_at), margin + 230, 117);
      doc.setDrawColor(211, 224, 217); doc.line(margin, 129, pageW - margin, 129);
      doc.setTextColor(35, 54, 47); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text('PODIUM PRIZES', margin, 148);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(93, 103, 100);
      doc.text('1st: Rs. 15,000 + Winning Trophy', margin, 164); doc.text('2nd: Rs. 10,000 + Trophy', margin + 190, 164); doc.text('3rd: Rs. 5,000 + Trophy', margin + 355, 164);
      let y = 196;
      const cols = [margin, margin + 48, margin + 105, margin + 330, margin + 420];
      const drawHeader = () => {
        doc.setFillColor(19, 65, 52); doc.roundedRect(margin, y - 13, pageW - margin * 2, 24, 4, 4, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.text('PLACE', cols[0] + 7, y + 2); doc.text('BIB', cols[1] + 3, y + 2); doc.text('RUNNER', cols[2] + 3, y + 2); doc.text('STATUS', cols[3] + 3, y + 2); doc.text('TIME', cols[4] + 3, y + 2); y += 22;
      };
      drawHeader();
      const sorted = ordered(results);
      if (!sorted.length) {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 110, 108); doc.setFontSize(10); doc.text('Official results have not been published yet.', margin, y + 20); y += 42;
      }
      sorted.forEach((r, i) => {
        if (y > pageH - 48) { doc.setFontSize(8); doc.setTextColor(120, 130, 126); doc.text(`Khawrai Marathon Season Three · Page ${doc.internal.getNumberOfPages()}`, margin, pageH - 20); doc.addPage(); y = 46; drawHeader(); }
        if (Number(r.place) === 1) { doc.setFillColor(255, 244, 200); doc.rect(margin, y - 11, pageW - margin * 2, 25, 'F'); }
        else if (Number(r.place) === 2) { doc.setFillColor(235, 241, 245); doc.rect(margin, y - 11, pageW - margin * 2, 25, 'F'); }
        else if (Number(r.place) === 3) { doc.setFillColor(250, 230, 214); doc.rect(margin, y - 11, pageW - margin * 2, 25, 'F'); }
        else if (i % 2 === 0) { doc.setFillColor(247, 250, 248); doc.rect(margin, y - 11, pageW - margin * 2, 25, 'F'); }
        doc.setTextColor(32, 49, 43); doc.setFont('helvetica', r.place && r.place <= 3 ? 'bold' : 'normal'); doc.setFontSize(8.2);
        doc.text(r.place ? String(r.place) : '—', cols[0] + 7, y + 4);
        doc.text(String(r.bib_number || '—').slice(0, 13), cols[1] + 3, y + 4);
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

  $('downloadResultsPdf').addEventListener('click', downloadPdf);
  window.addEventListener('online', () => { loadData(); setConnection(connected); });
  window.addEventListener('offline', () => setConnection(false));
  loadData();
  countdownTimer = window.setInterval(updateCountdown, 1000);
  pollTimer = window.setInterval(loadData, 15000); // fallback if Realtime is blocked by a network or browser
  try {
    channel = sb.channel('kmr-public-results-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marathon_results' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marathon_race_control' }, () => loadData())
      .subscribe(status => setConnection(status === 'SUBSCRIBED'));
  } catch (_) { setConnection(false); }
  window.addEventListener('beforeunload', () => {
    if (countdownTimer) clearInterval(countdownTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (channel) sb.removeChannel(channel);
  });
})();
