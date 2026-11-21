/*
 * Expense Vault encrypted login storage.
 *
 * Supabase Auth session JSON (access/refresh tokens) is encrypted with AES-256-GCM
 * before it is written to localStorage. The non-extractable CryptoKey is held in
 * IndexedDB. A random "login marker" (stored in a cookie, mirrored in localStorage)
 * is bound into the encryption, so the saved login survives page refreshes, closed
 * tabs and browser restarts until the person presses Sign out.
 *
 * Sign out removes the marker and the encrypted session, which is the only normal
 * way the login ends. The access PIN is never stored by this module. The marker is
 * a random value, not an authentication credential. This protects stored data from
 * casual plaintext inspection; it is not an XSS boundary because any script
 * executing on this origin can ask Web Crypto to decrypt the session.
 */

const DATABASE_NAME = 'expense-vault-secure-session';
const DATABASE_VERSION = 1;
const KEY_STORE_NAME = 'crypto-keys';
const CRYPTO_KEY_ID = 'supabase-session-aes-gcm-v1';
const ENCRYPTED_STORAGE_PREFIX = 'expense-vault:encrypted-auth:v1:';
export const EXPENSE_VAULT_AUTH_STORAGE_KEY = 'expense-vault-auth-session-v1';
const SESSION_COOKIE_NAME = 'ev_browser_session';
const SESSION_MARKER_STORAGE_KEY = 'expense-vault:login-marker:v1';
// Keep the login marker for a long time; Sign out removes it immediately.
const SESSION_MARKER_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const LEGACY_SUPABASE_SESSION_KEY = 'sb-hmtbalmgpyrnxbifnvzg-auth-token';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const memoryFallback = new Map();
let databasePromise;
let sessionPersistenceStatus = { persisted: false, error: 'No encrypted session has been written yet.' };

function openKeyDatabase() {
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE_NAME)) {
        database.createObjectStore(KEY_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open secure session storage.'));
    request.onblocked = () => reject(new Error('Secure session storage is blocked by another browser tab.'));
  });
  return databasePromise;
}

async function readCryptoKey() {
  const database = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, 'readonly');
    const request = transaction.objectStore(KEY_STORE_NAME).get(CRYPTO_KEY_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Could not read the encryption key.'));
  });
}

async function addCryptoKey(key) {
  const database = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, 'readwrite');
    transaction.objectStore(KEY_STORE_NAME).add(key, CRYPTO_KEY_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the encryption key.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not save the encryption key.'));
  });
}

async function getOrCreateCryptoKey() {
  const existing = await readCryptoKey();
  if (existing) return existing;

  const generated = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // Non-extractable: the raw AES key cannot be exported from IndexedDB.
    ['encrypt', 'decrypt']
  );

  try {
    await addCryptoKey(generated);
    return generated;
  } catch (error) {
    // Two tabs can initialise at once. If the other tab stored the key first,
    // use that winner rather than overwriting it with a different key.
    const winner = await readCryptoKey().catch(() => null);
    if (winner) return winner;
    throw error;
  }
}

function readSessionCookie() {
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const match = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
  if (!match) return null;
  try { return decodeURIComponent(match.slice(prefix.length)) || null; } catch (_) { return null; }
}

function setSessionCookie(value) {
  // A long-lived cookie (not a browser-session one) so a refresh, reopened tab
  // or restarted browser stays signed in until Sign out removes it.
  let cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; SameSite=Strict; Max-Age=${SESSION_MARKER_MAX_AGE_SECONDS}`;
  if (location.protocol === 'https:') cookie += '; Secure';
  document.cookie = cookie;
}

// The marker lives in the cookie and is mirrored in localStorage, so a browser
// that drops or blocks the cookie does not silently log the person out.
function readSessionMarker() {
  const fromCookie = readSessionCookie();
  if (fromCookie) {
    if (safeStorageGet(SESSION_MARKER_STORAGE_KEY) !== fromCookie) safeStorageSet(SESSION_MARKER_STORAGE_KEY, fromCookie);
    return fromCookie;
  }
  const fromStorage = safeStorageGet(SESSION_MARKER_STORAGE_KEY);
  if (fromStorage) {
    setSessionCookie(fromStorage); // re-create the cookie if it went missing
    return fromStorage;
  }
  return null;
}

export function beginBrowserSession() {
  // Reuse the existing login marker so another tab (or an earlier visit) keeps
  // working against the same encrypted session.
  const existingMarker = readSessionMarker();
  if (existingMarker) return existingMarker;

  const marker = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
  setSessionCookie(marker);
  safeStorageSet(SESSION_MARKER_STORAGE_KEY, marker);
  return readSessionMarker() === marker ? marker : null;
}

export function hasBrowserSessionCookie() {
  return Boolean(readSessionMarker());
}

export function clearBrowserSessionCookie() {
  let cookie = `${SESSION_COOKIE_NAME}=; Path=/; SameSite=Strict; Max-Age=0`;
  if (location.protocol === 'https:') cookie += '; Secure';
  document.cookie = cookie;
  safeStorageRemove(SESSION_MARKER_STORAGE_KEY);
}

export function clearLegacyPlaintextSession() {
  try {
    // Older Supabase JS defaults may have left a plain JSON session in this key.
    // Remove only this project's known Supabase Auth key; other local data is untouched.
    localStorage.removeItem(LEGACY_SUPABASE_SESSION_KEY);
    // Also remove a legacy PKCE verifier, if an older SDK build left one.
    localStorage.removeItem(`${LEGACY_SUPABASE_SESSION_KEY}-code-verifier`);
    sessionStorage.removeItem(LEGACY_SUPABASE_SESSION_KEY);
    sessionStorage.removeItem(`${LEGACY_SUPABASE_SESSION_KEY}-code-verifier`);
  } catch (_) {
    // Storage may be disabled by browser privacy settings; the secure adapter
    // then falls back to memory-only session handling.
  }
}

function toBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encryptedStorageKey(key) {
  return `${ENCRYPTED_STORAGE_PREFIX}${key}`;
}

function additionalData(storageKey, browserSessionMarker) {
  return encoder.encode(`ExpenseVault|${storageKey}|${browserSessionMarker}|v1`);
}

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
}

function safeStorageRemove(key) {
  try { localStorage.removeItem(key); } catch (_) { /* Storage may be blocked. */ }
}

export function getEncryptedSessionPersistenceStatus() {
  return { ...sessionPersistenceStatus };
}

export function getEncryptedSessionDiagnostics(storageKey = EXPENSE_VAULT_AUTH_STORAGE_KEY) {
  let indexedDbAvailable = Boolean(globalThis.indexedDB);
  let webCryptoAvailable = Boolean(globalThis.crypto?.subtle);
  let encryptedBlobPresent = Boolean(safeStorageGet(encryptedStorageKey(storageKey)));
  return {
    browserSessionCookiePresent: hasBrowserSessionCookie(),
    encryptedBlobPresent,
    indexedDbAvailable,
    webCryptoAvailable
  };
}

export function createEncryptedBrowserSessionStorage() {
  return {
    async getItem(storageKey) {
      const browserSessionMarker = readSessionMarker();
      const storageKeyName = encryptedStorageKey(storageKey);

      // No login marker means the saved session cannot be unlocked (signed out,
      // or browser data was cleared). Keep any encrypted blob untouched; the
      // next successful sign-in overwrites it with a fresh one.
      if (!browserSessionMarker) {
        memoryFallback.delete(storageKey);
        return null;
      }
      if (memoryFallback.has(storageKey)) return memoryFallback.get(storageKey);

      const savedEnvelope = safeStorageGet(storageKeyName);
      if (!savedEnvelope) return null;

      try {
        const envelope = JSON.parse(savedEnvelope);
        if (envelope.version !== 1 || !envelope.iv || !envelope.ciphertext) throw new Error('Unsupported encrypted session format.');
        const key = await getOrCreateCryptoKey();
        const plaintext = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: fromBase64(envelope.iv),
            additionalData: additionalData(storageKey, browserSessionMarker),
            tagLength: 128
          },
          key,
          fromBase64(envelope.ciphertext)
        );
        return decoder.decode(plaintext);
      } catch (_) {
        // A malformed, tampered, or stale blob must never be treated as a session.
        // Remove only the invalid ciphertext. The marker is not a credential and
        // is cleared only by explicit sign-out or a confirmed invalid auth session.
        safeStorageRemove(storageKeyName);
        memoryFallback.delete(storageKey);
        return null;
      }
    },

    async setItem(storageKey, value) {
      memoryFallback.set(storageKey, value);
      const isAuthSession = storageKey === EXPENSE_VAULT_AUTH_STORAGE_KEY;
      if (isAuthSession) sessionPersistenceStatus = { persisted: false, error: null };
      const browserSessionMarker = readSessionMarker();
      if (!browserSessionMarker) {
        if (isAuthSession) sessionPersistenceStatus.error = 'The browser session cookie could not be created.';
        return;
      }
      if (!globalThis.crypto?.subtle || !globalThis.indexedDB) {
        if (isAuthSession) sessionPersistenceStatus.error = 'This browser does not provide secure Web Crypto and IndexedDB storage.';
        return;
      }

      try {
        const key = await getOrCreateCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv,
            additionalData: additionalData(storageKey, browserSessionMarker),
            tagLength: 128
          },
          key,
          encoder.encode(value)
        );
        const envelope = JSON.stringify({
          version: 1,
          algorithm: 'AES-256-GCM',
          iv: toBase64(iv),
          ciphertext: toBase64(new Uint8Array(ciphertext))
        });
        if (!safeStorageSet(encryptedStorageKey(storageKey), envelope)) {
          // Do not fall back to plaintext if persistent storage is unavailable.
          if (isAuthSession) sessionPersistenceStatus.error = 'The browser blocked localStorage writes.';
          return;
        }
        if (isAuthSession) sessionPersistenceStatus = { persisted: true, error: null };
      } catch (error) {
        // Keep this browser tab working in memory. A reload will request the key
        // again rather than persisting an unencrypted session.
        if (isAuthSession) sessionPersistenceStatus.error = error?.message || 'Secure encryption storage could not be initialized.';
      }
    },

    async removeItem(storageKey) {
      // Supabase may remove its storage item during internal auth cleanup or
      // token refresh recovery. Do not remove the login marker here; explicit
      // application sign-out clears the marker separately.
      memoryFallback.delete(storageKey);
      safeStorageRemove(encryptedStorageKey(storageKey));
    }
  };
}
