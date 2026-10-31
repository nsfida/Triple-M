(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let wired = false, owner = false, loading = false, activeDialog = null;
  const SCRIPT_SRC = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
  // The permission form needs its own stylesheet; load it once, relative to this script.
  (function loadAccessCss() {
    if (!SCRIPT_SRC || document.getElementById('kmrAdminAccessCss')) return;
    const link = document.createElement('link');
    link.id = 'kmrAdminAccessCss'; link.rel = 'stylesheet';
    link.href = new URL('../assets/admin-access.css?v=20261030-2', SCRIPT_SRC).href;
    document.head.appendChild(link);
  })();

  // Every switch nsfida can give to or take from an admin. `requires` marks a switch that only makes
  // sense when its parent switch is on (the database enforces the same rule).
  const PERM_GROUPS = [
    { title: 'Registrations', hint: 'Runner list, player details and uploaded documents.', items: [
      { flag: 'can_registrations', label: 'View registrations', hint: 'See the runner list, full player details, documents and registration PDFs.' },
      { flag: 'can_edit_registrations', requires: 'can_registrations', label: 'Edit registrations', hint: 'Change player details and photo, confirm or mark pending, cancel or restore a player.' },
      { flag: 'can_delete_registrations', requires: 'can_registrations', danger: true, label: 'Delete registrations', hint: 'Permanently delete a registration and its files. This cannot be undone.' }
    ] },
    { title: 'Project funds', hint: 'Receiving and expenses ledgers, totals and PDF reports. Hidden from everyone unless allowed here.', items: [
      { flag: 'can_funds', label: 'View funds', hint: 'See receiving and expenses entries and totals, and download the funds PDFs.' },
      { flag: 'can_funds_add', requires: 'can_funds', label: 'Make funds entries', hint: 'Record new receiving entries and expenses, and enter an amount when confirming a registration.' },
      { flag: 'can_funds_edit', requires: 'can_funds', label: 'Edit funds entries', hint: 'Change existing receiving and expense entries.' },
      { flag: 'can_funds_delete', requires: 'can_funds', danger: true, label: 'Delete funds entries', hint: 'Permanently delete receiving and expense entries.' }
    ] },
    { title: 'Race results', hint: 'Live race control and the official leaderboard.', items: [
      { flag: 'can_results', label: 'Manage race results', hint: 'Open Manage Results, update runner status and finish times, and publish official results.' }
    ] }
  ];
  const ALL_FLAGS = PERM_GROUPS.flatMap(group => group.items.map(item => item.flag));
  const PRESETS = {
    full: Object.fromEntries(ALL_FLAGS.map(flag => [flag, true])),
    view: { can_registrations: true, can_funds: true },
    none: {}
  };

  function permGroupsHtml(values = {}) {
    return `<div class="access-groups" data-perm-root>
      <div class="access-presets" role="group" aria-label="Quick presets"><span>Quick set:</span>
        <button type="button" class="access-preset" data-preset="full">Full access</button>
        <button type="button" class="access-preset" data-preset="view">View only</button>
        <button type="button" class="access-preset" data-preset="none">Clear all</button>
      </div>
      ${PERM_GROUPS.map(group => `<section class="access-group">
        <header><strong>${esc(group.title)}</strong><small>${esc(group.hint)}</small></header>
        ${group.items.map(item => `<label class="access-row${item.requires ? ' is-child' : ''}${item.danger ? ' is-danger' : ''}">
          <input type="checkbox" data-perm="${item.flag}"${item.requires ? ` data-requires="${item.requires}"` : ''}${values[item.flag] ? ' checked' : ''}>
          <span><b>${esc(item.label)}</b><small>${esc(item.hint)}</small></span>
        </label>`).join('')}
      </section>`).join('')}
    </div>`;
  }
  function syncDependencies(root) {
    if (!root) return;
    root.querySelectorAll('[data-requires]').forEach(box => {
      const parent = root.querySelector(`[data-perm="${box.dataset.requires}"]`);
      const allowed = !!(parent && parent.checked);
      if (!allowed) box.checked = false;
      box.disabled = !allowed;
      const row = box.closest('.access-row'); if (row) row.classList.toggle('is-locked', !allowed);
    });
  }
  const readPerms = root => Object.fromEntries(ALL_FLAGS.map(flag => [flag, !!root.querySelector(`[data-perm="${flag}"]`)?.checked]));
  function applyPerms(root, values) {
    ALL_FLAGS.forEach(flag => { const box = root.querySelector(`[data-perm="${flag}"]`); if (box) box.checked = !!values[flag]; });
    syncDependencies(root);
  }
  const hasAnyPermission = perms => !!(perms.can_registrations || perms.can_funds || perms.can_results);
  function summaryChips(a) {
    const reg = a.can_registrations ? ['View', a.can_edit_registrations && 'Edit', a.can_delete_registrations && 'Delete'].filter(Boolean).join(' · ') : 'No access';
    const funds = a.can_funds ? ['View', a.can_funds_add && 'Add', a.can_funds_edit && 'Edit', a.can_funds_delete && 'Delete'].filter(Boolean).join(' · ') : 'No access';
    const res = a.can_results ? 'Manage' : 'No access';
    const chip = (name, text, on) => `<span class="access-chip${on ? ' on' : ''}"><i>${name}</i>${esc(text)}</span>`;
    return chip('Registrations', reg, a.can_registrations) + chip('Funds', funds, a.can_funds) + chip('Results', res, a.can_results);
  }

  const isOwner = (perms, username) => String(username || '').trim().toLowerCase() === 'nsfida'
    && !!(perms && perms.is_owner === true && perms.can_manage_admins === true);

  function setOwnerEntry(allowed) {
    document.querySelectorAll('[data-profile-admin-accounts]').forEach(button => {
      button.hidden = !allowed;
      if (!allowed) {
        const menu = button.closest('.profile-menu');
        if (menu) menu.hidden = true;
      }
    });
  }

  function ensureDialog() {
    let dialog = $('kmrAdminAccountsDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'kmrAdminAccountsDialog';
    dialog.className = 'managed-admin-dialog';
    dialog.setAttribute('aria-labelledby', 'adminAccountsTitle');
    dialog.innerHTML = `
      <div class="managed-admin-dialog-shell">
        <header class="managed-admin-dialog-header">
          <div class="managed-admin-dialog-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"></circle><path d="M2.8 20c.3-3.4 2.4-5.2 6.2-5.2 1.6 0 2.9.3 3.9 1"></path><circle cx="17.5" cy="16.5" r="3.2"></circle><path d="M17.5 14.8v3.4M15.8 16.5h3.4"></path></svg></div>
          <div class="managed-admin-dialog-title"><span class="managed-admin-kicker">OWNER CONTROLS · NSFIDA ONLY</span><h2 id="adminAccountsTitle">Admin accounts &amp; permissions</h2><p>Create admins and decide exactly what each one can view, edit, add or delete. You can change any admin at any time, including waseemfida.</p></div>
          <button type="button" class="managed-admin-dialog-close" data-admin-accounts-close aria-label="Close admin account settings">×</button>
        </header>
        <div class="managed-admin-dialog-content">
          <section class="managed-admins-panel" id="adminAccountsPanel" aria-labelledby="adminAccountsPanelTitle">
            <div class="managed-admin-section-intro"><div><span class="managed-admin-kicker">NEW ADMIN</span><h3 id="adminAccountsPanelTitle">Create a new admin</h3><p>Fill in the login details, then choose the permissions. Nothing is allowed unless you tick it. You, nsfida, always keep full access.</p></div></div>
            <form id="createAdminForm" class="access-create-form">
              <div class="access-identity">
                <label>Display name<input id="newAdminDisplayName" maxlength="100" required placeholder="Admin name" autocomplete="name"></label>
                <label>Username<input id="newAdminUsername" required minlength="2" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,39}" autocomplete="off" placeholder="username"><small>Login will be username@khawrai.app</small></label>
                <label>Temporary password<input id="newAdminPassword" type="password" minlength="10" required autocomplete="new-password" placeholder="At least 10 characters"><small>Share this temporary password privately.</small></label>
              </div>
              <h4 class="access-heading">Permissions for this admin</h4>
              ${permGroupsHtml({ can_results: true })}
              <button class="btn" id="createAdminSubmit" type="submit">Create admin account</button>
            </form>
            <p class="msg" id="adminAccountsMessage" role="status" aria-live="polite">Admin account management is available to nsfida only.</p>
            <div class="managed-admin-list-heading"><div><h3>Existing admins</h3><p>Open an admin to change permissions, then press Save. waseemfida is listed too and can be restricted or allowed like any other admin.</p></div><span class="managed-admin-live-pill">Owner access</span></div>
            <div id="managedAdminAccountsList" class="managed-admin-accounts-list"><p class="msg">Open this panel to load managed admins…</p></div>
          </section>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('[data-admin-accounts-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { const pass = $('newAdminPassword'); if (pass) pass.value = ''; });
    return dialog;
  }

  const showMessage = (message, bad = false) => {
    const node = $('adminAccountsMessage');
    if (!node) return;
    node.textContent = message;
    node.className = 'msg' + (bad ? ' bad' : '');
  };

  const fmtDate = value => value ? new Date(value).toLocaleDateString() : 'date unavailable';
  const openCards = new Set();

  function ownerCard() {
    return `<article class="access-card is-owner">
      <div class="access-card-head"><div class="access-who"><strong>Nadeem Shahzad Fida</strong><small>nsfida@khawrai.app</small></div>
      <span class="access-badge owner">Owner</span></div>
      <div class="access-chips"><span class="access-chip on"><i>All areas</i>Full access, always</span></div>
      <p class="access-note">The owner account cannot be restricted, disabled or deleted from this screen.</p>
    </article>`;
  }

  function accountCard(account) {
    const email = String(account.email || '');
    const emailAttr = esc(email);
    const name = account.display_name || email.split('@')[0];
    const builtin = account.is_builtin === true;
    return `<details class="access-card${account.is_active ? '' : ' is-disabled'}" data-admin-email="${emailAttr}" data-display-name="${esc(name)}"${openCards.has(email) ? ' open' : ''}>
      <summary class="access-card-head">
        <div class="access-who"><strong>${esc(name)}</strong><small>${emailAttr}</small></div>
        <span class="access-badges">${builtin ? '<span class="access-badge builtin">Built-in</span>' : ''}<span class="access-badge ${account.is_active ? 'active' : 'off'}">${account.is_active ? 'Active' : 'Disabled'}</span></span>
        <span class="access-chevron" aria-hidden="true"></span>
        <div class="access-chips" data-summary>${summaryChips(account)}</div>
      </summary>
      <div class="access-card-body">
        ${permGroupsHtml(account)}
        <label class="access-active"><input type="checkbox" data-flag-active${account.is_active ? ' checked' : ''}> <span><b>Account active</b><small>Untick to switch this admin off completely without deleting the login. All of their access stops immediately.</small></span></label>
        <div class="access-card-actions"><small>${builtin ? 'Built-in admin' : 'Created ' + esc(fmtDate(account.created_at))}</small><button type="button" class="btn sm" data-save-admin>Save permissions</button></div>
      </div>
    </details>`;
  }

  async function loadAccounts() {
    if (!owner || loading) return;
    loading = true;
    const list = $('managedAdminAccountsList');
    list && list.querySelectorAll('details[open][data-admin-email]').forEach(d => openCards.add(d.dataset.adminEmail));
    list && list.querySelectorAll('details:not([open])[data-admin-email]').forEach(d => openCards.delete(d.dataset.adminEmail));
    if (list) list.innerHTML = '<p class="msg">Loading admins…</p>';
    try {
      const { data, error } = await sb.rpc('admin_list_managed_accounts');
      if (error) throw error;
      const accounts = Array.isArray(data) ? data : [];
      list.innerHTML = ownerCard() + accounts.map(accountCard).join('');
      list.querySelectorAll('.access-card[data-admin-email]').forEach(card => syncDependencies(card.querySelector('[data-perm-root]')));
    } catch (error) {
      if (list) list.innerHTML = '<p class="msg bad">Could not load managed admin accounts.</p>';
      showMessage(error && error.message || 'Could not load managed admin accounts.', true);
    } finally { loading = false; }
  }

  async function createAccount(event) {
    event.preventDefault();
    if (!owner) return showMessage('Only nsfida can create admin accounts.', true);
    const button = $('createAdminSubmit');
    const username = $('newAdminUsername').value.trim().toLowerCase();
    const displayName = $('newAdminDisplayName').value.trim();
    const password = $('newAdminPassword').value;
    const flags = readPerms($('createAdminForm').querySelector('[data-perm-root]'));
    if (!hasAnyPermission(flags)) return showMessage('Tick at least one permission for this admin.', true);
    if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(username)) return showMessage('Username must be 2–40 characters and use letters, numbers, dots, underscores or hyphens.', true);
    if (password.length < 10) return showMessage('Use a temporary password with at least 10 characters.', true);
    button.disabled = true; showMessage('Creating the admin account securely…');
    try {
      const { data: sessionData, error: sessionError } = await sb.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData && sessionData.session && sessionData.session.access_token;
      if (!accessToken) throw new Error('Your admin session has expired. Sign in again.');
      const response = await fetch(`${KMR.SUPABASE_URL}/functions/v1/admin-account`, {
        method: 'POST',
        headers: { apikey: KMR.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', username, display_name: displayName, password, ...flags })
      });
      let result = {};
      try { result = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(result.error || `Admin account creation failed (${response.status}).`);
      $('createAdminForm').reset(); applyPerms($('createAdminForm').querySelector('[data-perm-root]'), { can_results: true });
      showMessage(`Created ${result.email || username + '@khawrai.app'}. Share the temporary credentials securely with the intended admin.`);
      await loadAccounts();
    } catch (error) { showMessage(error && error.message || 'Could not create this admin account.', true); }
    finally { button.disabled = false; }
  }

  async function saveAccount(card) {
    if (!owner || !card) return;
    const email = card.dataset.adminEmail;
    const displayName = card.dataset.displayName || email.split('@')[0];
    const flags = readPerms(card.querySelector('[data-perm-root]'));
    const active = !!card.querySelector('[data-flag-active]')?.checked;
    if (active && !hasAnyPermission(flags)) {
      showMessage(`Tick at least one permission for ${email}, or untick "Account active".`, true); return;
    }
    const button = card.querySelector('[data-save-admin]');
    button.disabled = true; showMessage(`Saving permissions for ${email}…`);
    try {
      const { error } = await sb.rpc('admin_set_account_access', { p_email: email, p_display_name: displayName, p_access: flags, p_is_active: active });
      if (error) throw error;
      openCards.add(email);
      showMessage(`Permissions saved for ${email}. The change applies the next time that admin opens or refreshes a page.`);
      await loadAccounts();
    } catch (error) { showMessage(error && error.message || `Could not update ${email}.`, true); }
    finally { if (button && button.isConnected) button.disabled = false; }
  }

  function wire() {
    if (wired) return;
    wired = true;
    ensureDialog();
    $('createAdminForm')?.addEventListener('submit', createAccount);
    const dialog = $('kmrAdminAccountsDialog');
    dialog.addEventListener('change', event => {
      const root = event.target.closest('[data-perm-root]');
      if (!root || !event.target.matches('[data-perm]')) return;
      syncDependencies(root);
      const card = root.closest('.access-card[data-admin-email]');
      if (card) card.querySelector('[data-summary]').innerHTML = summaryChips(readPerms(root));
    });
    dialog.addEventListener('click', event => {
      const preset = event.target.closest('[data-preset]');
      if (!preset) return;
      const root = preset.closest('[data-perm-root]');
      applyPerms(root, PRESETS[preset.dataset.preset] || {});
      const card = root.closest('.access-card[data-admin-email]');
      if (card) card.querySelector('[data-summary]').innerHTML = summaryChips(readPerms(root));
    });
    $('managedAdminAccountsList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-save-admin]');
      if (button) saveAccount(button.closest('[data-admin-email]'));
    });
    document.querySelectorAll('[data-profile-admin-accounts]').forEach(button => {
      if (button.dataset.accountsBound === 'true') return;
      button.dataset.accountsBound = 'true';
      button.addEventListener('click', async () => {
        const menu = button.closest('.profile-menu');
        if (menu) menu.hidden = true;
        const trigger = button.closest('.profile-wrap')?.querySelector('.profile-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        await openOverlay();
      });
    });
  }

  async function openOverlay() {
    try {
      // Re-read the active session and its server-side permissions on every open.
      const username = await KMRAuth.current();
      const perms = KMRAuth.permissions() || await KMRAuth.refreshPermissions();
      owner = isOwner(perms, username);
      setOwnerEntry(owner);
      if (!owner) { toast('Admin account settings are available to nsfida only.', true); return; }
      const dialog = ensureDialog();
      if (!dialog.open) dialog.showModal();
      await loadAccounts();
    } catch (error) { toast(error && error.message || 'Could not verify admin account permissions.', true); }
  }

  function init(perms = {}, username = (window.KMRAuth && KMRAuth.hint ? KMRAuth.hint() : '')) {
    owner = isOwner(perms, username);
    setOwnerEntry(owner);
    if (owner) wire();
    else if (activeDialog && activeDialog.open) activeDialog.close();
    activeDialog = $('kmrAdminAccountsDialog') || activeDialog;
  }

  window.KMRAdminAccounts = { init, open: openOverlay };

  // This module is loaded across all routes so the account menu behaves consistently.
  KMRAuth.onChange(username => init(KMRAuth.permissions(), username));
  KMRAuth.onPermissionChange(perms => init(perms, KMRAuth.hint()));
  KMRAuth.current().then(username => init(KMRAuth.permissions(), username)).catch(() => init(null, ''));
})();
