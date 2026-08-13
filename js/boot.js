/*
 * Runs at document_start, before HN's markup is parsed.
 *
 * Two jobs, both of which have to happen before first paint:
 *
 *  - Mark the document as pending so the stylesheet can hide the raw HN markup
 *    while hn.js rewrites it. Putting the flag here rather than in CSS means a
 *    page where the content script never runs is never hidden at all, and the
 *    stylesheet's failsafe animation reveals the page even if hn.js throws.
 *  - Apply the saved theme override and view density. The storage read is async,
 *    so it can land after paint; that is harmless because the body is still
 *    hidden, and an unset theme just falls through to prefers-color-scheme
 *    while an unset density falls through to comfortable.
 */
(function () {
  var root = document.documentElement;
  if (!root) return;

  root.classList.add('hnes-pending');

  /*
   * Mirrors HN.MODES in hn.js — deliberately, not accidentally: this is a
   * separate content script at document_start, so it cannot read hn.js's copy.
   * Same convention, so the two stay comparable at a glance: values[0] is the
   * unset state and leaves the attribute off. Adding a mode means adding it in
   * both places, or it works after paint and flashes on every cold load.
   */
  var MODES = [
    { key: 'hnesTheme',   attr: 'data-hnes-theme',   values: ['auto', 'light', 'dark'] },
    { key: 'hnesDensity', attr: 'data-hnes-density', values: ['comfortable', 'compact', 'flow'] }
  ];

  try {
    chrome.storage.local.get(MODES.map(function (m) { return m.key; }), function (items) {
      MODES.forEach(function (m) {
        var value = items && items[m.key];
        if (m.values.indexOf(value) > 0) root.setAttribute(m.attr, value);
      });
    });
  } catch (e) {
    /* Storage unavailable — prefers-color-scheme and comfortable still apply. */
  }
})();
