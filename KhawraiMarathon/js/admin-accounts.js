(function () {
  const $ = id => document.getElementById(id);
  let wired = false, owner = false, loading = false;
  const featureLabels = { registrations: 'Registrations', funds: 'Funds and expenses', results: 'Race results' };
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
      ['registrations', 'Registrations', account.can_registrations],
      ['funds', 'Funds and expenses', account.can_funds],
      ['results', 'Race results', account.can_results],
      ['active', 'Account active', account.is_active]
    ];
    return `<article class="managed-admin-card" data-admin-email="${emailAttr}">
      <div class="managed-admin-card-head"><div><strong>${esc(account.display_name || email.split('@')[0])}</strong><small>${emailAttr}</small></div><span class="${account.is_active ? '' : 'account-disabled'}">${account.is_active ? 'Active' : 'Disabled'}</span></div>
      <div class="managed-admin-card-flags">${flags.map(([key,label,checked]) => `<label><input type="checkbox" data-flag="${key}"${checked ? ' checked' : ''}> ${label}</label>`).join('')}</div>
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
      if (!accounts.length) {
        list.innerHTML = '<p class="msg">No additional admin accounts have been created yet.</p>';
      } else {
        list.innerHTML = accounts.map(accountCard).join('');
      }
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
    $('createAdminForm')?.addEventListener('submit', createAccount);
    $('managedAdminAccountsList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-save-admin]');
      if (button) saveAccount(button.closest('[data-admin-email]'));
    });
  }
  async function init(perms = {}) {
    owner = !!(perms && perms.is_owner === true && perms.can_manage_admins === true);
    const panel = $('adminAccountsPanel');
    if (!panel) return;
    panel.hidden = !owner;
    if (!owner) return;
    wire();
    await loadAccounts();
  }
  window.KMRAdminAccounts = { init };
})();
