/*
 * User menu + account side panel.
 *
 *   Avatar button (top bar) → menu: Settings, Name & photo, Password,
 *   Payment types (owner), Users & access (owner), Sign out.
 *
 * Every view opens in the same side panel (same size and design as Staff Balance):
 *   home      Settings overview
 *   profile   display name + profile photo (crop / move / zoom before saving)
 *   password  change your own access key
 *   types     payment types for the TYPE column (owner)
 *   users     list of users / access keys (owner)
 *   user      create or edit one user: name, key, access per section, enable/disable, delete
 *
 * Nothing here runs until the panel or menu is opened, so it adds no work to the sheets.
 */

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SECTIONS = [
  { key: 'cash_vault', label: 'Cash Vault', hint: 'incl. Staff Balance' },
  { key: 'expenses', label: 'Expenses', hint: '' },
  { key: 'received', label: 'Received', hint: '' }
];
const LEVEL_LABEL = { none: 'No access', view: 'View', edit: 'Edit' };
const AVATAR_COLORS = ['#2b6fd6', '#13785d', '#b4541a', '#7a3fc2', '#c2185b', '#00838f', '#5d6b82'];

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function colorFor(name) {
  let hash = 0;
  for (const char of String(name || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// Round avatar: the photo if there is one, otherwise coloured initials.
export function avatarHtml(name, avatar, className = '') {
  if (avatar) return `<span class="ua ${className}"><img src="${escapeHtml(avatar)}" alt="" draggable="false"></span>`;
  return `<span class="ua ${className}" style="background:${colorFor(name)}">${escapeHtml(initials(name))}</span>`;
}

function accessSummary(permissions, role) {
  if (role === 'owner') return 'Owner · full access';
  const parts = SECTIONS.map(section => {
    const level = permissions?.[section.key] || 'none';
    return level === 'none' ? null : `${section.label}: ${LEVEL_LABEL[level]}`;
  }).filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No access';
}

function formatDateTime(value) {
  if (!value) return 'Never signed in';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `Last sign-in ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const ICONS = {
  gear: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/></svg>',
  key: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3m-3 3 3 3m-6 0 2 2"/></svg>',
  tag: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.4.1 4 1.5 4.5 4.3"/></svg>',
  out: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>'
};

export function createAccountPanel(app) {
  const panel = document.getElementById('accountPanel');
  const body = document.getElementById('accountPanelBody');
  const titleNode = document.getElementById('accountPanelTitle');
  const subtitleNode = document.getElementById('accountPanelSubtitle');
  const iconNode = document.getElementById('accountPanelIcon');
  const menuButton = document.getElementById('userMenuButton');
  const menu = document.getElementById('userMenu');

  let user = null;
  let permissions = null;
  let view = 'home';
  let users = null;           // owner: list of alternate users (null = not loaded)
  let editing = null;         // user form state
  let pendingAvatar;          // undefined = unchanged, null = remove, string = new photo
  let cropper = null;
  let busy = false;

  const isOwner = () => user?.role === 'owner';

  // ---- Top-bar chip + menu ------------------------------------------------------
  function renderChip() {
    if (!user) return;
    document.getElementById('userChipAvatar').outerHTML = `<span id="userChipAvatar">${avatarHtml(user.name, user.avatar, 'ua-sm')}</span>`;
    document.getElementById('userChipName').textContent = user.name;
    document.getElementById('userChipRole').textContent = isOwner() ? 'Owner' : (Object.values(permissions || {}).includes('edit') ? 'Editor' : 'Viewer');
    menu.innerHTML = `
      <div class="um-head">${avatarHtml(user.name, user.avatar, 'ua-md')}<div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(accessSummary(permissions, user.role))}</small></div></div>
      <button type="button" role="menuitem" data-open="home">${ICONS.gear}<span>Settings</span></button>
      <button type="button" role="menuitem" data-open="profile">${ICONS.user}<span>Name &amp; photo</span></button>
      <button type="button" role="menuitem" data-open="password">${ICONS.key}<span>Password</span></button>
      ${isOwner() ? `<button type="button" role="menuitem" data-open="types">${ICONS.tag}<span>Payment types</span></button>
      <button type="button" role="menuitem" data-open="users">${ICONS.users}<span>Users &amp; access</span></button>` : ''}
      <div class="um-sep"></div>
      <button type="button" role="menuitem" data-action="signout" class="um-danger">${ICONS.out}<span>Sign out</span></button>`;
  }

  function openMenu() {
    menu.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
  }

  menuButton.addEventListener('click', event => {
    event.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });
  menu.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    closeMenu();
    if (button.dataset.action === 'signout') { app.signOut(); return; }
    open(button.dataset.open);
  });
  document.addEventListener('mousedown', event => {
    if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

  // ---- Panel ----------------------------------------------------------------------
  const HEADERS = {
    home: () => ({ icon: ICONS.gear, title: 'Settings', subtitle: 'Your profile, password and workspace settings' }),
    profile: () => ({ icon: ICONS.user, title: 'Name & photo', subtitle: 'Shown in the top bar and to the owner' }),
    crop: () => ({ icon: ICONS.user, title: 'Adjust photo', subtitle: 'Drag to move · scroll or use the slider to zoom' }),
    password: () => ({ icon: ICONS.key, title: 'Password', subtitle: 'Change the access key you sign in with' }),
    types: () => ({ icon: ICONS.tag, title: 'Payment types', subtitle: 'Types available in the TYPE column' }),
    users: () => ({ icon: ICONS.users, title: 'Users & access', subtitle: 'Access keys, names and what each user can do' }),
    user: () => ({ icon: ICONS.users, title: editing?.mode === 'create' ? 'New user' : (editing?.name || 'User'), subtitle: editing?.mode === 'create' ? 'Create an access key for a person' : 'Edit access, key and status' })
  };

  function setHeader() {
    const header = HEADERS[view]();
    iconNode.innerHTML = header.icon;
    titleNode.textContent = header.title;
    subtitleNode.textContent = header.subtitle;
  }

  function open(nextView = 'home') {
    if (!user) return;
    if ((nextView === 'types' || nextView === 'users' || nextView === 'user') && !isOwner()) nextView = 'home';
    show(nextView);
    if (!panel.open) panel.showModal();
  }

  function show(nextView) {
    view = nextView;
    if (view !== 'crop') cropper?.destroy();
    if (view !== 'crop') cropper = null;
    setHeader();
    render();
    body.scrollTop = 0;
  }

  function close() {
    cropper?.destroy();
    cropper = null;
    closeMenu();
    if (panel.open) panel.close();
  }

  document.getElementById('closeAccountPanel').addEventListener('click', close);
  panel.addEventListener('click', event => { if (event.target === panel) close(); });
  panel.addEventListener('close', () => { cropper?.destroy(); cropper = null; pendingAvatar = undefined; editing = null; });

  const back = (target = 'home', label = 'Settings') =>
    `<button class="sp-btn sp-btn-ghost sp-back" type="button" data-go="${target}">← ${label}</button>`;
  const message = () => '<p class="sp-message" data-role="message" role="status" aria-live="polite"></p>';
  function say(text, ok = false) {
    const node = body.querySelector('[data-role="message"]');
    if (!node) { if (text) app.showToast(text, !ok); return; }
    node.textContent = text || '';
    node.classList.toggle('ok', ok);
  }

  function friendlyError(error) {
    const text = error?.message || String(error || 'Something went wrong.');
    if (/Unknown access action/i.test(text)) return 'Please redeploy the "access" Edge Function (see README), then try again.';
    if (/payment_types|relation .* does not exist|schema cache/i.test(text)) return 'Please run SQL migration 014 (see README), then try again.';
    return text;
  }

  // ---- Views --------------------------------------------------------------------
  function render() {
    const renderers = { home: renderHome, profile: renderProfile, crop: renderCrop, password: renderPassword, types: renderTypes, users: renderUsers, user: renderUser };
    renderers[view]();
  }

  function navRow(target, icon, title, detail) {
    return `<button class="ap-nav" type="button" data-go="${target}"><span class="ap-nav-icon">${icon}</span><span class="ap-nav-text"><strong>${title}</strong><small>${detail}</small></span><span class="sp-chevron">›</span></button>`;
  }

  function renderHome() {
    const types = app.getPaymentTypes();
    body.innerHTML = `
      <div class="ap-profile-card">
        ${avatarHtml(user.name, user.avatar, 'ua-lg')}
        <div class="ap-profile-text"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(accessSummary(permissions, user.role))}</small></div>
        <button class="sp-btn sp-btn-small" type="button" data-go="profile">Edit</button>
      </div>
      <div class="sp-toolbar"><span class="sp-section-label">ACCOUNT</span></div>
      <div class="ap-nav-list">
        ${navRow('profile', ICONS.user, 'Name &amp; photo', 'Change your display name and profile picture')}
        ${navRow('password', ICONS.key, 'Password', 'Change the access key you sign in with')}
      </div>
      ${isOwner() ? `
      <div class="sp-toolbar"><span class="sp-section-label">WORKSPACE · OWNER</span></div>
      <div class="ap-nav-list">
        ${navRow('types', ICONS.tag, 'Payment types', `${types.filter(type => type.use_in_expenses || type.use_in_received).length} in use · Cash, Bank, Card…`)}
        ${navRow('users', ICONS.users, 'Users &amp; access', 'Create, edit, disable or delete access keys')}
      </div>` : ''}
      <div class="ap-signout"><button class="sp-btn" type="button" data-action="signout">${ICONS.out} Sign out</button></div>`;
  }

  function renderProfile() {
    const shownAvatar = pendingAvatar === undefined ? user.avatar : pendingAvatar;
    body.innerHTML = `
      ${back()}
      <form class="sp-form" data-form="profile" novalidate>
        <div class="ap-avatar-edit">
          ${avatarHtml(user.name, shownAvatar, 'ua-xl')}
          <div class="ap-avatar-actions">
            <label class="sp-btn sp-btn-small ap-file">Upload photo<input type="file" accept="image/*" data-role="photo" hidden></label>
            ${shownAvatar ? '<button class="sp-btn sp-btn-small ap-danger-small" type="button" data-action="remove-photo">Remove</button>' : ''}
            <p class="sp-help">JPG, PNG or WebP. You can crop and move it before saving.</p>
          </div>
        </div>
        <div class="sp-field"><label for="apName">Display name</label><input id="apName" name="name" type="text" maxlength="60" value="${escapeHtml(user.name)}" autocomplete="name" required></div>
        ${message()}
        <div class="sp-actions"><button class="sp-btn sp-btn-primary" type="submit">Save</button><button class="sp-btn" type="button" data-go="home">Cancel</button></div>
      </form>`;
  }

  function renderPassword() {
    body.innerHTML = `
      ${back()}
      <form class="sp-form" data-form="password" novalidate>
        <p class="sp-help">Access keys are 8–32 digits. After changing it, use the new key next time you sign in on any device.</p>
        <div class="sp-field"><label for="apCurrent">Current key</label><input id="apCurrent" type="password" inputmode="numeric" autocomplete="current-password" required></div>
        <div class="sp-field"><label for="apNew">New key</label><input id="apNew" type="password" inputmode="numeric" autocomplete="new-password" minlength="8" maxlength="32" required></div>
        <div class="sp-field"><label for="apConfirm">Confirm new key</label><input id="apConfirm" type="password" inputmode="numeric" autocomplete="new-password" minlength="8" maxlength="32" required></div>
        ${message()}
        <div class="sp-actions"><button class="sp-btn sp-btn-primary" type="submit">Change key</button><button class="sp-btn" type="button" data-go="home">Cancel</button></div>
      </form>`;
  }

  function renderTypes() {
    const types = app.getPaymentTypes();
    const managed = app.paymentTypesManaged();
    body.innerHTML = `
      ${back()}
      ${managed ? '' : '<p class="ap-note ap-note-warn">Run SQL migration 014 to add and manage payment types. Until then only Cash and Bank are available.</p>'}
      <p class="sp-help">Tick where each type can be chosen. Unticking only hides it from the list; rows that already use it keep it. Only types that <strong>count as cash</strong> change Available Cash.</p>
      <div class="ap-types">
        ${types.map(type => `
          <div class="ap-type" data-type="${escapeHtml(type.name)}">
            <div class="ap-type-head">
              <strong>${escapeHtml(type.name)}</strong>
              ${type.is_system ? '<span class="sp-chip sp-chip-grey">Built-in</span>' : ''}
              ${type.counts_as_cash ? '<span class="sp-chip sp-chip-green">Counts as cash</span>' : ''}
              ${type.is_system ? '' : `<button class="sp-icon-btn sp-icon-btn-danger ap-type-delete" type="button" data-action="delete-type" title="Delete ${escapeHtml(type.name)}" aria-label="Delete ${escapeHtml(type.name)}" ${managed ? '' : 'disabled'}>✕</button>`}
            </div>
            <div class="ap-type-options">
              <label class="ap-check"><input type="checkbox" data-flag="use_in_expenses" ${type.use_in_expenses ? 'checked' : ''} ${managed ? '' : 'disabled'}> Expenses</label>
              <label class="ap-check"><input type="checkbox" data-flag="use_in_received" ${type.use_in_received ? 'checked' : ''} ${managed ? '' : 'disabled'}> Received</label>
              <label class="ap-check ap-switch" title="${type.name === 'Cash' ? 'Cash always counts as cash' : 'Include this type in Available Cash'}"><input type="checkbox" data-flag="counts_as_cash" ${type.counts_as_cash ? 'checked' : ''} ${managed && type.name !== 'Cash' ? '' : 'disabled'}> Counts as cash</label>
            </div>
          </div>`).join('')}
      </div>
      <form class="ap-add-type" data-form="add-type" novalidate>
        <input type="text" maxlength="30" placeholder="New type, e.g. Cheque" aria-label="New payment type" ${managed ? '' : 'disabled'}>
        <button class="sp-btn sp-btn-primary" type="submit" ${managed ? '' : 'disabled'}>Add</button>
      </form>
      ${message()}`;
  }

  async function renderUsers() {
    body.innerHTML = `
      ${back()}
      <div class="sp-toolbar"><span class="sp-section-label">USERS</span><button class="sp-btn sp-btn-small" type="button" data-action="new-user">+ New user</button></div>
      <div class="ap-owner-row">${avatarHtml(user.name, user.avatar, 'ua-md')}<div class="sp-item-text"><strong>${escapeHtml(user.name)} <span class="sp-chip sp-chip-blue">You · Owner</span></strong><small>Full access to everything</small></div></div>
      <div class="sp-list" data-role="users">${users ? '' : '<p class="muted sp-empty">Loading users…</p>'}</div>
      ${message()}`;
    if (users) { paintUsers(); return; }
    try {
      const result = await app.callAccess('list_keys');
      users = result.keys || [];
      if (view === 'users') paintUsers();
    } catch (error) {
      if (view === 'users') say(friendlyError(error));
    }
  }

  function paintUsers() {
    const list = body.querySelector('[data-role="users"]');
    if (!list) return;
    if (!users.length) {
      list.innerHTML = '<p class="muted sp-empty">No other users yet. Select “+ New user” to create an access key for someone.</p>';
      return;
    }
    list.innerHTML = users.map(item => {
      const name = item.name || item.label || 'User';
      const perms = item.permissions || { cash_vault: item.can_write ? 'edit' : 'view', expenses: item.can_write ? 'edit' : 'view', received: item.can_write ? 'edit' : 'view' };
      return `<div class="sp-item${item.is_active ? '' : ' ap-inactive'}">
        <button class="sp-item-main" type="button" data-action="edit-user" data-id="${escapeHtml(item.id)}">
          ${avatarHtml(name, item.avatar, 'ua-md')}
          <span class="sp-item-text"><strong>${escapeHtml(name)} ${item.is_active ? '' : '<span class="sp-chip sp-chip-red">Disabled</span>'}</strong><small>${escapeHtml(accessSummary(perms, 'alternate'))}</small><small>${escapeHtml(formatDateTime(item.last_login_at))}</small></span>
          <span class="sp-chevron">›</span>
        </button>
      </div>`;
    }).join('');
  }

  function startUserForm(item) {
    if (!item) {
      editing = { mode: 'create', name: '', permissions: { cash_vault: 'view', expenses: 'edit', received: 'edit', export: true, import: true }, is_active: true };
    } else {
      const perms = item.permissions || { cash_vault: item.can_write ? 'edit' : 'view', expenses: item.can_write ? 'edit' : 'view', received: item.can_write ? 'edit' : 'view', export: true, import: item.can_write };
      editing = { mode: 'edit', id: item.id, name: item.name || item.label || '', permissions: { ...perms }, is_active: item.is_active !== false, avatar: item.avatar };
    }
    show('user');
  }

  function renderUser() {
    const form = editing;
    const perms = form.permissions;
    const importAllowed = perms.expenses === 'edit';
    body.innerHTML = `
      ${back('users', 'Users')}
      <form class="sp-form" data-form="user" novalidate>
        ${form.mode === 'edit' ? `<div class="ap-profile-card ap-profile-card-flat">${avatarHtml(form.name, form.avatar, 'ua-md')}<div class="ap-profile-text"><strong>${escapeHtml(form.name)}</strong><small>${form.is_active ? 'Active' : 'Disabled: cannot sign in'}</small></div></div>` : ''}
        <div class="sp-field"><label for="apUserName">Name</label><input id="apUserName" type="text" maxlength="60" value="${escapeHtml(form.name)}" placeholder="e.g. Imran (Accounts)" required></div>
        <div class="sp-field"><label for="apUserKey">${form.mode === 'create' ? 'Access key' : 'New access key <span class="sp-optional">(optional, only to reset it)</span>'}</label><input id="apUserKey" type="password" inputmode="numeric" autocomplete="new-password" maxlength="32" placeholder="8–32 digits"></div>
        <div class="sp-field"><label for="apUserKey2">Confirm key</label><input id="apUserKey2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="32"></div>

        <div class="sp-toolbar ap-tight"><span class="sp-section-label">ACCESS</span></div>
        <div class="ap-perms">
          ${SECTIONS.map(section => `
            <div class="ap-perm-row">
              <span class="ap-perm-label">${section.label}${section.hint ? `<small>${section.hint}</small>` : ''}</span>
              <div class="ap-seg" role="radiogroup" aria-label="${section.label} access" data-section="${section.key}">
                ${['none', 'view', 'edit'].map(level => `<button type="button" role="radio" aria-checked="${perms[section.key] === level}" class="${perms[section.key] === level ? 'on' : ''}" data-level="${level}">${LEVEL_LABEL[level]}</button>`).join('')}
              </div>
            </div>`).join('')}
          <label class="ap-check"><input type="checkbox" data-perm="export" ${perms.export ? 'checked' : ''}> Can download the Excel file</label>
          <label class="ap-check ${importAllowed ? '' : 'ap-disabled'}"><input type="checkbox" data-perm="import" ${perms.import && importAllowed ? 'checked' : ''} ${importAllowed ? '' : 'disabled'}> Can import RTA receipts <small>(needs Expenses: Edit)</small></label>
        </div>
        ${message()}
        <div class="sp-actions"><button class="sp-btn sp-btn-primary" type="submit">${form.mode === 'create' ? 'Create user' : 'Save changes'}</button><button class="sp-btn" type="button" data-go="users">Cancel</button></div>

        ${form.mode === 'edit' ? `
        <div class="ap-danger-zone">
          <div><strong>${form.is_active ? 'Disable this user' : 'Enable this user'}</strong><small>${form.is_active ? 'They are signed out and cannot sign in until enabled again.' : 'They can sign in again with their key.'}</small></div>
          <button class="sp-btn" type="button" data-action="toggle-active">${form.is_active ? 'Disable' : 'Enable'}</button>
        </div>
        <div class="ap-danger-zone ap-danger-zone-red">
          <div><strong>Delete this user</strong><small>Removes the key permanently. Entries they created are kept.</small></div>
          <button class="sp-btn ap-btn-danger" type="button" data-action="delete-user">Delete</button>
        </div>` : ''}
      </form>`;
  }

  function renderCrop() {
    body.innerHTML = `
      ${back('profile', 'Name & photo')}
      <div class="ap-crop-wrap">
        <div class="ap-crop" data-role="crop"><canvas width="560" height="560"></canvas><div class="ap-crop-mask" aria-hidden="true"></div></div>
        <div class="ap-zoom"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom" data-role="zoom"><span aria-hidden="true">+</span></div>
        <div class="sp-actions ap-center"><button class="sp-btn sp-btn-primary" type="button" data-action="use-photo">Use this photo</button><button class="sp-btn" type="button" data-go="profile">Cancel</button></div>
      </div>`;
  }

  // ---- Photo cropper --------------------------------------------------------------
  async function loadImage(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fall back */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      return image;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }

  function createCropper(container, slider, source) {
    const canvas = container.querySelector('canvas');
    const context = canvas.getContext('2d');
    const size = canvas.width;
    const width = source.width;
    const height = source.height;
    const baseScale = Math.max(size / width, size / height); // image always covers the frame
    let zoom = 1;
    let x = 0; // offset of the image centre from the frame centre (canvas pixels)
    let y = 0;
    let frame = 0;
    let dragging = null;

    function clamp() {
      const scale = baseScale * zoom;
      const maxX = Math.max(0, (width * scale - size) / 2);
      const maxY = Math.max(0, (height * scale - size) / 2);
      x = Math.min(maxX, Math.max(-maxX, x));
      y = Math.min(maxY, Math.max(-maxY, y));
    }

    function draw() {
      frame = 0;
      const scale = baseScale * zoom;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, size / 2 + x - (width * scale) / 2, size / 2 + y - (height * scale) / 2, width * scale, height * scale);
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };

    function setZoom(next) {
      const previous = zoom;
      zoom = Math.min(4, Math.max(1, next));
      x *= zoom / previous;
      y *= zoom / previous;
      slider.value = String(zoom);
      clamp();
      schedule();
    }

    const ratio = () => size / container.getBoundingClientRect().width;
    const onDown = event => {
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
      container.setPointerCapture(event.pointerId);
      container.classList.add('grabbing');
    };
    const onMove = event => {
      if (!dragging || dragging.id !== event.pointerId) return;
      const factor = ratio();
      x += (event.clientX - dragging.x) * factor;
      y += (event.clientY - dragging.y) * factor;
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      clamp();
      schedule();
    };
    const onUp = () => { dragging = null; container.classList.remove('grabbing'); };
    const onWheel = event => { event.preventDefault(); setZoom(zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)); };
    const onSlider = () => setZoom(Number(slider.value));

    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    slider.addEventListener('input', onSlider);
    draw();

    return {
      // 256×256 photo, WebP (or JPEG where WebP is not supported): about 10–30 KB.
      export() {
        const out = document.createElement('canvas');
        out.width = 256;
        out.height = 256;
        const outContext = out.getContext('2d');
        outContext.imageSmoothingQuality = 'high';
        outContext.drawImage(canvas, 0, 0, size, size, 0, 0, 256, 256);
        const webp = out.toDataURL('image/webp', 0.86);
        return webp.startsWith('data:image/webp') ? webp : out.toDataURL('image/jpeg', 0.88);
      },
      destroy() {
        if (frame) cancelAnimationFrame(frame);
        container.removeEventListener('wheel', onWheel);
        slider.removeEventListener('input', onSlider);
        source.close?.();
      }
    };
  }

  // ---- Actions --------------------------------------------------------------------
  body.addEventListener('click', async event => {
    const go = event.target.closest('[data-go]');
    if (go) { if (go.dataset.go === 'profile' && view !== 'crop') pendingAvatar = undefined; show(go.dataset.go); return; }
    const button = event.target.closest('[data-action]');
    if (!button || busy) return;
    const action = button.dataset.action;
    if (action === 'signout') { close(); app.signOut(); }
    else if (action === 'remove-photo') { pendingAvatar = null; renderProfile(); }
    else if (action === 'use-photo' && cropper) { pendingAvatar = cropper.export(); show('profile'); }
    else if (action === 'new-user') startUserForm(null);
    else if (action === 'edit-user') startUserForm(users?.find(item => item.id === button.dataset.id));
    else if (action === 'toggle-active') await toggleActive();
    else if (action === 'delete-user') await deleteUser();
    else if (action === 'delete-type') await deleteType(button.closest('[data-type]').dataset.type);
  });

  body.addEventListener('click', event => {
    const segment = event.target.closest('.ap-seg button');
    if (segment) setLevel(segment.closest('.ap-seg').dataset.section, segment.dataset.level);
  });

  // Updates the segmented control in place (no re-render, so typed keys stay).
  function setLevel(section, level) {
    if (!editing) return;
    editing.permissions[section] = level;
    const group = body.querySelector(`.ap-seg[data-section="${section}"]`);
    group?.querySelectorAll('button').forEach(button => {
      const on = button.dataset.level === level;
      button.classList.toggle('on', on);
      button.setAttribute('aria-checked', String(on));
    });
    const importBox = body.querySelector('input[data-perm="import"]');
    if (importBox) {
      const allowed = editing.permissions.expenses === 'edit';
      importBox.disabled = !allowed;
      if (!allowed) { importBox.checked = false; editing.permissions.import = false; }
      importBox.closest('label').classList.toggle('ap-disabled', !allowed);
    }
  }

  function readUserFormInputs() {
    if (!editing) return;
    const name = body.querySelector('#apUserName');
    if (name) editing.name = name.value;
    body.querySelectorAll('[data-perm]').forEach(box => { editing.permissions[box.dataset.perm] = box.checked; });
    if (editing.permissions.expenses !== 'edit') editing.permissions.import = false;
  }

  body.addEventListener('change', async event => {
    const photo = event.target.closest('input[data-role="photo"]');
    if (photo?.files?.[0]) {
      const file = photo.files[0];
      photo.value = '';
      if (!/^image\//.test(file.type)) { say('Please choose an image file.'); return; }
      if (file.size > 20 * 1024 * 1024) { say('That image is larger than 20 MB. Choose a smaller one.'); return; }
      try {
        const source = await loadImage(file);
        show('crop');
        cropper = createCropper(body.querySelector('[data-role="crop"]'), body.querySelector('[data-role="zoom"]'), source);
      } catch (_) {
        say('This image could not be opened. Try a JPG or PNG.');
      }
      return;
    }
    const flag = event.target.closest('input[data-flag]');
    if (flag) { await updateTypeFlag(flag.closest('[data-type]').dataset.type, flag.dataset.flag, flag.checked, flag); return; }
    const perm = event.target.closest('input[data-perm]');
    if (perm && editing) { editing.permissions[perm.dataset.perm] = perm.checked; }
  });

  body.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const form = event.target.dataset.form;
    if (form === 'profile') await saveProfile();
    else if (form === 'password') await changePassword();
    else if (form === 'add-type') await addType(event.target.querySelector('input').value);
    else if (form === 'user') await saveUser();
  });

  async function withBusy(task) {
    busy = true;
    body.querySelectorAll('button, input').forEach(node => { node.dataset.wasDisabled = node.disabled ? '1' : ''; node.disabled = true; });
    try { return await task(); } finally {
      busy = false;
      // Only restore controls that existed before the task (a re-render creates new
      // ones with their own correct disabled state, e.g. Cash's "counts as cash").
      body.querySelectorAll('button, input').forEach(node => {
        if (!('wasDisabled' in node.dataset)) return;
        node.disabled = node.dataset.wasDisabled === '1';
        delete node.dataset.wasDisabled;
      });
    }
  }

  async function saveProfile() {
    const name = body.querySelector('#apName').value.replace(/\s+/g, ' ').trim();
    if (!name) { say('Enter a display name.'); return; }
    const payload = { name };
    if (pendingAvatar !== undefined) payload.avatar = pendingAvatar;
    await withBusy(async () => {
      try {
        const result = await app.callAccess('update_profile', payload);
        const profile = result.profile || {};
        user = { ...user, name: profile.name || name, avatar: 'avatar' in payload ? payload.avatar : user.avatar };
        pendingAvatar = undefined;
        app.onProfileChanged(user);
        renderChip();
        app.showToast('Profile saved.');
        show('home');
      } catch (error) { say(friendlyError(error)); }
    });
  }

  async function changePassword() {
    const current = body.querySelector('#apCurrent').value.trim();
    const next = body.querySelector('#apNew').value.trim();
    const confirm = body.querySelector('#apConfirm').value.trim();
    if (!/^\d{8,32}$/.test(current)) { say('Enter your current key (8–32 digits).'); return; }
    if (!/^\d{8,32}$/.test(next)) { say('The new key must be 8–32 digits.'); return; }
    if (next !== confirm) { say('The new key and confirmation do not match.'); return; }
    if (next === current) { say('The new key must be different from the current key.'); return; }
    await withBusy(async () => {
      try {
        await app.callAccess('change_key', { current_key: current, new_key: next });
        body.querySelector('form').reset();
        say('Key changed. Use the new key next time you sign in.', true);
        app.showToast('Access key changed.');
      } catch (error) { say(friendlyError(error)); }
    });
  }

  // Payment types: saved straight away; the sheets update immediately.
  async function updateTypeFlag(name, flag, value, input) {
    await withBusy(async () => {
      try {
        await app.updatePaymentType(name, { [flag]: value });
        renderTypes();
      } catch (error) {
        input.checked = !value;
        say(friendlyError(error));
      }
    });
  }

  async function addType(raw) {
    const name = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!name) { say('Type a name for the new payment type.'); return; }
    if (name.length > 30) { say('Payment type names can be up to 30 characters.'); return; }
    if (app.getPaymentTypes().some(type => type.name.toLowerCase() === name.toLowerCase())) { say(`“${name}” already exists. Tick it above to use it.`); return; }
    await withBusy(async () => {
      try {
        await app.addPaymentType(name);
        renderTypes();
        say(`“${name}” added and enabled for Expenses and Received.`, true);
      } catch (error) { say(friendlyError(error)); }
    });
  }

  async function deleteType(name) {
    if (!window.confirm(`Delete the payment type “${name}”?`)) return;
    await withBusy(async () => {
      try {
        await app.deletePaymentType(name);
        renderTypes();
        say(`“${name}” deleted.`, true);
      } catch (error) {
        const text = error?.message || '';
        say(/foreign key|still referenced|violates/i.test(text)
          ? `“${name}” is used by existing entries, so it can’t be deleted. Untick Expenses and Received to hide it instead.`
          : friendlyError(error));
      }
    });
  }

  async function saveUser() {
    readUserFormInputs();
    const name = editing.name.replace(/\s+/g, ' ').trim();
    const key = body.querySelector('#apUserKey').value.trim();
    const confirm = body.querySelector('#apUserKey2').value.trim();
    if (!name) { say('Enter the user’s name.'); return; }
    if (editing.mode === 'create' || key) {
      if (!/^\d{8,32}$/.test(key)) { say('The access key must be 8–32 digits.'); return; }
      if (key !== confirm) { say('The key and confirmation do not match.'); return; }
    }
    if (SECTIONS.every(section => editing.permissions[section.key] === 'none')) { say('Give the user access to at least one section.'); return; }
    const perms = { ...editing.permissions };
    await withBusy(async () => {
      try {
        if (editing.mode === 'create') {
          await app.callAccess('create_alternate', { name, key, permissions: perms });
          app.showToast(`User “${name}” created. Share the key with them securely.`);
        } else {
          const payload = { key_id: editing.id, name, permissions: perms };
          if (key) payload.new_key = key;
          await app.callAccess('update_alternate', payload);
          app.showToast(`“${name}” updated.`);
        }
        users = null;
        editing = null;
        show('users');
      } catch (error) { say(friendlyError(error)); }
    });
  }

  async function toggleActive() {
    const enable = !editing.is_active;
    if (!enable && !window.confirm(`Disable “${editing.name}”? They are signed out and can’t sign in until you enable them again.`)) return;
    await withBusy(async () => {
      try {
        await app.callAccess('update_alternate', { key_id: editing.id, is_active: enable });
        editing.is_active = enable;
        users = null;
        app.showToast(enable ? `“${editing.name}” can sign in again.` : `“${editing.name}” has been disabled.`);
        renderUser();
      } catch (error) { say(friendlyError(error)); }
    });
  }

  async function deleteUser() {
    if (!window.confirm(`Delete “${editing.name}” permanently?\n\nTheir access key stops working immediately. Entries they created are kept.`)) return;
    await withBusy(async () => {
      try {
        await app.callAccess('remove_alternate', { key_id: editing.id });
        app.showToast(`“${editing.name}” deleted.`);
        users = null;
        editing = null;
        show('users');
      } catch (error) { say(friendlyError(error)); }
    });
  }

  return {
    setUser(nextUser, nextPermissions) {
      user = nextUser;
      permissions = nextPermissions;
      users = null;
      renderChip();
    },
    open,
    close
  };
}
