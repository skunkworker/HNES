Warning: Unmaintained
============
I don't have much desire to keep maintaining this project, so please don't create pull requests for any new features or anything which is not a bug or regression.


Hacker News Enhancement Suite
=============================

A Hacker News extension for Firefox and Chrome which changes lots of things.

Features
--------
* Completely new style, with light and dark themes and five colour palettes
* Search from the header; it goes to hn.algolia.com, which can wear the same
  palette if you opt in
* A settings panel behind the gear in the header
* Easy access to all pages, and you pick which ones are header tabs
* A formatting bar over every comment box
  * Italic, code, quote and link buttons, and Ctrl/Cmd+I for italic
  * Hacker News' six formatting rules, in place, plus what it does not support
  * A warning when a draft uses Markdown Hacker News will print as typed
* Enhanced comment threads
  * Collapsible comments
  * Link to parent
  * Display all comments on paginated threads
  * Highlight the original poster
* Show and highlight new comments since you last view a thread
* Highlight links once clicked to more easily identify what you've recently visited
* Redirect back to the front page upon hitting an expired link
* Display how many times you've upvoted each user
* Graphs on polls
* Clickable links in self posts and on users profile pages
* New smooth and scalable up & down vote arrows
* Keyboard controls on index pages, which can be turned off:
  * j - Next item
  * k - Previous item
  * o - Open story
  * l - Open story in a new tab
  * p - View comments
  * c - View comments in a new tab
  * b - Open both the comments and the story in new tabs
  * h - Open the settings panel
* Tag users

Settings
--------
The gear at the right of the header, in four tabs:

* **Look** - theme (auto, light, dark), view (comfortable, compact, flow), and
  five palettes
* **Reading** - new-comment highlighting, hckrnews.com unread counts, the
  formatting bar over comment boxes, and the keyboard shortcuts
* **Sections** - which of Hacker News' fourteen section pages are header tabs
  and which stay under "more"
* **Storage** - how much the extension is holding, a way to clear collapsed
  comment state, which is the one store that never shrinks, and the link to
  the options page below

The options page (that link, or the browser's own extension settings) holds one
switch, "Theme hn.algolia.com". It is off by default. Turning it on asks the
browser once for that host, and from then on search results take your palette,
theme and density. Nothing about the page's layout changes, so it still reads
as the search site. Needs Firefox 128 or later; Chrome is fine.

Everything is stored locally in `chrome.storage.local`; nothing is sent
anywhere. The Look settings apply immediately, and to any other Hacker News tab
you have open. The rest are read while a page loads and turned into markup, so
changing one offers a reload rather than pretending it took effect.

Building and loading
--------------------
Manifest V3, and the repo is the extension - there is no build step. The
colour and spacing tokens live in `tokens.css`, shared by `style.css` (Hacker
News) and `algolia.css` (hn.algolia.com), so a palette edit lands on both.

* **Chrome** - `chrome://extensions`, turn on Developer mode, Load unpacked, and
  pick this directory.
* **Firefox** - `./zip.sh`, then `about:debugging` -> Load Temporary Add-on ->
  `../HNES-firefox.zip`.

The two cannot share a background key: Chrome has no event page and Firefox has
no service worker, and each warns about the other's key. So the manifest in the
tree is Chrome-shaped and `zip.sh` writes the Firefox one into that package.
`zip.sh` builds both store packages.

Tests
-----
Eight harnesses drive a real browser with the extension loaded, because almost
everything here is rewriting a page it does not control. `cd test && npm install`,
then see [test/README.md](test/README.md) for what each one covers and which
need the network.

Firefox AMO link
----------------
https://addons.mozilla.org/en-US/firefox/addon/hnes/

Chrome web store link
---------------------
https://chrome.google.com/webstore/detail/bappiabcodbpphnojdiaddhnilfnjmpm

TODO
----
* Ajax auto-complete for the header search
* Do something with un-threaded comment lists (e.g. best comments)
* Make profiles prettier
* Allow user to highlight friends (ala RES)
* Show dead/grayed-out comments on mouse hover (or maybe a button)
* Test / make it work when user can see downvotes

Things I can't test
-------
I don't have enough karma to test down votes, creating polls, or topbar color

Compatability
-------
I do not test this extension with any other extensions active on Hacker News so I cannot guarantee that it will play nice. If you come across an apparent bug please make sure that any other extension are disabled or please mention which ones are enabled in the bug report.

License
-------
MIT License, see LICENSE

Thanks
------
Wayne Larson for hckrnews.com and permission to use code from his extension which displays new comments.

@jarques for his HN+ extension (https://github.com/jarquesp/Hacker-News--) which was used as a starting point for this project.

Thanks to Samuel Stern (hatboysam) for the inline commenting.

Thanks to Vishnu Rajeevan (burntcookie90) for adding more keyboard shortcuts.

Thanks to Lewis Pollard (lewispollard) for highlighting a story once you've opened it and redirecting to the front page when you hit an expired link.

Thanks to Dean Harding (codeka) for replacing the up/down vote images with CSS buttons.

Thanks to Jiahua (jwang47) for his fork of Már Örlygsson's (maranomynet) linkify JQuery plugin.

Thanks for Dan Harper (danharper) and to Will Ridgers (wridgers) for some CSS fixes.

Thanks for Nuno Santos (nfvs) for styling the login page and other fixes.

Thanks to alanc10n for fixing issue 66

Thanks to sglantz for adding support for topcolor, issue 52

Thanks to ibejoeb for fixing the collapsible comments, improving comment performance, and many other improvements.

Thanks to SCdF for a bug fix.

Thanks to MaximeKjaer for adding the ability to tag users.

Thanks to c17r for a fix to the new comment highlighting.
