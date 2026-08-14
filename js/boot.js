/*
 * Runs at document_start, before HN's markup is parsed.
 *
 * Two jobs, both of which have to happen before first paint:
 *
 *  - Mark the document as pending so the stylesheet can hide the raw HN markup
 *    while hn.js rewrites it. Putting the flag here rather than in CSS means a
 *    page where the content script never runs is never hidden at all, and the
 *    stylesheet's failsafe animation reveals the page even if hn.js throws.
 *  - Start the settings read and apply the painting ones — theme, view density
 *    and palette. The read is async, so it can land after paint; that is
 *    harmless because the body is still hidden, and an unset value falls
 *    through to the stylesheet's own default — prefers-color-scheme for theme,
 *    comfortable for density, classic for palette.
 *
 * Issuing that read here rather than in hn.js is also what keeps it off the
 * critical path: it is in flight while HN's markup is parsing, so hn.js's
 * HNESModes.ready() at document_end almost always resolves without waiting.
 *
 * The settings themselves live in modes.js, which the manifest injects just
 * ahead of this file; hn.js and its settings panel read the same one.
 */
(function () {
  var root = document.documentElement;
  if (!root) return;

  root.classList.add('hnes-pending');

  var MODES = globalThis.HNESModes;
  if (!MODES) return;

  MODES.load(function (items) { MODES.applyAll(root, items); });
  MODES.watch(root);
})();
