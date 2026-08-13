/*
 * Runs only during the one-time MV2 -> MV3 storage migration. A service worker has no
 * localStorage, but this document shares the extension origin and can still read the
 * store the MV2 background page wrote.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') return;
  if (message.method !== 'readLegacyStorage') return;

  // Same index walk as snapshotLocalStorage() in background.js; duplicated
  // because this document has no way to import from the worker.
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    out[key] = localStorage.getItem(key);
  }
  sendResponse(out);
});
