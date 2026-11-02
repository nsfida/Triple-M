/* Backup & restore (owner-only: nsfida).
   BACKUP  -> one ZIP (or several parts for very large lists) containing
              data/players.json                       every registration record
              photos/<REG>_<Name>.jpg                 player photos, named by player
              players/<REG>_<Name>/                   one folder per player: registration_form.pdf, photo, CNIC, documents, signature
   RESTORE -> upload the same ZIP. Only MISSING data is added:
              - a player that already exists (same id, or same CNIC) is never changed,
              - a file that already exists at the same path is never replaced,
              - a player that is new (including one an admin added by hand, with no id) is created with its files and paths.
   The database enforces the owner-only rule and the "never replace" rule (admin_restore_registration). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const SCRIPT_SRC = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
  const FORMAT = 'khawrai-marathon-backup';
  const PART_MAX_PLAYERS = 120, PART_MAX_BYTES = 220 * 1024 * 1024;
  let owner = false, busy = false, stopRequested = false, checked = null;

  const ROLES = [
    { role: 'photo', bucket: 'photos', col: 'photo_path', stems: ['photo'], def: 'photo', required: true, profile: 'photo' },
    { role: 'cnic_front', bucket: 'documents', col: 'cnic_front_path', stems: ['cnic_front', 'cnic-front', 'cnicfront', 'front'], def: 'cnic_front', required: true, profile: 'document' },
    { role: 'cnic_back', bucket: 'documents', col: 'cnic_back_path', stems: ['cnic_back', 'cnic-back', 'cnicback', 'back'], def: 'cnic_back', required: true, profile: 'document' },
    { role: 'certificate', bucket: 'documents', col: 'certificate_path', stems: ['certificate', 'cert'], def: 'certificate', profile: 'document' },
    { role: 'other_doc', bucket: 'documents', col: 'other_doc_path', stems: ['other_doc', 'other', 'otherdoc'], def: 'other', profile: 'document' },
    { role: 'signature', bucket: 'documents', col: 'signature_path', stems: ['signature', 'sign'], def: 'signature', png: true }
  ];
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  // ---------- helpers ----------
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MB = 1048576;
  const fmt = n => { n = Number(n) || 0; return n >= MB ? (n / MB).toFixed(n >= 100 * MB ? 0 : 1) + ' MB' : Math.max(0, Math.round(n / 1024)) + ' KB'; };
  const note = (m, bad) => { if (typeof toast === 'function') toast(m, !!bad); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const extOf = name => { const m = /\.([A-Za-z0-9]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  const stemOf = name => String(name || '').replace(/\.[A-Za-z0-9]+$/, '');
  const slug = text => (String(text || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)) || 'player';
  const norm = text => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const newUuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
  async function rpc(name, args) { const { data, error } = await sb.rpc(name, args || {}); if (error) throw error; return data; }

  (function loadCss() {
    if (!SCRIPT_SRC) return;
    [['kmrStorageToolsCss', '../assets/storage-tools.css?v=20261031-1'], ['kmrBackupToolsCss', '../assets/backup-tools.css?v=20261101-1']].forEach(([id, href]) => {
      if (document.getElementById(id)) return;
      const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet';
      link.href = new URL(href, SCRIPT_SRC).href; document.head.appendChild(link);
    });
  })();

  function loadScriptAny(urls, test) {
    if (test()) return Promise.resolve(true);
    return urls.reduce((chain, url) => chain.then(ok => ok || new Promise(resolve => {
      const s = document.createElement('script'); s.src = url; s.async = true;
      s.onload = () => resolve(test()); s.onerror = () => resolve(false); document.head.appendChild(s);
    })), Promise.resolve(false));
  }
  const ensureJSZip = () => loadScriptAny(['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'], () => !!window.JSZip);
  const ensureJsPdf = () => loadScriptAny(['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'], () => !!(window.jspdf && window.jspdf.jsPDF));
  const ensureLocal = (file, test) => loadScriptAny(SCRIPT_SRC ? [new URL('./' + file + '?v=20261101-1', SCRIPT_SRC).href] : [], test);

  // ---------- dialog ----------
  function ensureDialog() {
    let dialog = $('kmrBackupDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'kmrBackupDialog'; dialog.className = 'storage-dialog backup-dialog';
    dialog.setAttribute('aria-labelledby', 'backupTitle');
    dialog.innerHTML = `
      <div class="storage-shell">
        <header class="storage-head">
          <div><span class="storage-kicker">OWNER CONTROLS · NSFIDA ONLY</span><h2 id="backupTitle">Backup &amp; restore</h2>
          <p>Download a full backup of all players, or restore missing data from a backup you saved earlier.</p></div>
          <button type="button" class="storage-close" id="backupClose" aria-label="Close">Close</button>
        </header>

        <section class="storage-card">
          <h3>1 · Download a full backup</h3>
          <p class="backup-text">One ZIP file with every player's data and files:</p>
          <ul class="backup-list">
            <li><b>data/players.json</b> – all registration records</li>
            <li><b>photos/</b> – every player photo, named by registration number and player name</li>
            <li><b>players/&lt;reg no&gt;_&lt;name&gt;/</b> – one folder per player with the registration form PDF, photo, CNIC images, certificates and signature</li>
          </ul>
          <label class="storage-opt"><input type="checkbox" id="bkPdf" checked><span><b>Include each player's registration form (PDF)</b><small>Untick for a faster, smaller backup. The data and files are always included.</small></span></label>
          <div class="storage-actions"><button type="button" class="btn" id="bkStart">Create &amp; download backup</button><button type="button" class="btn ghost" id="bkStop" hidden>Stop</button></div>
          <div class="storage-progress" id="bkProgress" hidden><div class="storage-bar"><i id="bkBar"></i></div><p id="bkStatus" class="storage-status"></p></div>
          <p class="storage-summary" id="bkSummary" hidden></p>
        </section>

        <section class="storage-card">
          <h3>2 · Restore from a backup ZIP</h3>
          <p class="backup-text">Upload a backup ZIP created here (or one where you added new players by hand). <b>Nothing existing is replaced:</b> players already in the database are skipped, and a file is only uploaded when nothing exists at its path yet. New players, including ones added by hand without an id, are created with their files.</p>
          <div class="backup-pick"><input type="file" id="rsFile" accept=".zip,application/zip"><button type="button" class="btn ghost" id="rsCheck">Check backup</button></div>
          <div class="backup-check" id="rsResult" hidden></div>
          <div class="storage-actions"><button type="button" class="btn" id="rsStart" hidden>Restore missing data</button><button type="button" class="btn ghost" id="rsStop" hidden>Stop</button><button type="button" class="btn ghost" id="rsReport" hidden>Download report</button></div>
          <div class="storage-progress" id="rsProgress" hidden><div class="storage-bar"><i id="rsBar"></i></div><p id="rsStatus" class="storage-status"></p></div>
          <ul class="storage-log" id="rsLog" hidden></ul>
          <p class="storage-summary" id="rsSummary" hidden></p>
        </section>

        <p class="storage-foot">Keep this window open while a backup or restore is running. Very large lists are split into several ZIP files automatically; restore them one after another, in any order.</p>
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', e => { if (busy) { e.preventDefault(); note('Stop the running task first, then close this window.', true); } });
    $('backupClose').onclick = () => { if (busy) return note('Stop the running task first, then close this window.', true); dialog.close(); };
    $('bkStart').onclick = startBackup;
    $('bkStop').onclick = () => { stopRequested = true; $('bkStop').disabled = true; setStatus('bk', 'Stopping…'); };
    $('rsCheck').onclick = checkBackup;
    $('rsStart').onclick = startRestore;
    $('rsStop').onclick = () => { stopRequested = true; $('rsStop').disabled = true; setStatus('rs', 'Stopping after the current player…'); };
    $('rsReport').onclick = downloadReport;
    $('rsFile').onchange = () => { checked = null; $('rsResult').hidden = true; $('rsStart').hidden = true; $('rsReport').hidden = true; };
    return dialog;
  }
  const setStatus = (p, t) => { const el = $(p + 'Status'); if (el) el.textContent = t; };
  const setBar = (p, done, total) => { const el = $(p + 'Bar'); if (el) el.style.width = (total ? Math.min(100, Math.round(done / total * 100)) : 0) + '%'; };
  const reportLines = [];
  function log(text, kind) {
    reportLines.push(text);
    const list = $('rsLog'); list.hidden = false;
    const li = document.createElement('li'); if (kind) li.className = kind; li.textContent = text; list.appendChild(li);
    while (list.children.length > 80) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  }
  function lockUi(prefix, locked) {
    busy = locked;
    ['bkStart', 'rsCheck', 'rsFile', 'bkPdf'].forEach(id => { const el = $(id); if (el) el.disabled = locked; });
    if (prefix === 'rs') $('rsStart').disabled = locked;
    $(prefix + 'Stop').hidden = !locked; if (locked) $(prefix + 'Stop').disabled = false;
  }

  // =====================================================================
  // BACKUP
  // =====================================================================
  async function fetchAllRegistrations() {
    const all = []; let from = 0;
    for (;;) {
      const { data, error } = await sb.from('registrations').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    return all;
  }
  const blobToDataUrl = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
  async function shrinkToDataUrl(blob, maxSide, quality) {
    try {
      if (!blob.type.startsWith('image/') || blob.type === 'image/png') return await blobToDataUrl(blob);
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (bitmap.close) bitmap.close();
      return canvas.toDataURL('image/jpeg', quality);
    } catch (_) { return await blobToDataUrl(blob); }
  }
  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  const README = () => `KHAWRAI MARATHON RACE - BACKUP
===============================
Created: ${new Date().toString()}

Contents
  data/players.json                 all registration records (+ where each player's files are)
  photos/<REG>_<Name>.jpg           player photos, named by player
  players/<REG>_<Name>/             one folder per player: registration_form.pdf, photo, cnic_front, cnic_back,
                                    certificate, other, signature

Restore (Admin > profile menu > Backup & restore > "Restore from a backup ZIP")
  * Players that already exist (same id or same CNIC) are never changed.
  * A file is uploaded only if nothing exists at its path yet - existing files are never replaced.
  * New players are created together with their files.

Adding a player by hand before restoring
  1. Add an object to the "players" list in data/players.json. Required: name, father_name, cnic (13 digits),
     mobile (11 digits), gender (Male/Female), dob (YYYY-MM-DD), address, district_tehsil, sport.
     Do NOT add "id", "reg_no" or any "_backup" entry - they are created for you.
     Optional: email, association, player_level, years_experience, education, official_participation, event_name,
     event_date, event_level, event_org, status, signature_name.
  2. Create a folder under players/ (any name) and put the files in it:
     photo.jpg, cnic_front.jpg, cnic_back.jpg (required); certificate.jpg, other.jpg, signature.png (optional).
  3. Link the folder: add  "folder": "players/<your folder name>"  to the player (or name the folder after the CNIC).
  Large images are compressed automatically when they are restored.
`;

  async function startBackup() {
    if (busy) return;
    lockUi('bk', true); stopRequested = false;
    $('bkProgress').hidden = false; $('bkSummary').hidden = true; setBar('bk', 0, 1);
    try {
      setStatus('bk', 'Loading tools…');
      if (!(await ensureJSZip())) throw new Error('The ZIP library could not be loaded. Check your internet connection and try again.');
      const withPdf = $('bkPdf').checked;
      if (withPdf) {
        if (!(await ensureJsPdf())) throw new Error('The PDF library could not be loaded. Untick the PDF option or try again.');
        if (!(await ensureLocal('pdf.js', () => !!(window.KMRPDF && window.KMRPDF.build && window.KMRPDF.build.length >= 3)))) throw new Error('The registration form builder could not be loaded.');
      }
      setStatus('bk', 'Reading registrations…');
      const rows = await fetchAllRegistrations();
      if (!rows.length) throw new Error('There are no registrations to back up yet.');

      const usedFolders = new Set(), warnings = [];
      let zip = new window.JSZip(), partPlayers = [], partBytes = 0, partNo = 0, totalBytes = 0, filesCount = 0;
      const flush = async (last) => {
        partNo++;
        const manifest = { format: FORMAT, version: 1, created_at: new Date().toISOString(), created_by: 'nsfida@khawrai.app',
          part: partNo, players_in_part: partPlayers.length, total_players: rows.length, warnings: warnings.slice(), players: partPlayers };
        zip.file('data/players.json', JSON.stringify(manifest, null, 2), { compression: 'DEFLATE' });
        zip.file('README.txt', README(), { compression: 'DEFLATE' });
        setStatus('bk', `Packing the ZIP file${partNo > 1 || !last ? ` (part ${partNo})` : ''}…`);
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
        const multi = partNo > 1 || !last;
        triggerDownload(blob, `KMR_Backup_${stamp()}${multi ? `_part${partNo}` : ''}.zip`);
        totalBytes += blob.size;
        zip = new window.JSZip(); partPlayers = []; partBytes = 0; warnings.length = 0;
        if (!last) await sleep(900);
      };

      for (let i = 0; i < rows.length && !stopRequested; i++) {
        const row = rows[i];
        setStatus('bk', `Backing up ${i + 1} of ${rows.length}: ${row.name}`); setBar('bk', i, rows.length);
        let base = `${slug(row.reg_no)}_${slug(row.name)}`, folderName = base, n = 2;
        while (usedFolders.has(folderName.toLowerCase())) folderName = `${base}_${n++}`;
        usedFolders.add(folderName.toLowerCase());
        const folder = `players/${folderName}`;
        const files = {}, cache = new Map();
        for (const def of ROLES) {
          const path = row[def.col]; if (!path) continue;
          try {
            const { data: blob, error } = await sb.storage.from(def.bucket).download(path);
            if (error || !blob) throw new Error(error && error.message || 'not found');
            const ext = extOf(path) || (def.png ? 'png' : 'jpg'), fileName = `${def.def}.${ext}`;
            zip.file(`${folder}/${fileName}`, blob, { binary: true, compression: 'STORE' });
            if (def.role === 'photo') zip.file(`photos/${folderName}.${ext}`, blob, { binary: true, compression: 'STORE' });
            files[def.role] = { bucket: def.bucket, path, file: fileName, size: blob.size };
            cache.set(path, { blob, role: def.role });
            partBytes += blob.size * (def.role === 'photo' ? 2 : 1); filesCount++;
          } catch (error) {
            warnings.push(`${row.reg_no} ${row.name}: could not read ${def.role} (${path}): ${error && error.message || error}`);
          }
        }
        let pdfName = null;
        if (withPdf) {
          try {
            const doc = await window.KMRPDF.build([row], null, {
              templateMaxWidth: 1250, templateQuality: 0.78,
              getFile: async (bucket, path) => {
                const hit = path && cache.get(path); if (!hit) return null;
                return hit.role === 'photo' ? shrinkToDataUrl(hit.blob, 700, 0.8) : hit.role === 'signature' ? blobToDataUrl(hit.blob) : shrinkToDataUrl(hit.blob, 1100, 0.72);
              }
            });
            const buffer = doc.output('arraybuffer');
            pdfName = 'registration_form.pdf';
            zip.file(`${folder}/${pdfName}`, buffer, { binary: true, compression: 'STORE' });
            partBytes += buffer.byteLength;
          } catch (error) { warnings.push(`${row.reg_no} ${row.name}: registration form PDF failed (${error && error.message || error})`); }
        }
        partPlayers.push({ ...row, _backup: { folder, flat_photo: files.photo ? `photos/${folderName}.${extOf(files.photo.file)}` : null, pdf: pdfName, files } });
        if ((partPlayers.length >= PART_MAX_PLAYERS || partBytes >= PART_MAX_BYTES) && i < rows.length - 1 && !stopRequested) await flush(false);
      }
      if (partPlayers.length) await flush(true);
      setBar('bk', 1, 1);
      const summary = stopRequested
        ? `Stopped. The backup is incomplete (${partNo} file(s) downloaded). Run it again for a full backup.`
        : `Backup complete: ${rows.length} player(s), ${filesCount} file(s), ${partNo} ZIP file(s), ${fmt(totalBytes)}. Keep it somewhere safe.`;
      $('bkSummary').textContent = summary; $('bkSummary').hidden = false; setStatus('bk', summary); note(summary);
    } catch (error) {
      const message = error && error.message || 'The backup stopped unexpectedly.';
      setStatus('bk', message); note(message, true);
    } finally { lockUi('bk', false); stopRequested = false; }
  }

  // =====================================================================
  // RESTORE
  // =====================================================================
  function indexFolders(zip) {
    const folders = new Map();
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const m = /^(.*)\/([^/]+)$/.exec(path); if (!m) return;
      const [, dir, base] = m;
      if (!folders.has(dir)) folders.set(dir, new Map());
      folders.get(dir).set(stemOf(base).toLowerCase(), entry);
    });
    return folders;
  }
  function findFolder(rec, meta, folders) {
    const explicit = [meta && meta.folder, rec.folder, rec._folder].filter(Boolean).map(f => String(f).replace(/\/+$/, ''));
    for (const f of explicit) if (folders.has(f)) return f;
    const dirs = [...folders.keys()].filter(d => /^players\//i.test(d));
    const cnic = String(rec.cnic || '').replace(/\D/g, '');
    const wanted = [norm(`${rec.reg_no || ''}${rec.name || ''}`), norm(rec.name)].filter(Boolean);
    if (cnic) { const hit = dirs.find(d => norm(d).includes(cnic)); if (hit) return hit; }
    for (const w of wanted) { const hit = dirs.find(d => norm(d.split('/').pop()) === w); if (hit) return hit; }
    return null;
  }
  function planPlayer(rec, folders) {
    const meta = rec && typeof rec._backup === 'object' && rec._backup ? rec._backup : null;
    const manual = !meta;
    const plan = { rec, meta, manual, folder: null, files: {}, id: null, payload: null, error: null };
    const folder = findFolder(rec, meta, folders);
    plan.folder = folder;
    const bag = folder ? folders.get(folder) : null;
    const id = isUuid(rec.id) ? rec.id.toLowerCase() : newUuid();
    plan.id = id;
    const pathOk = p => typeof p === 'string' && new RegExp('^' + id + '/[A-Za-z0-9._-]+$', 'i').test(p);
    const payload = {};
    Object.keys(rec).forEach(k => { if (k[0] !== '_' && k !== 'folder') payload[k] = rec[k]; });
    payload.id = id;
    ['photo_original_path', 'cnic_front_original_path', 'cnic_back_original_path'].forEach(k => { payload[k] = null; });
    if (manual && !payload.entered_by) payload.entered_by = 'nsfida';
    for (const def of ROLES) {
      let entry = null;
      if (bag) {
        const named = meta && meta.files && meta.files[def.role] && meta.files[def.role].file;
        if (named && bag.get(stemOf(named).toLowerCase())) entry = bag.get(stemOf(named).toLowerCase());
        if (!entry) for (const stem of def.stems) { if (bag.has(stem)) { entry = bag.get(stem); break; } }
      }
      if (entry) {
        const ext = extOf(entry.name);
        const keepExact = !manual && pathOk(rec[def.col]);
        const outExt = keepExact ? extOf(rec[def.col]) || ext : (manual ? (def.png ? 'png' : 'jpg') : (ext || 'jpg'));
        payload[def.col] = keepExact ? rec[def.col] : `${id}/${def.def}.${outExt}`;
        plan.files[def.role] = { def, entry, srcExt: ext };
      } else {
        payload[def.col] = null; // no file for this role in the ZIP
      }
    }
    // A signature image is required by the database; create one from the typed name if none was supplied.
    if (!plan.files.signature) payload.signature_path = `${id}/signature.png`;
    plan.generateSignature = !plan.files.signature;
    plan.payload = payload;
    return plan;
  }
  const missingRequired = plan => ROLES.filter(d => d.required && !plan.files[d.role]).map(d => d.role);

  async function checkBackup() {
    if (busy) return;
    const file = $('rsFile').files && $('rsFile').files[0];
    if (!file) return note('Choose a backup ZIP file first.', true);
    lockUi('rs', true); stopRequested = false; checked = null;
    $('rsResult').hidden = true; $('rsStart').hidden = true; $('rsReport').hidden = true; $('rsSummary').hidden = true;
    $('rsLog').innerHTML = ''; $('rsLog').hidden = true; reportLines.length = 0;
    $('rsProgress').hidden = false; setBar('rs', 0, 1);
    try {
      setStatus('rs', 'Loading tools…');
      if (!(await ensureJSZip())) throw new Error('The ZIP library could not be loaded. Check your internet connection and try again.');
      setStatus('rs', 'Reading the ZIP file…');
      const zip = await window.JSZip.loadAsync(file);
      const jsonEntry = zip.file('data/players.json') || zip.file('players.json') || (zip.file(/(^|\/)players\.json$/i)[0]);
      if (!jsonEntry) throw new Error('This ZIP does not contain data/players.json, so it is not a valid backup.');
      let parsed;
      try { parsed = JSON.parse(await jsonEntry.async('string')); } catch (e) { throw new Error('data/players.json is not valid JSON: ' + e.message); }
      const players = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.players) ? parsed.players : null);
      if (!players) throw new Error('data/players.json has no "players" list.');
      if (!Array.isArray(parsed) && parsed.format && parsed.format !== FORMAT) throw new Error('This file is not a Khawrai Marathon backup.');
      const folders = indexFolders(zip);
      const plans = [], tally = { total: players.length, newOk: 0, existsId: 0, existsCnic: 0, invalid: 0 };
      const problems = [];
      for (let i = 0; i < players.length; i++) {
        setStatus('rs', `Checking ${i + 1} of ${players.length}…`); setBar('rs', i, players.length);
        const plan = planPlayer(players[i], folders);
        plan.index = i; plan.label = `${players[i].reg_no || '(new)'} ${players[i].name || '(no name)'}`.trim();
        let res;
        try { res = await rpc('admin_restore_registration', { p: plan.payload, p_dry_run: true }); }
        catch (error) { res = { result: 'invalid', message: error && error.message || 'check failed' }; }
        plan.check = res;
        if (res.result === 'exists') { res.reason === 'id' ? tally.existsId++ : tally.existsCnic++; }
        else if (res.result === 'new') {
          const miss = missingRequired(plan);
          if (miss.length) { plan.check = { result: 'invalid', message: `Missing file(s) in the ZIP: ${miss.join(', ')}` }; tally.invalid++; problems.push(`${plan.label}: ${plan.check.message}`); }
          else tally.newOk++;
        } else { tally.invalid++; problems.push(`${plan.label}: ${res.message || 'invalid'}`); }
        plans.push(plan);
      }
      setBar('rs', 1, 1);
      checked = { zip, plans, tally, fileName: file.name };
      const newNames = plans.filter(p => p.check.result === 'new').slice(0, 8).map(p => p.label);
      $('rsResult').hidden = false;
      $('rsResult').innerHTML = `
        <div class="backup-tally">
          <div><b>${tally.total}</b><small>players in this ZIP</small></div>
          <div class="ok"><b>${tally.newOk}</b><small>new – will be added</small></div>
          <div><b>${tally.existsId + tally.existsCnic}</b><small>already exist – skipped</small></div>
          <div class="${tally.invalid ? 'bad' : ''}"><b>${tally.invalid}</b><small>cannot be restored</small></div>
        </div>
        ${newNames.length ? `<p class="backup-text"><b>Will be added:</b> ${esc(newNames.join(', '))}${tally.newOk > newNames.length ? ` and ${tally.newOk - newNames.length} more` : ''}</p>` : ''}
        ${tally.existsCnic ? `<p class="backup-text">${tally.existsCnic} player(s) were skipped because their CNIC is already registered under a different record.</p>` : ''}
        <p class="backup-text">Existing players are never changed. For players that already exist, only files that are <b>missing</b> in storage are restored; files already in place are never replaced.</p>
        ${problems.length ? `<details class="backup-problems" open><summary>${problems.length} problem(s)</summary><ul>${problems.slice(0, 40).map(t => `<li>${esc(t)}</li>`).join('')}</ul>${problems.length > 40 ? `<p>…and ${problems.length - 40} more.</p>` : ''}</details>` : ''}`;
      problems.forEach(t => reportLines.push('CHECK PROBLEM: ' + t));
      $('rsStart').hidden = !(tally.newOk || tally.existsId); $('rsReport').hidden = !problems.length;
      setStatus('rs', 'Check finished. Review the summary, then restore.');
    } catch (error) {
      const message = error && error.message || 'Could not read this backup.';
      setStatus('rs', message); note(message, true);
    } finally { lockUi('rs', false); }
  }

  async function uploadNoReplace(bucket, path, blob, contentType) {
    const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType, cacheControl: '31536000', upsert: false });
    if (!error) return 'uploaded';
    const text = String(error.message || ''), status = Number(error.statusCode || error.status || 0);
    if (status === 409 || /already exists|duplicate/i.test(text)) return 'exists';
    throw error;
  }
  async function prepareBlob(item, manual) {
    const { def, entry, srcExt } = item;
    const raw = await entry.async('blob');
    const type = MIME[srcExt] || 'image/jpeg';
    if (!manual || def.png) return { blob: new Blob([raw], { type: def.png ? 'image/png' : type }), contentType: def.png ? 'image/png' : type };
    if (!window.KMRImageOptimizer) return { blob: new Blob([raw], { type }), contentType: type };
    const optimized = await window.KMRImageOptimizer.optimize(new File([raw], entry.name.split('/').pop(), { type }), def.profile);
    return { blob: optimized, contentType: 'image/jpeg' };
  }
  function signatureBlob(text) {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 140;
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 600, 140);
      ctx.fillStyle = '#0a1c46'; ctx.font = 'italic 48px "Segoe Script","Brush Script MT",cursive'; ctx.textBaseline = 'middle';
      let size = 48; while (ctx.measureText(text).width > 560 && size > 18) { size -= 3; ctx.font = `italic ${size}px "Segoe Script","Brush Script MT",cursive`; }
      ctx.fillText(text, 20, 70); canvas.toBlob(b => resolve(b), 'image/png');
    });
  }

  async function restoreOne(plan, stats) {
    const { payload, files } = plan;
    const check = plan.check;
    if (check.result === 'exists') {
      // Existing player: never touch the record. Restore only files that are missing at the paths the record already uses.
      if (check.reason !== 'id' || plan.manual) { stats.skippedPlayers++; return log(`Skipped ${plan.label}: already registered (${check.reg_no || ''}).`); }
      let uploaded = 0, present = 0;
      for (const def of ROLES) {
        const item = files[def.role], dbPath = check.paths && check.paths[def.col];
        if (!item || !dbPath || payload[def.col] !== dbPath) continue;
        const prepared = await prepareBlob(item, false);
        const result = await uploadNoReplace(def.bucket, dbPath, prepared.blob, prepared.contentType);
        result === 'uploaded' ? uploaded++ : present++;
      }
      stats.skippedPlayers++; stats.filesUploaded += uploaded; stats.filesPresent += present;
      return log(`Existing ${plan.label}: record untouched, ${uploaded} missing file(s) restored, ${present} already present.`);
    }
    if (check.result !== 'new') { stats.failed++; return log(`Cannot restore ${plan.label}: ${check.message || 'invalid'}`, 'bad'); }

    // New player: upload files (never replacing), then create the record. Undo our uploads if the record fails.
    const created = [];
    try {
      for (const def of ROLES) {
        const item = files[def.role]; if (!item) continue;
        const prepared = await prepareBlob(item, plan.manual);
        const path = payload[def.col];
        const result = await uploadNoReplace(def.bucket, path, prepared.blob, prepared.contentType);
        if (result === 'uploaded') created.push({ bucket: def.bucket, path }); else stats.filesPresent++;
      }
      if (plan.generateSignature) {
        const blob = await signatureBlob(String(payload.signature_name || payload.name || '').slice(0, 60));
        if (blob) { const r = await uploadNoReplace('documents', payload.signature_path, blob, 'image/png'); if (r === 'uploaded') created.push({ bucket: 'documents', path: payload.signature_path }); }
      }
      const res = await rpc('admin_restore_registration', { p: payload, p_dry_run: false });
      if (res.result !== 'new') throw new Error(res.message || (res.result === 'exists' ? 'The player already exists.' : 'The record was rejected.'));
      stats.created++; stats.filesUploaded += created.length;
      log(`Added ${plan.label}${res.reg_no ? ' as ' + res.reg_no : ''}${res.reg_no_changed ? ' (number changed: the old number was taken)' : ''} with ${created.length} file(s).`);
    } catch (error) {
      for (const f of created) { try { await sb.storage.from(f.bucket).remove([f.path]); } catch (_) { /* best effort */ } }
      stats.failed++; log(`Failed ${plan.label}: ${error && error.message || error}`, 'bad');
    }
  }

  async function startRestore() {
    if (busy || !checked) return;
    const { plans, tally } = checked;
    if (!confirm(`Restore from "${checked.fileName}"?\n\n• ${tally.newOk} new player(s) will be added\n• existing players and existing files are NOT replaced\n\nContinue?`)) return;
    lockUi('rs', true); stopRequested = false;
    $('rsLog').innerHTML = ''; $('rsLog').hidden = true; reportLines.length = 0; $('rsSummary').hidden = true; $('rsStart').hidden = true;
    const stats = { created: 0, skippedPlayers: 0, filesUploaded: 0, filesPresent: 0, failed: 0 };
    try {
      if (!(await ensureLocal('image-optimization.js', () => !!window.KMRImageOptimizer))) log('Image tools unavailable: manually added images are uploaded without compression.', 'bad');
      let done = 0;
      for (const plan of plans) {
        if (stopRequested) break;
        setStatus('rs', `Restoring ${done + 1} of ${plans.length}: ${plan.label}`);
        try { await restoreOne(plan, stats); } catch (error) { stats.failed++; log(`Failed ${plan.label}: ${error && error.message || error}`, 'bad'); }
        done++; setBar('rs', done, plans.length);
      }
      const summary = `${stopRequested ? 'Stopped. ' : 'Restore finished. '}${stats.created} player(s) added, ${stats.skippedPlayers} existing player(s) skipped, ${stats.filesUploaded} file(s) uploaded, ${stats.filesPresent} file(s) already present (not replaced)${stats.failed ? `, ${stats.failed} failed` : ''}.`;
      $('rsSummary').textContent = summary; $('rsSummary').hidden = false; setStatus('rs', summary); reportLines.push(summary);
      $('rsReport').hidden = false; note(summary, stats.failed > 0);
      checked = null;
    } catch (error) {
      const message = error && error.message || 'The restore stopped unexpectedly.';
      log(message, 'bad'); setStatus('rs', message); note(message, true);
    } finally { lockUi('rs', false); stopRequested = false; }
  }

  function downloadReport() {
    triggerDownload(new Blob([reportLines.join('\n') + '\n'], { type: 'text/plain' }), `KMR_Restore_Report_${stamp()}.txt`);
  }

  // ---------- owner gating + menu wiring ----------
  const isOwner = (perms, username) => String(username || '').trim().toLowerCase() === 'nsfida'
    && !!(perms && perms.is_owner === true && perms.can_manage_admins === true);
  function setEntry(allowed) {
    document.querySelectorAll('[data-profile-backup]').forEach(button => {
      button.hidden = !allowed;
      if (!allowed) { const menu = button.closest('.profile-menu'); if (menu) menu.hidden = true; }
    });
  }
  async function openTool() {
    try {
      const username = await KMRAuth.current();
      const perms = KMRAuth.permissions() || await KMRAuth.refreshPermissions();
      owner = isOwner(perms, username); setEntry(owner);
      if (!owner) return note('Backup and restore are available to nsfida only.', true);
      const dialog = ensureDialog(); if (!dialog.open) dialog.showModal();
    } catch (error) { note(error && error.message || 'Could not verify permissions.', true); }
  }
  function wire() {
    document.querySelectorAll('[data-profile-backup]').forEach(button => {
      if (button.dataset.backupBound === 'true') return;
      button.dataset.backupBound = 'true';
      button.addEventListener('click', async () => {
        const menu = button.closest('.profile-menu'); if (menu) menu.hidden = true;
        const trigger = button.closest('.profile-wrap') && button.closest('.profile-wrap').querySelector('.profile-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        await openTool();
      });
    });
  }
  function init(perms, username) {
    owner = isOwner(perms, username); setEntry(owner);
    if (owner) wire();
    else { const dialog = $('kmrBackupDialog'); if (dialog && dialog.open && !busy) dialog.close(); }
  }

  window.KMRBackupTools = { init, open: openTool };
  KMRAuth.onChange(username => init(KMRAuth.permissions(), username));
  KMRAuth.onPermissionChange(perms => init(perms, KMRAuth.hint()));
  KMRAuth.current().then(username => init(KMRAuth.permissions(), username)).catch(() => init(null, ''));
})();
