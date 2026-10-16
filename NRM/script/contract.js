(() => {
'use strict';
const CFG = window.NRM_CONFIG || {};
const $ = id => document.getElementById(id);
const STORAGE_KEY = 'nrm_secure_session_v2';
const contractId = new URLSearchParams(window.location.search).get('id') || '';

async function api(fn, payload = {}) {
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) throw new Error('Supabase configuration is missing.');
  let res;
  try {
    res = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: CFG.supabaseAnonKey,
        Authorization: `Bearer ${CFG.supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
  } catch (_) {
    throw new Error('Cannot connect to the contract database. Check your internet connection.');
  }
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(body?.message || body?.hint || body?.details || `Request failed (${res.status}).`);
  return body;
}

function fitPage() {
  const requiredWidth = 210 * 3.7795 + 30;
  $('sheets').style.zoom = window.innerWidth < requiredWidth ? (window.innerWidth / requiredWidth) : 1;
}

function setError(message) {
  $('accessError').textContent = message || '';
  $('contractState').textContent = message ? 'Access required' : 'Checking access…';
}

function applySnapshot(page, snapshot) {
  const fields = snapshot?.fields || {};
  for (const [id, value] of Object.entries(fields)) {
    const el = [...page.querySelectorAll('[id]')].find(candidate => candidate.id === id);
    if (!el) continue;
    if ('value' in el) el.value = value == null ? '' : String(value);
    else el.textContent = value == null ? '' : String(value);
  }
  const history = snapshot?.history || {};
  for (const [key, values] of Object.entries(history)) {
    const elements = [...page.querySelectorAll('[data-h]')].filter(el => el.dataset.h === key);
    elements.forEach((el, index) => { el.value = values?.[index] == null ? '' : String(values[index]); });
  }

  // Remove creation-only controls, then lock every remaining field against changes.
  page.querySelectorAll('#saveCnoBtn, .rplan, .dd, button').forEach(el => el.remove());
  page.querySelectorAll('input, textarea').forEach(el => {
    el.readOnly = true;
    el.tabIndex = -1;
    el.setAttribute('aria-readonly', 'true');
  });
  page.querySelectorAll('select').forEach(el => { el.disabled = true; el.tabIndex = -1; });
}

async function renderSavedContract(token) {
  const session = await api('nrm_validate_session', { p_token: token });
  if (!session?.valid) {
    const err = new Error('Admin session is not valid. Enter the access key to continue.');
    err.invalidSession = true;
    throw err;
  }
  const record = await api('nrm_get_contract', { p_token: token, p_contract_id: contractId });
  if (!record?.snapshot) throw new Error(record?.message || 'Saved contract not found.');

  // Use the same agreement HTML as the live form so spacing and A4 printing remain identical.
  const response = await fetch('index.html', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load the agreement template.');
  const source = new DOMParser().parseFromString(await response.text(), 'text/html');
  const sourcePage = source.querySelector('#contractView .page, .page');
  if (!sourcePage) throw new Error('The agreement template could not be found.');
  const page = document.importNode(sourcePage, true);
  applySnapshot(page, record.snapshot);
  $('sheets').replaceChildren(page);
  $('contractHeading').textContent = `Saved Contract · CNo. ${record.contract_no}`;
  $('contractState').textContent = 'Authenticated · Read-only';
  document.title = `Contract ${record.contract_no} | Rental Agreement`;
  document.body.classList.remove('locked');
  $('authGate').hidden = true;
  fitPage();
}

async function tryStoredSession() {
  const token = localStorage.getItem(STORAGE_KEY) || '';
  if (!token) {
    $('accessKey').focus();
    setError('Enter the admin access key to load this contract.');
    return;
  }
  setError('');
  try {
    await renderSavedContract(token);
  } catch (err) {
    if (err.invalidSession) localStorage.removeItem(STORAGE_KEY);
    setError(err.message || 'Could not load the saved contract.');
    $('accessKey').focus();
  }
}

async function unlockWithKey(key) {
  $('unlockBtn').disabled = true;
  $('unlockBtn').textContent = 'Checking…';
  setError('');
  try {
    const result = await api('nrm_login', { p_key: key });
    if (!result?.ok || !result?.token) throw new Error(result?.message || 'Invalid admin access key.');
    // Store only the revocable session token, never the raw access key.
    localStorage.setItem(STORAGE_KEY, result.token);
    $('accessKey').value = '';
    await renderSavedContract(result.token);
  } catch (err) {
    setError(err.message || 'Could not unlock this contract.');
  } finally {
    $('unlockBtn').disabled = false;
    $('unlockBtn').textContent = 'Unlock contract';
  }
}

$('accessForm').addEventListener('submit', event => {
  event.preventDefault();
  const key = $('accessKey').value;
  if (!key) { setError('Enter the admin access key.'); return; }
  unlockWithKey(key);
});
$('printBtn').addEventListener('click', () => window.print());
$('backBtn').addEventListener('click', () => { window.location.href = 'index.html?view=existing'; });
window.addEventListener('resize', fitPage);

if (!contractId) {
  setError('No saved contract was selected. Open a contract from the Existing Contracts list.');
  $('accessForm').hidden = true;
} else {
  tryStoredSession();
}
})();
