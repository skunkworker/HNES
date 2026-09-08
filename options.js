/*
 * The options page's one switch. No jQuery and no inline script: MV3's CSP
 * forbids the second, and this page is too small to want the first.
 *
 * Nothing here registers the content scripts. background.js listens on
 * permissions.onAdded/onRemoved, so the same registration happens whether the
 * grant came from this switch or from the browser's own permission UI.
 */
(function () {
  const ORIGIN = 'https://hn.algolia.com/*';

  const root = document.documentElement,
        row = document.getElementById('algolia'),
        note = document.getElementById('note');

  if (!row || !note) return;

  /* Same three lines boot.js runs, and for the same reason: the page should
     already be wearing the reader's palette when it paints. boot.js itself is
     not reused because its other job — the pending flag — belongs to a page
     something rewrites, and nothing rewrites this one. */
  const MODES = globalThis.HNESModes;
  if (MODES) {
    MODES.load(function (items) { MODES.applyAll(root, items); });
    MODES.watch(root);
  }

  // Function expressions rather than declarations: the null guard above narrows
  // row and note only for closures created after it, not for hoisted ones.
  const draw = function (on) {
    row.setAttribute('aria-checked', on ? 'true' : 'false');
  };

  const say = function (text) {
    note.textContent = text || '';
  };

  chrome.permissions.contains({ origins: [ORIGIN] }, function (granted) {
    draw(granted);
  });

  /*
   * permissions.request has to be reached from the gesture that asked for it,
   * so no await, no storage read, nothing between the click and the call.
   * A declined prompt resolves false, which is why the switch is drawn from the
   * answer rather than flipped optimistically on the way in.
   */
  const toggle = function () {
    const on = row.getAttribute('aria-checked') === 'true';
    say('');

    if (on) {
      chrome.permissions.remove({ origins: [ORIGIN] }, function (removed) {
        draw(!removed);
        if (!removed) say('Could not drop the permission.');
      });
      return;
    }

    chrome.permissions.request({ origins: [ORIGIN] }, function (granted) {
      draw(granted);
      if (granted) say('Open a search page to see it.');
    });
  };

  row.addEventListener('click', toggle);

  // A div with role="switch" is not a control, so Space and Enter have to be
  // bound by hand for it to be operable from the keyboard.
  row.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    toggle();
  });

  /* The grant can also be dropped from the browser's own extension UI, and this
     page may be open while that happens. */
  if (chrome.permissions.onRemoved) {
    chrome.permissions.onRemoved.addListener(function (permissions) {
      if (permissions.origins && permissions.origins.indexOf(ORIGIN) !== -1) draw(false);
    });
  }
  if (chrome.permissions.onAdded) {
    chrome.permissions.onAdded.addListener(function (permissions) {
      if (permissions.origins && permissions.origins.indexOf(ORIGIN) !== -1) draw(true);
    });
  }
})();
