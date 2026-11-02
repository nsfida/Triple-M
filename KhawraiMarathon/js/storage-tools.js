/* Photo storage & compression (owner-only: nsfida).
   - Shows how much storage photos, documents and old full-size originals use.
   - Re-compresses existing oversized photos / CNIC images in the browser and replaces them in place.
   - Deletes the old full-size "originals" and clears their record paths.
   Every step is also enforced by the database: only nsfida can list storage or clear the paths. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const MB = 1024 * 1024;
  // Files at or below these sizes are already compact and are left alone (prevents repeated re-compression).
  const PHOTO_MIN_BYTES = 300 * 1024;
  const DOC_MIN_BYTES = 600 * 1024;
  const MIN_SAVING = 0.85;            // only replace a file when the new one is at least 15% smaller
  const SCRIPT_SRC = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
  let wired = false, owner = false, running = false, stopRequested = false;

  (function loadCss() {
    if (!SCRIPT_SRC || document.getElementById('kmrStorageToolsCss')) return;
    const link = document.createElement('link');
    link.id = 'kmrStorageToolsCss'; link.rel = 'stylesheet';
    link.href = new URL('../assets/storage-tools.css?v=20261031-1', SCRIPT_SRC).href;
    document.head.appendChild(link);
  })();

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = bytes => {
    const n = Number(bytes) || 0;
    return n >= MB ? (n / MB).toFixed(n >= 100 * MB ? 0 : 1) + ' MB' : Math.max(0, Math.round(n / 1024)) + ' KB';
  };
  const note = (message, bad) => { if (typeof toast === 'function') toast(message, !!bad); };
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) throw error;
    return data;
  }
  async function listObjects(bucket, minBytes) {
    const all = []; let after = '';
    for (;;) {
      const page = await rpc('admin_list_storage_objects', { p_bucket: bucket, p_min_bytes: minBytes, p_after: after, p_limit: 500 });
      if (!Array.isArray(page) || !page.length) break;
      all.push(...page);
      if (page.length < 500) break;
      after = page[page.length - 1].name;
    }
    return all;
  }

  const BUCKETS = [
    { id: 'photos', label: 'Player photos', hint: 'Shown on the site and in PDFs' },
    { id: 'documents', label: 'CNIC & documents', hint: 'CNIC front/back, certificates, signatures' },
    { id: 'originals', label: 'Old full-size originals', hint: 'Untouched uploads kept by earlier versions' }
  ];

  function ensureDialog() {
    let dialog = $('kmrStorageDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'kmrStorageDialog';
    dialog.className = 'storage-dialog';
    dialog.setAttribute('aria-labelledby', 'storageTitle');
    dialog.innerHTML = `
      <div class="storage-shell">
        <header class="storage-head">
          <div><span class="storage-kicker">OWNER CONTROLS · NSFIDA ONLY</span><h2 id="storageTitle">Photo storage &amp; compression</h2>
          <p>Shrink photos that were saved at full size and delete the old untouched originals to free database storage.</p></div>
          <button type="button" class="storage-close" id="storageClose" aria-label="Close">Close</button>
        </header>
        <section class="storage-card">
          <div class="storage-card-title"><h3>Storage in use</h3><button type="button" class="btn ghost sm" id="storageRefresh">Refresh</button></div>
          <div class="storage-usage" id="storageUsage"><p class="msg">Loading…</p></div>
        </section>
        <section class="storage-card">
          <h3>Clean up</h3>
          <label class="storage-opt"><input type="checkbox" id="optPhotos" checked><span><b>Compress player photos</b><small>Photos above 300 KB are resized to at most 1000 px and re-saved as good-quality JPEG (about 0.86 quality). They look the same on the site and in PDFs.</small></span></label>
          <label class="storage-opt"><input type="checkbox" id="optDocs" checked><span><b>Compress CNIC &amp; documents</b><small>Images above 600 KB are resized to at most 1600 px at good JPEG quality. CNIC text stays readable. Signatures are never touched.</small></span></label>
          <label class="storage-opt danger"><input type="checkbox" id="optOriginals" checked><span><b>Delete the old full-size originals</b><small>Permanently deletes the untouched original uploads. The compressed copies stay and every page keeps working. This cannot be undone. Originals that have no compressed copy are kept.</small></span></label>
          <div class="storage-actions"><button type="button" class="btn" id="storageStart">Start clean-up</button><button type="button" class="btn ghost" id="storageStop" hidden>Stop after current file</button></div>
          <div class="storage-progress" id="storageProgress" hidden><div class="storage-bar"><i id="storageBar"></i></div><p id="storageStatus" class="storage-status"></p></div>
          <ul class="storage-log" id="storageLog" hidden></ul>
          <p class="storage-summary" id="storageSummary" hidden></p>
        </section>
        <p class="storage-foot">Keep this window open while it runs. You can stop at any time and run it again later; finished files are skipped. Compressing happens in your browser, so a big library can take a while.</p>
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', event => { if (running) { event.preventDefault(); note('Stop the clean-up first, then close this window.', true); } });
    $('storageClose').onclick = () => { if (running) return note('Stop the clean-up first, then close this window.', true); dialog.close(); };
    $('storageRefresh').onclick = () => loadUsage();
    $('storageStart').onclick = startCleanup;
    $('storageStop').onclick = () => { stopRequested = true; $('storageStop').disabled = true; setStatus('Stopping after the current file…'); };
    return dialog;
  }

  async function loadUsage() {
    const box = $('storageUsage');
    box.innerHTML = '<p class="msg">Loading…</p>';
    try {
      const report = await rpc('admin_storage_report');
      const map = Object.fromEntries((report || []).map(r => [r.bucket, r]));
      const total = BUCKETS.reduce((sum, b) => sum + Number(map[b.id] && map[b.id].bytes || 0), 0);
      box.innerHTML = BUCKETS.map(b => {
        const r = map[b.id] || { files: 0, bytes: 0 };
        return `<div class="storage-row${b.id === 'originals' && r.files ? ' is-big' : ''}"><div><b>${esc(b.label)}</b><small>${esc(b.hint)}</small></div><div class="storage-num"><b>${esc(fmt(r.bytes))}</b><small>${Number(r.files)} file${Number(r.files) === 1 ? '' : 's'}</small></div></div>`;
      }).join('') + `<div class="storage-row total"><div><b>Total image storage</b></div><div class="storage-num"><b>${esc(fmt(total))}</b></div></div>`;
    } catch (error) {
      box.innerHTML = `<p class="msg bad">Could not read storage usage. ${esc(error && error.message || '')} Make sure migration 20261031_012_photo_storage_tools.sql has been run.</p>`;
    }
  }

  function setStatus(text) { const el = $('storageStatus'); if (el) el.textContent = text; }
  function setBar(done, total) { const el = $('storageBar'); if (el) el.style.width = (total ? Math.min(100, Math.round(done / total * 100)) : 0) + '%'; }
  function log(text, kind) {
    const list = $('storageLog'); list.hidden = false;
    const li = document.createElement('li'); if (kind) li.className = kind; li.textContent = text;
    list.appendChild(li);
    while (list.children.length > 60) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  }

  async function compressOne(bucket, item, profile) {
    const { data: blob, error: downloadError } = await sb.storage.from(bucket).download(item.name);
    if (downloadError || !blob) throw new Error('could not download');
    const file = new File([blob], item.name.split('/').pop() || 'image.jpg', { type: blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg' });
    const optimized = await window.KMRImageOptimizer.optimize(file, profile);
    if (!optimized || optimized.size > item.size * MIN_SAVING) return { skipped: true, before: item.size, after: item.size };
    const { error: updateError } = await sb.storage.from(bucket).update(item.name, optimized, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
    if (updateError) throw new Error(updateError.message || 'could not replace the file');
    return { skipped: false, before: item.size, after: optimized.size };
  }

  async function compressBucket(bucket, profile, minBytes, label, stats) {
    setStatus(`Looking for large ${label}…`);
    let items = await listObjects(bucket, minBytes);
    if (bucket === 'documents') items = items.filter(i => /\.jpe?g$/i.test(i.name) && !/signature/i.test(i.name));
    if (!items.length) { log(`No large ${label} found.`); return; }
    log(`${items.length} ${label} to check.`);
    let index = 0, finished = 0;
    const worker = async () => {
      while (!stopRequested) {
        const i = index++; if (i >= items.length) return;
        const item = items[i];
        try {
          const result = await compressOne(bucket, item, profile);
          if (result.skipped) stats.skipped++;
          else { stats.compressed++; stats.saved += result.before - result.after; }
        } catch (error) {
          stats.failed++; log(`Skipped ${item.name}: ${error && error.message || 'error'}`, 'bad');
        }
        finished++; setBar(finished, items.length);
        setStatus(`Compressing ${label}: ${finished} of ${items.length} · saved so far ${fmt(stats.saved)}`);
      }
    };
    await Promise.all([worker(), worker()]);
  }

  async function deleteOriginals(stats) {
    setStatus('Looking for old originals…'); setBar(0, 1);
    const [objects, protectedPaths] = await Promise.all([listObjects('originals', 0), rpc('admin_originals_without_copy')]);
    const keep = new Set(Array.isArray(protectedPaths) ? protectedPaths : []);
    const targets = objects.filter(o => !keep.has(o.name));
    if (keep.size) log(`${keep.size} original(s) kept because no compressed copy exists.`);
    if (!targets.length) { log('No old originals to delete.'); await rpc('admin_clear_original_paths'); return; }
    log(`Deleting ${targets.length} old original file(s)…`);
    let done = 0;
    for (let i = 0; i < targets.length && !stopRequested; i += 50) {
      const batch = targets.slice(i, i + 50);
      const { data, error } = await sb.storage.from('originals').remove(batch.map(o => o.name));
      if (error) { stats.failed += batch.length; log('Could not delete a batch: ' + (error.message || 'error'), 'bad'); }
      else {
        const removed = new Set((data || []).map(d => d.name));
        batch.forEach(o => { if (removed.has(o.name)) { stats.deleted++; stats.freed += Number(o.size) || 0; } else stats.failed++; });
      }
      done += batch.length; setBar(done, targets.length);
      setStatus(`Deleting originals: ${Math.min(done, targets.length)} of ${targets.length} · freed ${fmt(stats.freed)}`);
    }
    await rpc('admin_clear_original_paths');
  }

  function ensureOptimizer() {
    if (window.KMRImageOptimizer) return Promise.resolve(true);
    return new Promise(resolve => {
      if (!SCRIPT_SRC) return resolve(false);
      const script = document.createElement('script');
      script.src = new URL('./image-optimization.js?v=20261031-1', SCRIPT_SRC).href;
      script.onload = () => resolve(!!window.KMRImageOptimizer);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function startCleanup() {
    if (running) return;
    const doPhotos = $('optPhotos').checked, doDocs = $('optDocs').checked, doOriginals = $('optOriginals').checked;
    if (!doPhotos && !doDocs && !doOriginals) return note('Tick at least one clean-up option.', true);
    if ((doPhotos || doDocs) && !(await ensureOptimizer())) return note('The image tools could not load. Refresh the page and try again.', true);
    const lines = [];
    if (doPhotos) lines.push('• Compress large player photos');
    if (doDocs) lines.push('• Compress large CNIC / document images');
    if (doOriginals) lines.push('• PERMANENTLY DELETE the old full-size originals');
    if (!confirm(`Start clean-up?\n\n${lines.join('\n')}\n\nCompressed photos replace the current files. Deleted originals cannot be recovered.`)) return;

    running = true; stopRequested = false;
    const stats = { compressed: 0, skipped: 0, failed: 0, saved: 0, deleted: 0, freed: 0 };
    $('storageStart').disabled = true; $('storageStop').hidden = false; $('storageStop').disabled = false;
    ['optPhotos', 'optDocs', 'optOriginals'].forEach(id => $(id).disabled = true);
    $('storageProgress').hidden = false; $('storageSummary').hidden = true; $('storageLog').innerHTML = ''; $('storageLog').hidden = true; setBar(0, 1);
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    try {
      if (doPhotos && !stopRequested) await compressBucket('photos', 'photo', PHOTO_MIN_BYTES, 'player photos', stats);
      if (doDocs && !stopRequested) await compressBucket('documents', 'document', DOC_MIN_BYTES, 'document images', stats);
      if (doOriginals && !stopRequested) await deleteOriginals(stats);
      const parts = [];
      if (doPhotos || doDocs) parts.push(`Compressed ${stats.compressed} file(s), saving ${fmt(stats.saved)}${stats.skipped ? ` (${stats.skipped} already compact)` : ''}.`);
      if (doOriginals) parts.push(`Deleted ${stats.deleted} original file(s), freeing ${fmt(stats.freed)}.`);
      if (stats.failed) parts.push(`${stats.failed} item(s) failed - run it again to retry.`);
      const summary = (stopRequested ? 'Stopped. ' : 'Finished. ') + parts.join(' ');
      $('storageSummary').textContent = summary; $('storageSummary').hidden = false; setStatus(summary);
      if (!stopRequested) setBar(1, 1);
      note(summary, stats.failed > 0);
    } catch (error) {
      const message = error && error.message || 'The clean-up stopped unexpectedly.';
      log(message, 'bad'); setStatus(message); note(message, true);
    } finally {
      window.removeEventListener('beforeunload', warn);
      running = false; stopRequested = false;
      $('storageStart').disabled = false; $('storageStop').hidden = true;
      ['optPhotos', 'optDocs', 'optOriginals'].forEach(id => $(id).disabled = false);
      loadUsage();
    }
  }

  const isOwner = (perms, username) => String(username || '').trim().toLowerCase() === 'nsfida'
    && !!(perms && perms.is_owner === true && perms.can_manage_admins === true);

  function setEntry(allowed) {
    document.querySelectorAll('[data-profile-storage]').forEach(button => {
      button.hidden = !allowed;
      if (!allowed) { const menu = button.closest('.profile-menu'); if (menu) menu.hidden = true; }
    });
  }

  async function openTool() {
    try {
      const username = await KMRAuth.current();
      const perms = KMRAuth.permissions() || await KMRAuth.refreshPermissions();
      owner = isOwner(perms, username);
      setEntry(owner);
      if (!owner) return note('Photo storage tools are available to nsfida only.', true);
      const dialog = ensureDialog();
      if (!dialog.open) dialog.showModal();
      loadUsage();
    } catch (error) { note(error && error.message || 'Could not verify permissions.', true); }
  }

  function wire() {
    document.querySelectorAll('[data-profile-storage]').forEach(button => {
      if (button.dataset.storageBound === 'true') return;
      button.dataset.storageBound = 'true';
      button.addEventListener('click', async () => {
        const menu = button.closest('.profile-menu'); if (menu) menu.hidden = true;
        const trigger = button.closest('.profile-wrap') && button.closest('.profile-wrap').querySelector('.profile-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        await openTool();
      });
    });
  }

  function init(perms, username) {
    owner = isOwner(perms, username);
    setEntry(owner);
    if (owner) wire();
    else { const dialog = $('kmrStorageDialog'); if (dialog && dialog.open && !running) dialog.close(); }
  }

  window.KMRStorageTools = { init, open: openTool };
  KMRAuth.onChange(username => init(KMRAuth.permissions(), username));
  KMRAuth.onPermissionChange(perms => init(perms, KMRAuth.hint()));
  KMRAuth.current().then(username => init(KMRAuth.permissions(), username)).catch(() => init(null, ''));
})();
