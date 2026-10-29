(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let wired = false, owner = false, loading = false, activeDialog = null;
  const featureLabels = { registrations: 'Registrations', funds: 'Funds and expenses', results: 'Race results' };

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
          <div class="managed-admin-dialog-title"><span class="managed-admin-kicker">OWNER CONTROLS · NSFIDA ONLY</span><h2 id="adminAccountsTitle">Admin accounts &amp; feature access</h2><p>Create organiser accounts and choose which parts of the site each admin can manage.</p></div>
          <button type="button" class="managed-admin-dialog-close" data-admin-accounts-close aria-label="Close admin account settings">×</button>
        </header>
        <div class="managed-admin-dialog-content">
          <section class="managed-admins-panel" id="adminAccountsPanel" aria-labelledby="adminAccountsPanelTitle">
            <div class="managed-admin-section-intro"><div><span class="managed-admin-kicker">ACCESS MANAGEMENT</span><h3 id="adminAccountsPanelTitle">Create a new admin</h3><p>Built-in admin accounts are protected. Give each organiser only the features they need.</p></div></div>
            <form id="createAdminForm" class="managed-admin-create-form">
              <label>Display name<input id="newAdminDisplayName" maxlength="100" required placeholder="Admin name" autocomplete="name"></label>
              <label>Username<input id="newAdminUsername" required minlength="2" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,39}" autocomplete="off" placeholder="username"><small>Login will be username@khawrai.app</small></label>
              <label>Temporary password<input id="newAdminPassword" type="password" minlength="10" required autocomplete="new-password" placeholder="At least 10 characters"><small>Share this temporary password privately.</small></label>
              <fieldset class="admin-feature-checks"><legend>Allow access to</legend>
                <label><input type="checkbox" id="newAdminCanRegistrations"> Registrations</label>
                <label><input type="checkbox" id="newAdminCanFunds"> Funds and expenses</label>
                <label><input type="checkbox" id="newAdminCanResults" checked> Race results</label>
              </fieldset>
              <button class="btn" id="createAdminSubmit" type="submit">Create admin account</button>
            </form>
            <p class="msg" id="adminAccountsMessage" role="status" aria-live="polite">Admin account management is available to nsfida only.</p>
            <div class="managed-admin-list-heading"><div><h3>Existing managed admins</h3><p>Change feature access or disable an account, then save that admin's settings.</p></div><span class="managed-admin-live-pill">Owner access</span></div>
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

  const selectedFlags = root => ({
    can_registrations: !!root.querySelector('[data-flag="registrations"]')?.checked,
    can_funds: !!root.querySelector('[data-flag="funds"]')?.checked,
    can_results: !!root.querySelector('[data-flag="results"]')?.checked,
    is_active: !!root.querySelector('[data-flag="active"]')?.checked
  });

  function accountCard(account) {
    const email = String(account.email || '');
    const emailAttr = esc(email);
    const flags = [
      ['registrations', featureLabels.registrations, account.can_registrations],
      ['funds', featureLabels.funds, account.can_funds],
      ['results', featureLabels.results, account.can_results],
      ['active', 'Account active', account.is_active]
    ];
    return `<article class="managed-admin-card" data-admin-email="${emailAttr}">
      <div class="managed-admin-card-head"><div><strong>${esc(account.display_name || email.split('@')[0])}</strong><small>${emailAttr}</small></div><span class="${account.is_active ? 'account-active' : 'account-disabled'}">${account.is_active ? 'Active' : 'Disabled'}</span></div>
      <div class="managed-admin-card-flags">${flags.map(([key,label,checked]) => `<label><input type="checkbox" data-flag="${key}"${checked ? ' checked' : ''}> <span>${label}</span></label>`).join('')}</div>
      <div class="managed-admin-card-actions"><small>Created ${account.created_at ? esc(new Date(account.created_at).toLocaleDateString()) : 'date unavailable'}</small><button type="button" class="btn sm ghost" data-save-admin>Save access</button></div>
    </article>`;
  }

  async function loadAccounts() {
    if (!owner || loading) return;
    loading = true;
    const list = $('managedAdminAccountsList');
    if (list) list.innerHTML = '<p class="msg">Loading managed admins…</p>';
    try {
      const { data, error } = await sb.rpc('admin_list_managed_accounts');
      if (error) throw error;
      const accounts = Array.isArray(data) ? data : [];
      if (!accounts.length) list.innerHTML = '<p class="msg">No additional admin accounts have been created yet.</p>';
      else list.innerHTML = accounts.map(accountCard).join('');
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
    const flags = {
      can_registrations: $('newAdminCanRegistrations').checked,
      can_funds: $('newAdminCanFunds').checked,
      can_results: $('newAdminCanResults').checked
    };
    if (!flags.can_registrations && !flags.can_funds && !flags.can_results) return showMessage('Select at least one feature for this account.', true);
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
      $('createAdminForm').reset(); $('newAdminCanResults').checked = true;
      showMessage(`Created ${result.email || username + '@khawrai.app'}. Share the temporary credentials securely with the intended admin.`);
      await loadAccounts();
    } catch (error) { showMessage(error && error.message || 'Could not create this admin account.', true); }
    finally { button.disabled = false; }
  }

  async function saveAccount(card) {
    if (!owner || !card) return;
    const email = card.dataset.adminEmail;
    const displayName = card.querySelector('.managed-admin-card-head strong')?.textContent.trim() || email.split('@')[0];
    const flags = selectedFlags(card);
    if (flags.is_active && !flags.can_registrations && !flags.can_funds && !flags.can_results) {
      showMessage(`Enable at least one feature or disable ${email}.`, true); return;
    }
    const button = card.querySelector('[data-save-admin]');
    button.disabled = true; showMessage(`Saving feature access for ${email}…`);
    try {
      const { error } = await sb.rpc('admin_update_managed_account_permissions', {
        p_email: email,
        p_display_name: displayName,
        p_can_registrations: flags.can_registrations,
        p_can_funds: flags.can_funds,
        p_can_results: flags.can_results,
        p_is_active: flags.is_active
      });
      if (error) throw error;
      showMessage(`Feature access saved for ${email}. If you disabled the account or removed Results access, that admin will lose the corresponding permissions on their next permission check.`);
      await loadAccounts();
    } catch (error) { showMessage(error && error.message || `Could not update ${email}.`, true); }
    finally { if (button && button.isConnected) button.disabled = false; }
  }

  function wire() {
    if (wired) return;
    wired = true;
    ensureDialog();
    $('createAdminForm')?.addEventListener('submit', createAccount);
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
