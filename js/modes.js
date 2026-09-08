/*
 * Every stored preference, defined once, plus the persistence around them.
 *
 * Loaded as a document_start content script ahead of boot.js, which applies the
 * stored values before first paint, and read again by hn.js at document_end,
 * which builds the settings panel from it and asks it what to do. Content
 * scripts of one extension share one isolated world, so both see this without a
 * module system.
 *
 * This used to be two lists — one in boot.js, one in hn.js — because hn.js does
 * not exist yet at document_start. Adding a mode to one and not the other made
 * it work after paint and flash on every cold load, which is a bug you only
 * catch on a cold profile.
 *
 * There are two families here now. A spec with `attr` paints: boot.js writes it
 * onto <html> before paint and the stylesheet does the rest, so it can change
 * live and cross-tab. A spec without one is behaviour — hn.js reads it and
 * decides what to build or bind, which means it takes effect on the next load
 * of a page rather than under a page already on screen.
 *
 * values[0] is the unset state: applying it removes the attribute instead of
 * setting it, so "which values are real" is derived from the list rather than
 * restated as a condition somewhere else. For a toggle that makes values[0] the
 * shipped default, which is `on` for all three — every one of them describes
 * something HNES did unconditionally before it had a switch.
 *
 * `ui` picks how a spec's options are drawn in the panel, not what they do:
 * `list` is a name plus a line of explanation, `swatch` trades that line for a
 * rendering of the palette itself (five colour schemes are not a thing prose is
 * good at), `toggle` is one row and a switch, `multi` is a set rather than a
 * choice. Specs sharing a `label` share one heading in the panel.
 */
(function () {
  /*
   * Hacker News' own section pages. The split into header tabs and "more" was
   * hardcoded in hn.js and is now a preference — someone who lives on /ask
   * should not go through a dropdown for it every time. Order here is the order
   * they are drawn in, in both places.
   */
  var SECTIONS = [
    { id: 'top',          href: '/news',         label: 'top',          hint: 'Top stories' },
    { id: 'new',          href: '/newest',       label: 'new',          hint: 'Newest stories' },
    { id: 'best',         href: '/best',         label: 'best',         hint: 'Best stories' },
    { id: 'submit',       href: '/submit',       label: 'submit',       hint: 'Submit a story' },
    { id: 'show',         href: '/show',         label: 'show',         hint: 'Show HN' },
    { id: 'shownew',      href: '/shownew',      label: 'shownew',      hint: 'New Show HN posts' },
    { id: 'classic',      href: '/classic',      label: 'classic',      hint: 'Only counts votes from accounts over a year old' },
    { id: 'active',       href: '/active',       label: 'active',       hint: 'Active stories' },
    { id: 'ask',          href: '/ask',          label: 'ask',          hint: 'Ask Hacker News' },
    { id: 'jobs',         href: '/jobs',         label: 'jobs',         hint: 'Sponsored job postings' },
    { id: 'bestcomments', href: '/bestcomments', label: 'bestcomments', hint: 'Best comments' },
    { id: 'newcomments',  href: '/newcomments',  label: 'newcomments',  hint: 'New comments' },
    { id: 'noobstories',  href: '/noobstories',  label: 'noobstories',  hint: 'Stories by new users' },
    { id: 'noobcomments', href: '/noobcomments', label: 'noobcomments', hint: 'Comments by new users' }
  ];

  /* The bindings hn.js has always had. `h` opened a help screen that was never
     written — the line was commented out where it was bound — so it opens the
     panel this list is drawn in, which is the help it was reaching for. */
  var KEYS = [
    { id: 'j', label: 'Next story' },
    { id: 'k', label: 'Previous story' },
    { id: 'o', label: 'Open the story' },
    { id: 'l', label: 'Open the story in a new tab' },
    { id: 'p', label: 'Open the comments' },
    { id: 'c', label: 'Open the comments in a new tab' },
    { id: 'b', label: 'Open both in new tabs' },
    { id: 'h', label: 'Open these settings' },
    { id: '/', label: 'Search' },
    { id: '?', label: 'Show this list' }
  ];

  var ON_OFF = [{ id: 'on' }, { id: 'off' }];

  /** @type {HNESModeSpec[]} */
  var MODES = [
    {
      key: 'hnesTheme', attr: 'data-hnes-theme', label: 'Theme', ui: 'list',
      values: [
        { id: 'auto',  label: 'Auto',  hint: 'Follow the system setting' },
        { id: 'light', label: 'Light' },
        { id: 'dark',  label: 'Dark' }
      ]
    },
    {
      /* Stored as hnesDensity and shown as "View": the key predates the label
         and renaming it would strand everyone's existing choice. */
      key: 'hnesDensity', attr: 'data-hnes-density', label: 'View', ui: 'list',
      values: [
        { id: 'comfortable', label: 'Comfortable', hint: 'Roomy rows and cards' },
        { id: 'compact',     label: 'Compact',     hint: 'Smaller type, more rows per screen' },
        { id: 'flow',        label: 'Flow',        hint: 'Full-size type, no card chrome' }
      ]
    },
    {
      key: 'hnesPalette', attr: 'data-hnes-palette', label: 'Palette', ui: 'swatch',
      values: [
        { id: 'classic',     label: 'Classic' },
        { id: 'newsprint',   label: 'Newsprint' },
        { id: 'ember',       label: 'Ember' },
        { id: 'slate',       label: 'Slate' },
        { id: 'letterpress', label: 'Letterpress' }
      ]
    },
    {
      key: 'hnesNewComments', label: 'Reading', ui: 'toggle', values: ON_OFF,
      name: 'Highlight new comments',
      hint: 'Marks replies posted since your last visit to a thread'
    },
    {
      key: 'hnesHckrnews', label: 'Reading', ui: 'toggle', values: ON_OFF,
      name: 'hckrnews.com counts',
      hint: 'Unread comment counts on hckrnews.com, from the same read state'
    },
    {
      key: 'hnesFormatBar', label: 'Writing', ui: 'toggle', values: ON_OFF,
      name: 'Formatting bar',
      hint: "Buttons, Hacker News' formatting rules, and a warning when a draft uses Markdown"
    },
    {
      key: 'hnesKeys', label: 'Keyboard', ui: 'toggle', values: ON_OFF, help: KEYS,
      name: 'Shortcuts',
      hint: 'Ignored while a text box has focus'
    },
    {
      /* A set rather than a choice, so it is stored as a comma-joined list.
         Empty is a real answer — it means every section lives under "more" —
         which is why the default lives here and not in a `|| fallback`. */
      key: 'hnesNav', label: 'Sections', ui: 'multi', values: SECTIONS,
      dflt: 'top,new,best,submit',
      hint: 'Shown in the header; the rest stay under "more"'
    }
  ];

  /*
   * Which groups sit behind which tab. The panel had grown to 1519px of content
   * in a 536px box — every group after Palette was below the fold even on a
   * full-height desktop, behind an overlay scrollbar macOS fades out — so it is
   * one pane at a time now. Grouped so the tallest pane still fits unscrolled.
   *
   * Here rather than in hn.js for the same reason MODES is: a spec's `label` and
   * the tab that has to hold it are one fact, and splitting it across two files
   * is what let boot.js and hn.js drift apart before this file existed.
   */
  var TABS = [
    { id: 'look',     label: 'Look',     groups: ['Theme', 'View', 'Palette'] },
    { id: 'reading',  label: 'Reading',  groups: ['Reading', 'Writing', 'Keyboard'] },
    { id: 'sections', label: 'Sections', groups: ['Sections'] },
    { id: 'storage',  label: 'Storage',  groups: ['Storage'] }
  ];

  var VALUES = {},
      loaded = false,
      started = false,
      waiting = [],
      subscribers = [];

  globalThis.HNESModes = {
    list: MODES,
    sections: SECTIONS,
    tabs: TABS,

    keys: function () {
      return MODES.map(function (spec) { return spec.key; });
    },

    spec: function (key) {
      for (var i = 0; i < MODES.length; i++) {
        if (MODES[i].key === key) return MODES[i];
      }
      return null;
    },

    /* -1 for anything this build does not know, which callers treat exactly
       like values[0] — that is what makes a value written by a newer build
       degrade to the default rather than stick as an unstyled attribute. */
    indexOf: function (spec, value) {
      for (var i = 0; i < spec.values.length; i++) {
        if (spec.values[i].id === value) return i;
      }
      return -1;
    },

    /*
     * The value in force. A painting spec is read off the document rather than
     * the cache, because that is what the page is actually wearing: boot.js has
     * already put it there and its cross-tab listener keeps it current.
     */
    current: function (spec) {
      var raw = spec.attr
        ? document.documentElement.getAttribute(spec.attr)
        : VALUES[spec.key];
      return spec.values[Math.max(this.indexOf(spec, raw), 0)].id;
    },

    /* The `multi` counterpart of current(). */
    selected: function (spec) {
      var raw = VALUES[spec.key];
      if (raw === undefined || raw === null) raw = spec.dflt;
      return String(raw).split(',').filter(function (id) { return id !== ''; });
    },

    /* Convenience for the behaviour toggles, which is all hn.js wants of them. */
    on: function (key) {
      var spec = this.spec(key);
      return !spec || this.current(spec) === 'on';
    },

    apply: function (root, spec, value) {
      // Only a painting spec has an attribute to write. This is the one place
      // that checks, so no caller has to.
      if (!spec.attr) return;
      if (this.indexOf(spec, value) > 0) root.setAttribute(spec.attr, String(value));
      else root.removeAttribute(spec.attr);
    },

    applyAll: function (root, items) {
      var self = this;
      MODES.forEach(function (spec) {
        self.apply(root, spec, items[spec.key]);
      });
    },

    /*
     * The one write path, so a new `ui` cannot forget half of it: cache, paint,
     * persist. Persisting is what every other open tab hears through watch().
     * Values are stringified because that is what the rest of this extension's
     * storage does, and the cache has to match what a reload would read back.
     */
    commit: function (spec, value) {
      var item = {};
      VALUES[spec.key] = String(value);
      this.apply(document.documentElement, spec, value);
      item[spec.key] = String(value);
      try { chrome.storage.local.set(item); } catch (e) { /* see load() */ }
    },

    /*
     * One read for every key, cached. Called by boot.js at document_start so it
     * is in flight while HN's markup is still parsing; by the time hn.js asks,
     * it has almost always landed and ready() runs without waiting at all.
     */
    load: function (callback) {
      started = true;
      var done = function (items) {
        VALUES = items || {};
        loaded = true;
        if (callback) callback(VALUES);
        while (waiting.length) waiting.shift()(VALUES);
      };
      /* Storage unavailable — hand out the defaults rather than never
         resolving, or hn.js would wait for a reveal that cannot come. */
      try { chrome.storage.local.get(this.keys(), done); } catch (e) { done({}); }
    },

    ready: function (callback) {
      if (loaded) return callback(VALUES);
      waiting.push(callback);
      /* Self-starting, so a caller that runs without boot.js — a page where the
         document_start script was skipped — still gets its values. */
      if (!started) this.load();
    },

    /*
     * The settings panel paints its own tab directly, so this is what every
     * *other* open Hacker News tab hears. Without it two tabs disagree until
     * each is reloaded, which reads as the setting not having saved — and a
     * panel reads as global settings in a way three nav links did not.
     *
     * Cheaper than the alternative as well: no tabs permission (dropped in
     * 2a907f8 for store review), no message plumbing, and background tabs and
     * second windows are covered without being told to be.
     *
     * Behaviour specs update the cache but cannot repaint anything — the nav
     * they decided is already built. They are correct on this tab's next load.
     */
    watch: function (root) {
      var self = this;
      try {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area !== 'local') return;
          var touched = [];
          MODES.forEach(function (spec) {
            if (!(spec.key in changes)) return;
            VALUES[spec.key] = changes[spec.key].newValue;
            self.apply(root, spec, changes[spec.key].newValue);
            touched.push(spec);
          });
          if (touched.length) {
            subscribers.forEach(function (callback) { callback(touched); });
          }
        });
      } catch (e) { /* see load() */ }
    },

    /* For anything that has to react as well as repaint — the open settings
       panel, whose marks are drawn from these values and would otherwise sit
       stale under a page the listener above has already restyled. */
    subscribe: function (callback) {
      subscribers.push(callback);
    }
  };
})();
