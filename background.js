/*
 * HNES background worker.
 *
 * Chrome runs this as an MV3 service worker, Firefox as an event page. Content
 * scripts reach chrome.storage.local directly and the options page asks for its
 * permission itself, so the one message it answers is "open the options page":
 * a content script can neither call openOptionsPage nor link to an extension
 * page that is not web-accessible. The rest is one-time maintenance (rescuing
 * the MV2 localStorage store, sweeping expired entries) and keeping the optional
 * hn.algolia.com content scripts in step with the permission that allows them.
 */

const MIGRATION_FLAG = 'hnesMigratedFromLocalStorage';
const OFFSCREEN_URL = 'offscreen.html';

const ALGOLIA_ORIGIN = 'https://hn.algolia.com/*';
const ALGOLIA_SCRIPT_ID = 'hnes-algolia';

chrome.runtime.onInstalled.addListener(() => {
  migrateLegacyStorage()
    .then(() => expireOldEntries())
    .catch(e => console.error('HNES: maintenance failed', e));

  // An install, an update or a plain reload clears every registered content
  // script while the permission grant survives, so the grant has to be read
  // back and the registration rebuilt from it rather than assumed.
  syncAlgoliaScripts().catch(e => console.error('HNES: algolia sync failed', e));
});

chrome.runtime.onStartup.addListener(() => {
  expireOldEntries().catch(e => console.error('HNES: expiry sweep failed', e));
});

chrome.runtime.onMessage.addListener(message => {
  if (message && message.open === 'options') chrome.runtime.openOptionsPage();
});

chrome.permissions.onAdded.addListener(permissions => {
  if (!grantsAlgolia(permissions)) return;
  registerAlgoliaScripts().catch(e => console.error('HNES: algolia register failed', e));
});

chrome.permissions.onRemoved.addListener(permissions => {
  if (!grantsAlgolia(permissions)) return;
  unregisterAlgoliaScripts().catch(e => console.error('HNES: algolia unregister failed', e));
});

function grantsAlgolia(permissions) {
  return !!(permissions && permissions.origins && permissions.origins.includes(ALGOLIA_ORIGIN));
}

/*
 * hn.algolia.com is styled by CSS alone — no hn.js, no jQuery — so the pair
 * that runs is the same document_start pair Hacker News gets: modes.js for the
 * stored settings and boot.js to paint them onto <html> before first paint.
 */
async function registerAlgoliaScripts() {
  /** @type {chrome.scripting.RegisteredContentScript} */
  const script = {
    id: ALGOLIA_SCRIPT_ID,
    matches: [ALGOLIA_ORIGIN],
    css: ['tokens.css', 'algolia.css'],
    js: ['js/modes.js', 'js/boot.js'],
    runAt: 'document_start',
    persistAcrossSessions: true
  };

  // registerContentScripts throws on a duplicate id, and both the onAdded
  // listener and onInstalled can reach here for the same grant.
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [ALGOLIA_SCRIPT_ID] });
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

async function unregisterAlgoliaScripts() {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [ALGOLIA_SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [ALGOLIA_SCRIPT_ID] });
}

async function syncAlgoliaScripts() {
  const granted = await chrome.permissions.contains({ origins: [ALGOLIA_ORIGIN] });
  if (granted) await registerAlgoliaScripts();
  else await unregisterAlgoliaScripts();
}

/*
 * Everything the extension persisted before v2 — user tags, upvote counts, per-thread
 * read positions — lived in the MV2 background page's localStorage, which a service
 * worker cannot see. The data itself survives the upgrade because the extension origin
 * is unchanged, so a document running on that origin can still read and forward it.
 *
 * On failure the flag is deliberately left unset: the localStorage copy is still on
 * disk, so a later run gets another attempt.
 */
async function migrateLegacyStorage() {
  const flag = await chrome.storage.local.get(MIGRATION_FLAG);
  if (flag[MIGRATION_FLAG]) return;

  let legacy;
  try {
    legacy = await readLegacyStorage();
  } catch (e) {
    console.error('HNES: could not read legacy localStorage, will retry later', e);
    return;
  }

  // Only the legacy keys need checking, so this stays bounded even though the
  // collapse-state store can grow to tens of thousands of entries.
  const existing = await chrome.storage.local.get(Object.keys(legacy));
  const toWrite = {};

  for (const key of Object.keys(legacy)) {
    // Never clobber anything the v2 build already wrote (e.g. comment collapse state).
    if (key in existing) continue;
    toWrite[key] = normalizeLegacyValue(legacy[key]);
  }

  console.log(`HNES: migrated ${Object.keys(toWrite).length} entries out of localStorage`);
  toWrite[MIGRATION_FLAG] = true;
  await chrome.storage.local.set(toWrite);
}

/*
 * Upvote counts were originally stored as a bare number ("3") and later as
 * '{"votes":3}'. The lazy converter in hn.js checked `typeof value === "number"`, which
 * localStorage could never satisfy — it always hands back strings — so legacy entries
 * fell through to JSON.parse and became a bare number, whose .votes is undefined. That
 * left those users' scores invisible and stuck. Convert them once, here.
 *
 * Keyed on value shape rather than key shape: a bare run of digits is only ever a
 * legacy vote count. Everything else is a JSON object (thread read-state), a URL, or
 * one of the "true"/"false" flags, so none of them need naming individually — which
 * also means a flag added later cannot be silently reshaped.
 */
function normalizeLegacyValue(value) {
  return /^\d+$/.test(value) ? JSON.stringify({ votes: Number(value) }) : value;
}

async function readLegacyStorage() {
  // Firefox's MV3 event page still has localStorage; only Chrome needs the detour.
  if (typeof localStorage !== 'undefined') return snapshotLocalStorage(localStorage);
  return readLegacyStorageViaOffscreen();
}

/*
 * Walks by index rather than spreading the Storage object: a spread reads own
 * enumerable properties, which misbehaves for keys that collide with Storage's
 * own members (a stored key literally named "length" or "getItem"). offscreen.js
 * inlines the same walk — it runs in its own document and cannot import.
 */
function snapshotLocalStorage(store) {
  const out = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    out[key] = store.getItem(key);
  }
  return out;
}

async function readLegacyStorageViaOffscreen() {
  if (!chrome.offscreen) throw new Error('offscreen API unavailable');

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['LOCAL_STORAGE'],
    justification: 'Read the Manifest V2 background page localStorage so saved user tags, upvote counts and thread read positions survive the upgrade.'
  });

  try {
    return await chrome.runtime.sendMessage({
      target: 'offscreen',
      method: 'readLegacyStorage'
    });
  } finally {
    await chrome.offscreen.closeDocument();
  }
}

/*
 * Thread read-state entries carry a five-day `expire` stamp. The MV2 sweep was written
 * as `(function(){...});` with no trailing call, so it never ran once and stale entries
 * have accumulated for the life of the extension.
 *
 * Comment collapse state is stored as an object rather than a string and has no expiry,
 * so it is skipped here — it still grows without bound.
 */
async function expireOldEntries(snapshot) {
  const all = snapshot || await chrome.storage.local.get(null);
  const now = Date.now();
  const stale = [];

  for (const key of Object.keys(all)) {
    const value = all[key];
    if (typeof value !== 'string') continue;

    let info;
    try {
      info = JSON.parse(value);
    } catch (e) {
      continue;
    }

    if (info && typeof info.expire === 'number' && now > info.expire) stale.push(key);
  }

  if (stale.length) {
    await chrome.storage.local.remove(stale);
    console.log(`HNES: expired ${stale.length} stale entries`);
  }
}
