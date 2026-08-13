/*
 * Runs at document_start, before HN's markup is parsed.
 *
 * Two jobs, both of which have to happen before first paint:
 *
 *  - Mark the document as pending so the stylesheet can hide the raw HN markup
 *    while hn.js rewrites it. Putting the flag here rather than in CSS means a
 *    page where the content script never runs is never hidden at all, and the
 *    stylesheet's failsafe animation reveals the page even if hn.js throws.
 *  - Apply the saved theme, view density and palette. The storage read is async,
 *    so it can land after paint; that is harmless because the body is still
 *    hidden, and an unset value falls through to the stylesheet's own default —
 *    prefers-color-scheme for theme, comfortable for density, classic for palette.
 */
(function () {
  var root = document.documentElement;
  if (!root) return;

  root.classList.add('hnes-pending');

  /*
   * Mirrors HN.MODES in hn.js — deliberately, not accidentally. This script runs
   * at document_start, before hn.js exists, so it cannot read hn.js's copy; the
   * reverse direction does work, which is what window.hnesModes below is for.
   * Same convention, so the two stay comparable at a glance: values[0] is the
   * unset state and leaves the attribute off. Adding a mode means adding it in
   * both places, or it works after paint and flashes on every cold load.
   */
  var MODES = [
    { key: 'hnesTheme',   attr: 'data-hnes-theme',   values: ['auto', 'light', 'dark'] },
    { key: 'hnesDensity', attr: 'data-hnes-density', values: ['comfortable', 'compact', 'flow'] },
    { key: 'hnesPalette', attr: 'data-hnes-palette', values: ['classic', 'newsprint', 'ember', 'slate', 'letterpress'] }
  ];

  /*
   * Published for hn.js, which needs the same three values to label the nav
   * controls: content scripts of one extension share an isolated world, so this
   * saves a second round trip to the same keys. It matters beyond the trip —
   * hn.js reveals the page immediately after building the controls, so a fresh
   * storage read lands after the reveal and the controls visibly pop in, while a
   * promise settled back here resolves in the same microtask checkpoint and they
   * arrive before the first paint. Always assigned, and never rejects, so the
   * consumer has one path rather than two.
   */
  window.hnesModes = new Promise(function (resolve) {
    try {
      chrome.storage.local.get(MODES.map(function (m) { return m.key; }), function (items) {
        MODES.forEach(function (m) {
          var value = items && items[m.key];
          if (m.values.indexOf(value) > 0) root.setAttribute(m.attr, value);
        });
        resolve(items || {});
      });
    } catch (e) {
      /* Storage unavailable — the stylesheet's own defaults still apply. */
      resolve({});
    }
  });
})();
