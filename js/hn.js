/*
* Hacker News Enhancement Suite (HNES)
* Chris James / etcet.net / chris@etcet.net
*
* Thanks to both Wayne Larson and jarques for their code
*
* HN+ for Chrome v1.5 - https://github.com/jarquesp/Hacker-News--
*   by @jarques
*
* hckrnews.com extension - http://hckrnews.com/about.html
*   by Wayne Larson (wvl)
*
* Thanks to Samuel Stern for the inline replying
*
* Under MIT license, see LICENSE
*/

var CommentTracker = {
  init: function() {
    var page_info = CommentTracker.getInfo();
    HN.getLocalStorage(page_info.id, function(response) {
      var data = response.data;
      var prev_last_id = CommentTracker.process(data, page_info);
      // The read position is recorded either way: it is what hckrnews.com's
      // unread counts are drawn from, and it is what makes turning the
      // highlighting back on later resume from the right place rather than
      // from whenever it was re-enabled. Only the marking is optional.
      HNESModes.ready(function() {
        if (HNESModes.on('hnesNewComments')) {
          CommentTracker.highlightNewComments(prev_last_id);
        }
      });
    });
  },

  highlightNewComments: function(last_id) {
    var comments = document.querySelectorAll('.hnes-comment');

    for (var i = 0; i < comments.length; i++) {
      var id = comments[i].getAttribute('id');
      var comment = HN.hnComments.nodeMap[id];

      if (id > last_id) {
        comment.el.classList.remove('hnes-new-parent')
        comment.el.classList.add('hnes-new')
        comment = comment.parent;
        while (comment && comment.level > 0) {
          if (!comment.el.classList.contains('hnes-new')) {
            comment.el.classList.add('hnes-new-parent');
          }
          comment = comment.parent;
        }
      }
    }
  },

  getInfo: function() {
    var comment_info_as = document.querySelectorAll('.subtext a');
    var comment_info_el = comment_info_as[comment_info_as.length - 1];

    // The id is read off the href, so anything that is not a link is the same
    // case as no link at all — the old `.length == 0` half of this test asked a
    // DOM element for a jQuery property and so was never true.
    var href = comment_info_el instanceof HTMLAnchorElement ? comment_info_el.href : '';
    // Falls back to the address bar, which is where the id is on a page whose
    // last subtext link is something else. .match returns null in both places
    // and the old code indexed the result without checking.
    var id_match = href.match(/id=(\d+)/) || window.location.search.match(/id=(\d+)/);

    // if there is no 'discuss' or 'n comment(s)' link it's some other kind of page (e.g. profile)
    if (!href || !id_match) {
      return {"id": window.location.pathname + window.location.search,
              "num": 0,
              "last_comment_id": CommentTracker.getLastCommentId()
              }
    }

    var page_id = Number(id_match[1]);

    var comment_info_text = comment_info_el.textContent || '';
    // The delimiter is a literal &nbsp;, which is what HN puts between the
    // count and the word, as in "3&nbsp;comments".
    var count_text = comment_info_text.split(" ")[0];
    var comment_num = count_text ? Number(count_text) : count_text;

    var last_id = CommentTracker.getLastCommentId();

    return {"id": page_id, "num": comment_num, "last_comment_id": last_id}
  },

  getLastCommentId: function() {
    var ids = new Array();
    var comments = document.querySelectorAll('.hnes-comment');

    for (var i = 0; i < comments.length; i++) {
      var id = comments[i].getAttribute('id');
      ids.push(Number(id));
    }

    return ids.sort(function(a,b){return b-a})[0];
  },

  process: function(data, request) {
    var new_info = {
      id: request.id,
      expire: new Date().getTime() + 432000000
    }
    var info = data ? JSON.parse(data) : new_info;

    if (request.num) { info.num = request.num; }

    var last_comment_id = info.last_comment_id;
    if (request.last_comment_id)
      info.last_comment_id = request.last_comment_id;

    // store info
    HN.setLocalStorage(request.id, JSON.stringify(info));

    return last_comment_id;
  },

  checkIndexPage: function() {
    $('.comments').each(function() {
      var href = $(this).attr('href');
      if (href) {
        var id=$(this).attr('href').match(/id=(\d+)/);
        if(id){
            id = Number(id[1]);
        }
        else{
            //For some reason, the link we are processing is not to an HN comment section
            //I have observed this happening on dead links, which seem to grab the URL from the "web" link
            return;
        }
        var el = $(this);
        HN.getLocalStorage(id, function(response) {
          if (response.data) {
            var data = JSON.parse(response.data);
            var num = Number(el.text());

            var diff = num - data.num;
            if (diff > 0) {
              var newcomm = $('<span/>').addClass('newcomments')
                                        .attr('title', 'New Comments')
                                        .text(diff + ' / ');
              var totalcomm = $('<span/>').text(el.text())
                                          .addClass('totalcomments')
                                          .attr('title', 'Total Comments');
              el.empty();
              el.append(newcomm)
                .append(totalcomm);
            }
          }
        });
      }
    });
  }
}

var unvoteImg = chrome.runtime.getURL("images/unvote.gif");

class HNComments {
  constructor(storyId) {
    var injector = document.createElement('div');
    injector.innerHTML = `
      <template id="hnes-comment-tmpl">
          <div id="" class="hnes-comment" data-hnes-level="">
              <header>
                  <!--<span class="voter"><a href="#" class="upvote"></a><a href="#" class="downvote"></a></span>-->
                  <span class="voteblock">
                    <a href="#" class="upvoter votearrow upvote" title="Upvote"></a>
                    <a href="#" class="downvoter votearrow rotate180 downvote" title="Downvote"></a>
                  </span>
                  <button type="button" class="unvoter unvote" title="Unvote" aria-label="Unvote"></button>
                  <button type="button" class="collapser" title="Toggle collapse" aria-label="Toggle collapse" aria-expanded="true"></button>
                  <span class="score"></span>
                  <span class="author">
                    <a href="" title="User profile"></a>
                    <span class="hnes-user-score-cont noscore" title="User score">(<span class="hnes-user-score"></span>)</span>
                    <span class="hnes-tag-cont">
                      <button type="button" class="hnes-tag" title="Tag user" aria-label="Tag user"><img class="hnes-tag-icon" alt="" aria-hidden="true"></button>
                      <span class="hnes-tagText" title="User tag"></span>
                      <input type="text" class="hnes-tagEdit" placeholder="">
                    </span>
                  </span>
                  <!--<span class="age"></span>-->
                  <a class="age permalink"></a>
                  <span class="reply-count"></span>
                  <span class="on-story nostory">on <a href=""></a></span>
              </header>
              <section class="body">
                  <div class="text">
                  </div>
                  <footer>
                      <a class="reply">reply</a>
                      <!--<a class="permalink">permalink</a>-->
                      <a class="parent">parent</a>
                  </footer>
              </section>
              <section class="replies"></div>
          </div>
      </template>
      `
    this.commentTemplate = injector.firstElementChild;
    this.storyId = storyId;
  }

  getNodeMap() {
    return this.nodeMap;
  }

  extractCommentParts(commentEl) {
    const parts = [];
    if (!commentEl) return parts;

    const container = commentEl.firstElementChild;
    if (!container) return parts;

    const p = document.createElement('p');

    let n = container.firstChild;
    while (n && !(n.nodeName == 'P' || n.nodeName == 'SPAN' || n.nodeName == 'DIV')) {
      p.appendChild(n.cloneNode(true));
      n = n.nextSibling;
    }
    parts.push(p);

    while (n && n.nodeName != 'DIV') {
      parts.push(n.cloneNode(true));
      n = n.nextSibling;
    }
    return parts;
  }

  markupToNodeList(commentTree) {
    if (!commentTree) return;

    var commentTables = commentTree.querySelectorAll('tr.athing table');
    // pages like /bestcomments don't have sub-tables
    if (!commentTables.length) {
      commentTables = commentTree.querySelectorAll('tr.athing')
    }
    if (!commentTables) return;

    const nodeList = new Array(commentTables.length + 1);

    let nodeIndex = 1,
        deleted = 0;

    nodeList[0] = { id: 'root', level: 0, children: [] };

    // record the OP so we can color their name orange
    const original_poster_el = document.querySelector('.subtext .hnuser'),
          original_poster = original_poster_el ? original_poster_el.textContent : '';
    if (original_poster_el) {
      original_poster_el.classList.add('original_poster');
    }

    for (let i = 0; i < commentTables.length; i++) {
      const
        t = commentTables[i],
        id = t.parentElement.parentElement.id || t.id,
        upVoteEl = document.getElementById('up_' + id),
        upVoteUrl = upVoteEl ? upVoteEl.href : '',
        downVoteEl = document.getElementById('down_' + id),
        downVoteUrl = downVoteEl ? downVoteEl.href : '',
        unVoteEl = document.getElementById('un_' + id),
        unVoteUrl = unVoteEl ? unVoteEl.href : '',
        isUpVoted = upVoteEl && upVoteEl.classList.contains('nosee'),
        isDownVoted = downVoteEl && downVoteEl.classList.contains('nosee'),
        replyEl = t.querySelector('.reply a'),
        replyUrl = replyEl ? replyEl.href : '',
        ageEl = t.querySelector('.age a'),
        age = ageEl ? ageEl.textContent : '',
        permalinkUrl = ageEl ? ageEl.href : '',
        userEl = t.querySelector('a.hnuser'),
        username = userEl ? userEl.textContent : '',
        userUrl = userEl ? userEl.href : '',
        commentEl = t.querySelector('div.comment'),
        isDeleted  = !(commentEl && commentEl.firstElementChild),
        textParts = isDeleted ? [] : this.extractCommentParts(commentEl),
        imgEl = t.querySelector('img'),
        level = (imgEl && (Math.floor(imgEl.getAttribute('width') / 40))) + 1,
        parentLinkEl = t.querySelector('.par a'),
        parentLinkUrl = parentLinkEl ? parentLinkEl.href : '',
        storyLinkEl = t.querySelector('.onstory a'),
        storyLinkUrl = storyLinkEl ? storyLinkEl.href : '',
        storyLinkText = storyLinkEl ? storyLinkEl.textContent : '',
        userFontEl = userEl ? userEl.querySelector('font') : '',
        userColor = userFontEl ? userFontEl.getAttribute('color') : '',
        isNoob = userColor == "#3c963c",
        isOP = username == original_poster,
        // HN's fade level lives on div.commtext as a cN class (c00 = normal,
        // through cdd = heavily downvoted). This used to read classList[0] off
        // the first <span> in the comment, which stopped working when HN moved
        // the body from a span to div.commtext: it picked up whatever class the
        // first inline element happened to carry, or nothing at all.
        // commentEl is null for a row that carries no comment at all (a
        // poll option, or a very old deleted comment) — guard both reads.
        commentTextEl = commentEl ? commentEl.querySelector('.commtext') : null,
        commentColor = (commentTextEl && Array.from(commentTextEl.classList)
                          .find(cls => /^c[0-9a-f]{2}$/.test(cls))) || 'c00',
        comheadEl = t.querySelector('span.comhead'),
        isDead = !!comheadEl && comheadEl.textContent.includes(' [dead] '),
        scoreEl = t.querySelector('span.score'),
        score = scoreEl ? scoreEl.textContent : '';

      nodeList[nodeIndex++] = {
        id,
        level,
        upVoteUrl,
        downVoteUrl,
        unVoteUrl,
        isUpVoted,
        isDownVoted,
        replyUrl,
        age,
        username,
        userUrl,
        isDeleted,
        textParts,
        permalinkUrl,
        children: [],
        isCollapsed: false,
        isDirty: false,
        parentLinkUrl,
        storyLinkUrl,
        storyLinkText,
        isNoob,
        isOP,
        commentColor,
        isDead,
        score,
      }
    };
    return nodeList;
  }

  nodeListToTree(nodeList) {
    const s = [], m = { root: nodeList[0] };
    for (let i = 0, j = 1, data = nodeList; j < data.length && data[j]; i++, j++) {
      const p = data[i], c = data[j];
      if (c.level > p.level) s.push(p.id);
      for (let x = 0; x < p.level - c.level; x++) s.pop();
      c.parent = m[s[s.length - 1]] || data[0];
      m[c.parent.id].children.push(c);
      m[c.id] = c;
    }
    return m;
  }

  renderComment(c, into) {
    const
      kids = c.children,
      oddOrEven = c.level % 2 ? 'odd' : 'even',
      clone = document.importNode(this.commentTemplate.content, true),
      commentEl = clone.firstElementChild,
      upvoterEl = commentEl.querySelector('.upvoter'),
      downvoterEl = commentEl.querySelector('.downvoter'),
      unvoterEl = commentEl.querySelector('.unvoter'),
      collapserEl = commentEl.querySelector('.collapser'),
      parentEl = commentEl.querySelector('.parent'),
      authorEl = commentEl.querySelector('.author a'),
      userscoreEl = commentEl.querySelector('.hnes-user-score'),
      tagImageEl = commentEl.querySelector('.hnes-tag-icon'),
      tagTextEl = commentEl.querySelector('.hnes-tagText'),
      voteblockEl = commentEl.querySelector('.voteblock');

    c.el = commentEl;
    c.collapserEl = collapserEl;

    tagImageEl.src = chrome.runtime.getURL('/images/tag.svg');

    commentEl.id = c.id;
    commentEl.classList.add(`level-${oddOrEven}`);
    commentEl.querySelector('.age').textContent = c.age;
    if (c.descCount > 0) {
      commentEl.querySelector('.reply-count').textContent = `(${c.descCount} repl${c.descCount == 1 ? 'y' : 'ies'})`;
    }
    if (c.replyUrl) {
      commentEl.querySelector('.reply').href = c.replyUrl;
    } else {
      commentEl.querySelector('.reply').classList.add('noreply');
    }
    commentEl.querySelector('.permalink').href = c.permalinkUrl;
    authorEl.textContent = c.username;
    authorEl.href = c.userUrl;

    if (c.isCollapsed) commentEl.classList.add('collapsed');
    collapserEl.setAttribute('aria-expanded', c.isCollapsed ? 'false' : 'true');

    if (c.level == 1) {
      parentEl.parentNode.removeChild(parentEl);
    }
    else {
      if (c.parentLinkUrl) {
        parentEl.href = c.parentLinkUrl;
        commentEl.querySelector('.reply-count').classList.add('noreply');
      } else {
        parentEl.href = `#${c.parent.id}`;
      }
    }

    if (c.isNoob) {
      authorEl.classList.add('new_user');
    } else if (c.isOP) {
      authorEl.classList.add('original_poster');
    }

    commentEl.querySelector('a.upvote').href = c.upVoteUrl;
    commentEl.querySelector('a.downvote').href = c.downVoteUrl;

    // hide upvotes or downvotes if there's no url in original (i.e. not logged in or not enough karma to downvote)
    if (!c.upVoteUrl) { upvoterEl.classList.add('voted') }
    if (!c.downVoteUrl) { 
      downvoterEl.classList.add('voted')
      upvoterEl.classList.add('nodownvote')
    }
  
    if (c.isUpVoted || c.isDownVoted) {
      upvoterEl.classList.add('voted')
      downvoterEl.classList.add('voted')
    }
    if (c.unVoteUrl) {
      voteblockEl.classList.add('voted');
      unvoterEl.classList.add('voted')
      unvoterEl.style.backgroundImage = 'url(' + unvoteImg + ')'
    }

    if (c.storyLinkUrl) {
      commentEl.querySelector('.on-story').classList.remove('nostory');
      commentEl.querySelector('.on-story a').href = c.storyLinkUrl;
      commentEl.querySelector('.on-story a').textContent = c.storyLinkText;
    }

    if (c.commentColor) {
      commentEl.classList.add(c.commentColor);
    }

    if (c.isDead) {
      authorEl.classList.add('dead');
    }
    
    if (c.score) {
      commentEl.querySelector('.score').textContent = c.score + " by";
      commentEl.querySelector('.score').classList.add('visible');
    }

    for (let parts = c.textParts, textContainer = commentEl.querySelector('.text'), i = 0; i < parts.length; i++) {
      textContainer.appendChild(parts[i]);
    }

    collapserEl.addEventListener('click', e => {
      e.preventDefault();
      this.collapse(c);
    }, true);

    // ajax upvotes and increments user-specific upvote data
    commentEl.querySelector('a.upvote').addEventListener('click', e => {
      e.preventDefault();
      var httpRequest = new XMLHttpRequest();
      httpRequest.onload = function(e) {
        // after upvoting, retrieve new unvote link from response
        var regex_str = "vote\\?id=" + commentEl.id + "&amp;how=un.*?'";
        var regex = new RegExp(regex_str)
        var unVoteUrl = httpRequest.responseText.match(regex)[0].slice(0, -1);
        var parser = new DOMParser;
        var dom = parser.parseFromString(
            '<!doctype html><body>' + unVoteUrl,
            'text/html');
        var decodedString = dom.body.textContent;
        c.unVoteUrl = decodedString;

        HN.upvoteUserData(authorEl.textContent, 1);
        upvoterEl.classList.add('voted');
        downvoterEl.classList.add('voted');
        voteblockEl.classList.add('voted');
        unvoterEl.classList.add('voted');
        unvoterEl.style.backgroundImage = 'url(' + unvoteImg + ')'
      };
      httpRequest.open('GET', c.upVoteUrl, true);
      httpRequest.send();
    }, true);

    // ajax unvote
    unvoterEl.addEventListener('click', e => {
      e.preventDefault();
      var httpRequest = new XMLHttpRequest();
      httpRequest.onload = function(e) {
        HN.upvoteUserData(authorEl.textContent, -1);
        // only show up/down vote if we receive urls (for logged out users or low karma)
        if (c.upVoteUrl) upvoterEl.classList.remove('voted');
        if (c.downVoteUrl) downvoterEl.classList.remove('voted');
        unvoterEl.classList.remove('voted');
        voteblockEl.classList.remove('voted');
      };
      var unvote_link = c.unVoteUrl;
      httpRequest.open('GET', unvote_link, true);
      httpRequest.send();
    }, true);
    
    this.renderComments(kids, commentEl.querySelector('.replies'))
    into.appendChild(clone);
  }

  renderComments(comments, into) {
    for (let i = 0; i < comments.length; i++) {
      this.renderComment(comments[i], into);
    }
  }

  collapse(c) {
    c.isCollapsed = !c.isCollapsed;
    c.isDirty = true;
    c.el.classList.toggle('collapsed', c.isCollapsed);
    c.collapserEl.setAttribute('aria-expanded', c.isCollapsed ? 'false' : 'true');
    this.storeMeta();
  }

  getMeta() {
    const toStore = {};
    preorder(this.nodeMap.root, n => {
      if (n.isDirty) toStore[n.id] = { 'isCollapsed': n.isCollapsed };
    });
    return toStore;
  }

  storeMeta(items) {
    chrome.storage.local.set(this.getMeta());
  }

  loadMeta(nodeMap, callback) {
    const keys = [];
    preorder(nodeMap.root, n => {
      keys.push(n.id);
    });
    chrome.storage.local.get(keys, items => {
      callback(items);
    })
  }

  prepare(nodeMap, callback) {
    this.loadMeta(nodeMap, meta => {
      const visit = (n) => {
        let acc = 0;
        for (let i = 0; i < n.children.length; i++) {
          acc += visit(n.children[i]);
        }
        const res = acc + n.children.length;
        n.descCount = res;
        n.isCollapsed = (meta[n.id] && meta[n.id].isCollapsed);
        return res;
      };
      visit(nodeMap.root);
      callback(nodeMap);
    });
  }

  apply() {
    var commentTree = document.querySelector('#hnmain table.comment-tree');
    var itemList = document.querySelector('#hnmain table.itemlist');
    var threadList = document.querySelector('#hnmain table.comments-table');
    if (!commentTree && !itemList && !threadList) {
      console.warn('unrecognized markup detected, no commentTree, itemList, or threadList');
      return;
    } else if (itemList) {
      commentTree = itemList;
    } else if (threadList) {
      commentTree = threadList;
    }

    try {
      const nodeMap = this.nodeListToTree(this.markupToNodeList(commentTree));

      // /threads and /newcomments often repeat the same story across a run of
      // top-level comments — keep it on only the first comment of each run.
      let lastStoryUrl = null;
      for (const child of nodeMap.root.children) {
        if (!child.storyLinkUrl) continue;
        if (child.storyLinkUrl === lastStoryUrl) child.storyLinkUrl = '';
        else lastStoryUrl = child.storyLinkUrl;
      }

      this.prepare(nodeMap, nodeMap => {
        var commentsContainer;
        try {
          this.nodeMap = nodeMap;
          commentsContainer = document.createElement('div');
          commentsContainer.id = 'hnes-comments';

          this.renderComments(this.nodeMap.root.children, commentsContainer);
          commentTree.parentNode.replaceChild(commentsContainer, commentTree);
        } catch (e) {
          // Nothing has replaced commentTree yet, so the failsafe still has
          // something to unhide.
          this.showFailsafe(commentTree, e);
          return;
        }

        // The real tree is on screen now. A throw past this point (tracking,
        // user info) shouldn't undo it — commentTree is already detached, so
        // the failsafe has nothing left to fall back to.
        try {
          if (itemList) {
            commentsContainer.classList.add('nolevels')
          } else {
            // highlight new comments on threaded pages
            CommentTracker.init();
          }
          // load and show user tags and point totals
          HN.addInfoToUsers();
          // Removed, not hidden: the skeleton's own display rule is keyed on
          // the id and would outrank a .hidden class.
          var loading_comments = document.getElementById('loading_comments');
          if (loading_comments) loading_comments.remove();
        } catch (e) {
          console.error('HNES: comments rendered, but a post-render step failed', e);
        }
      });
    } catch (e) {
      this.showFailsafe(commentTree, e);
    }
  }

  // Markup drifts out from under us occasionally (see bug 1: a poll's option
  // rows carry no comment markup). Rather than leave the reader with a stuck
  // "Loading comments" box and HN's own tree hidden underneath it, fall back
  // to showing that raw tree.
  showFailsafe(commentTree, error) {
    console.error('HNES could not render comments', error);
    var loading_comments = document.getElementById('loading_comments');
    if (loading_comments) loading_comments.remove();
    if (!commentTree || !commentTree.parentNode) return;
    var note = document.createElement('p');
    note.className = 'hnes-comment-fallback-note';
    note.textContent = "HNES could not draw the comments. This is Hacker News' own view.";
    commentTree.parentNode.insertBefore(note, commentTree);
    commentTree.classList.add('hnes-comment-fallback');
  }
}

function preorder(n, visit, skip) {
  var die;
  if (!n) return;
  if (!skip) die = visit(n);
  if (die) return;
  for (var i = 0; i < n.children.length; i++) {
    preorder(n.children[i], visit);
  }
}

var HN = {
    init: function() {

        HN.initElements();
        HN.removeNumbers();

        if (/*window.location.pathname != '/submit' &&*/
            window.location.pathname != '/changepw') {
          HN.rewriteNavigation();
        }

        //if user is logged in
        var logout_elem = $('.pagetop a:contains(logout)');
        if (logout_elem.length)
          HN.rewriteUserNav(logout_elem.parent());

        var pathname = window.location.pathname;
        //More link - can be post index, threads, comments, etc
        //threads is like "etcet's comments"
        //comment listings are like "New Comments"
        //add comment after logging in is "Hacker News | Add Comment"
        var track_comments = true;
        if (pathname == "/x") {
          track_comments = false;
          var title = document.title;
          var words = title.split(" ");
          if (words[1] == "Comments") {
            //normal comments - fallthrough
          }
          else if (words[1] == "comments") {
            //paginated comments, anything other than first page of comments
            //"more comments | Hacker News"
            if (words[0] == "more")
              pathname = "/more";
            //"user's comments | Hacker News"
            else
              pathname = "/threads";
          }
          else if (words[0] == "Edit") {
            pathname = "/edit";
          }
          else if (title == "Hacker News | Confirm") {
            pathname = "/confirm";
          }
          else if (title == "Hacker News | Add Comment") {
            pathname = "/reply";
          }
          else if (HN.isLoginPage()) {
            pathname = "/login";
          }
          else {
            pathname = "/news";
            //postlist
          }
        }

        var postPagesRE = /^(?:\/|\/news|\/newest|\/best|\/active|\/classic|\/submitted|\/saved|\/jobs|\/noobstories|\/ask|\/news2|\/over|\/show|\/shownew|\/hidden|\/upvoted)$/;
        if (postPagesRE.test(pathname)) {
          HN.doPostsList();

          function remove_first_tr() {
            $("body #content td table tbody tr").filter(":first").remove();
          }
          if (pathname == '/jobs') {
            $("body").attr("id", "jobs-body");
          }
          if (pathname == '/show' || pathname == '/jobs') {
            remove_first_tr();
            var blurbRow = $("body #content td table tbody tr:not(.athing):first"),
                blurb = blurbRow.find("td:last").html();
            blurbRow.remove();
            $("body #content table").before($("<p>").addClass("blurb").html(blurb));
          }
        }
        else if (pathname == '/edit') {
          $("body").attr("id", "edit-body");
          $("tr:nth-child(3) td td:first-child").remove();
        }
        else if (pathname == '/item' ||
                 pathname == "/more" ||
                 pathname == "/bestcomments" ||
                 pathname == "/noobcomments" ||
                 pathname == "/newcomments") {

          var morelink = document.querySelector('.morelink');
          if (morelink) {
            var morelink_href = morelink.href;
            $('#content').after(morelink);
          }

          HN.hnComments = new HNComments(HN.currentItemId());
          HN.doCommentsList(pathname, track_comments);
        }
        else if (pathname == '/favorites' ||
                 pathname == '/upvoted') {
          $("td[colspan='2']").hide();
          $(".votelinks").hide();
          $(".ind").hide();
          //HN.doCommentsList(pathname, track_comments);
        }
        else if (pathname == '/threads') {
          $("body").attr("id", "threads-body");

          //create new table and try to emulate /item
          var trs = $('body > center > table > tbody > tr');
          var comments = trs.slice(2, -1);
          var newtable = $("<table/>").append($('<tbody/>').append(comments));
          $(trs[1]).find('td').append(newtable);

          var morelink = document.querySelector('.morelink');
          if (morelink) {
            var morelink_href = morelink.href;
            newtable.parent().append(morelink);
          }

          HN.hnComments = new HNComments(0);
          HN.doCommentsList(pathname, track_comments);
        }
/*        else if (pathname == '/newcomments' ||
                 pathname == '/bestcomments' ||
                 pathname == '/noobcomments' ) {
          HN.addClassToCommenters();
          HN.addInfoToUsers($('body'));
        }*/
        else if (pathname == '/user') {
          HN.doUserProfile();
        }
        else if (pathname == '/newslogin' ||
                 pathname == '/login') {
          HN.doLogin();
        }
        else if ((pathname == '/reply') && HN.isLoginPage()) {
          HN.doLogin(); // reply when not logged in
        }
        else if ((pathname == '/submit') && HN.isLoginPage()) {
          HN.doLogin(); // submit when not logged in
        }
        else if (pathname == '/newpoll') {
          HN.doPoll();
        }
        else {
          //make sure More link is in correct place
          $('.title:contains(More)').prev().attr('colspan', '1');
        }

        // Every page that carries a comment box, not only an item page. /reply,
        // /submit and /edit each have one and none of them reaches
        // doCommentsList, which is where this used to be called — so all three
        // went without the wrap, and would go without the formatting bar.
        //
        // The normalised pathname, not window.location's: HN serves /reply and
        // /edit from /x, and this file has exactly one place that untangles
        // that. A second, weaker copy of "which page is this" is what drifts.
        HN.setUpReplyBox(pathname);
    },

    doPoll: function() {
      $('body').attr('id', 'poll-body');
    },

    isLoginPage: function() {
      return ($("b:contains('Login')").length > 0);
    },

    isLoggedIn: function() {
      var logout_elem = $('.pagetop a:contains(logout)');
      return (logout_elem.length > 0 ? true : false);
    },

    /* The item this page is about, or false where HN serves no ?id= — logged-in
       /upvoted and /favorites, and the list pages. */
    currentItemId: function() {
      var results = /id=(\w+)/.exec(window.location.search);
      return results ? results[1] : false;
    },

    initElements: function() {
      var header = $('body > center > table > tbody > tr:first-child');
      if (header.find('td').attr('bgcolor') === "#000000") {
        //mourning
        header = header.next();
        header.prev().remove();
        $('body').addClass('mourning');
      }
      header.attr('id', 'header');

      var contentIndex = 2;
      if ($('body > center > table > tbody > tr').eq(1).has('.pagetop').length > 0) {
        // There's an announcement underneath header
        contentIndex++;
      }

      var content = $('body > center > table > tbody > tr').eq(contentIndex);
      content.attr('id', 'content');

      //remove empty tr element between header and content
      $('body > center > table > tbody > tr').eq(contentIndex - 1).remove();

      $('#header table td').removeAttr('style');

      $('tr:last-child .title').attr('id', 'more');
      //$('.title a[rel="nofollow"]:contains(More)').parent().attr('id', 'more');
      //$('.title a[href="news2"]').parent().attr('id', 'more');

      $('tr[style="height:7px"]').remove();
      $('tr[style="height:2px"]').remove();

      $('.yclinks').parent('center').css({"width" : "100%"});
      HN.stripPipes($('.yclinks'));

      // Search lives in the header now (initSearch). The footer keeps its
      // links and loses the form plus the blank lines HN pads it with.
      $('form[action*="hn.algolia.com"]').prevAll('br').addBack().remove();

      var icon = $('img[src="y18.svg"]');
      icon.parent().attr({"href": "http://news.ycombinator.com/"});
      icon.attr('title', 'Hacker News');
    },

    // HN separates these links with bare " | " text nodes rather than markup,
    // so a CSS selector can't reach them. Strip the pipes and let `gap` on the
    // container do the spacing instead.
    stripPipes: function(el) {
      el.contents().filter(function() {
        return this.nodeType === 3 && /^\s*\|\s*$/.test(this.nodeValue);
      }).remove();
    },

    // HN's comment box is a bare textarea plus a "help" link with no label of
    // its own. Wrap both so CSS can pin help to the textarea's corner, give
    // the textarea a label screen readers can announce, and grow it with
    // typed content instead of leaving it at HN's fixed 8-row height.
    setUpReplyBox: function(pathname) {
      // Rule 5: a submission's own text field is the one place Hacker News does
      // not turn urls into links, so the help there must not promise links and
      // the Link button has nothing to wrap.
      var links_work = pathname != '/submit';

      $('form').has('textarea[name="text"]').each(function() {
        var form = $(this),
            textarea = form.find('textarea[name="text"]'),
            help = form.find('a[href="formatdoc"]'),
            box = $('<div class="hnes-reply-box"></div>');

        textarea.attr('aria-label', 'Comment text');
        textarea.before(box);
        box.append(textarea, help);

        // CSS caps the actual height; scrollHeight past that just scrolls.
        textarea.on('input', function() {
          textarea.css('height', 'auto');
          textarea.css('height', textarea[0].scrollHeight + 'px');
        });

        // After the wrap rather than instead of it: the wrap is HN's own markup
        // rearranged and must not wait on storage, while the bar is a setting
        // and has to.
        HNESModes.ready(function() {
          if (HNESModes.on('hnesFormatBar')) {
            HN.addFormatTools(box, textarea, help, links_work);
          }
        });
      });
    },

    /*
     * Hacker News' entire formatting grammar, from /formatdoc, read on
     * 8 September 2026. One list because three things want it: the help panel
     * under a comment box, the same panel under the profile's `about` field,
     * and the warning below, whose offered rewrites only mean anything against
     * these rules.
     *
     * `linked` marks the two url rules, which do not hold in a submission's
     * text field.
     */
    FORMAT_RULES: [
      { text: 'Blank lines separate paragraphs.' },
      { text: 'Text surrounded by asterisks is italicized.' },
      { text: 'To get a literal asterisk, use \\* or **.' },
      { text: 'Text after a blank line that is indented by two or more spaces is formatted as code.' },
      { text: 'Urls become links.', linked: true },
      { text: 'If your url gets linked incorrectly, put it in <angle brackets> and it should work.', linked: true }
    ],

    /* Not on /formatdoc, which is the problem it exists to fix: HN documents
       what works and never what does not, so people keep typing Markdown at
       it and only find out after posting. A list rather than a sentence, for
       the same reason FORMAT_RULES is one — prose is what drifted before. */
    FORMAT_UNSUPPORTED: ['bold', 'headings', 'lists', 'blockquotes', 'tables',
                         'backticks', '[text](url) links'],

    /*
     * The buttons. `linked` again, because <angle brackets> only mean anything
     * where urls are linked at all.
     */
    FORMAT_TOOLS: [
      { label: 'Italic', title: 'Italic (Ctrl+I)',
        run: function(el) { HN.wrapSelection(el, '*', '*'); } },
      { label: 'Code', title: 'Indent two spaces, after a blank line',
        run: function(el) { HN.prefixLines(el, '  ', true); } },
      { label: 'Quote', title: 'Quote — a reader convention, not a Hacker News rule',
        run: function(el) { HN.prefixLines(el, '> ', false); } },
      { label: 'Link', title: 'Wrap a url in angle brackets', linked: true,
        run: function(el) { HN.wrapSelection(el, '<', '>'); } }
    ],

    /*
     * Markdown that Hacker News prints as typed. Advisory only, and nothing
     * here rewrites a draft without a click, because every pattern has a
     * reading where the author meant it. `**text**` is the sharpest case: it
     * is also how rule 3 escapes an asterisk, so the warning says what HN will
     * do and leaves the choice to the author.
     */
    FORMAT_LINTS: [
      {
        re: /\*\*(?=\S)([^*\n]+?)\*\*/,
        to: '*$1*',
        msg: 'Bold does not work. A pair of asterisks escapes to one literal asterisk.',
        fix: 'Use single asterisks'
      },
      {
        re: /`[^`\n]+`/,
        msg: 'Backticks do not work. Use the Code button, which indents by two spaces.'
      },
      {
        re: /\[([^\]\n]+)\]\(([^)\s]+)\)/,
        to: '$1 $2',
        msg: 'Link syntax does not work. A bare url becomes a link on its own.',
        fix: 'Unwrap the links'
      },
      {
        /* Only where a bullet touches the next line. Bullets already separated
           by blank lines render as the author meant, and warning about those
           would be noise on every well-formed list. */
        re: /^([-*+][ \t]+\S.*)\n(?=[ \t]*\S)/m,
        to: '$1\n\n',
        msg: 'List lines run together. Hacker News joins every line of a paragraph.',
        fix: 'Separate with blank lines'
      },
      {
        re: /^#{1,6}[ \t]+\S/m,
        msg: 'Headings do not work. The hashes are printed as typed.'
      }
    ],

    /*
     * A lint's own pattern, run over the whole draft. The `g` copy is derived
     * rather than written out a second time: two hand-kept regexes is how a
     * character class edited in one and not the other becomes a silent no-op.
     */
    applyLint: function(lint, value) {
      var flags = lint.re.flags.replace('g', '') + 'g';
      return value.replace(new RegExp(lint.re.source, flags), lint.to);
    },

    /* Every help panel needs an id for the link's aria-controls, and a page can
       carry more than one comment box. */
    formatHelpSeq: 0,

    /*
     * One disclosure for both help panels — the one under a comment box and the
     * one under the profile's `about` field. They were two implementations of
     * the same widget, and only one of them had the aria wiring.
     *
     * The open state lives in aria-expanded rather than in a closure variable:
     * the attribute has to be written anyway, and reading one back costs
     * nothing, while :visible measures the element and forces a layout of the
     * whole document.
     */
    wireHelpPanel: function(link, panel) {
      var id = 'hnes-format-help-' + (++HN.formatHelpSeq);

      panel.attr('id', id).css('display', 'none');
      link.attr('aria-controls', id).attr('aria-expanded', 'false');
      link.on('click', function(e) {
        // The link navigates to /formatdoc otherwise, and a draft in an
        // unsubmitted textarea does not survive that.
        e.preventDefault();
        var open = link.attr('aria-expanded') !== 'true';
        panel.css('display', open ? '' : 'none');
        link.attr('aria-expanded', String(open));
      });
      return panel;
    },

    /*
     * The one write path for the buttons. Assigning to `value` empties the
     * browser's undo stack, so a mis-click would cost the whole draft;
     * insertText goes through the editing pipeline that keeps it. execCommand
     * is deprecated and is still the only API that does this, hence the
     * fallback rather than a straight call.
     */
    replaceRange: function(el, from, to, text, sel_from, sel_to) {
      var inserted = false;

      el.focus();
      el.setSelectionRange(from, to);
      try { inserted = document.execCommand('insertText', false, text); }
      catch (e) { inserted = false; }

      if (!inserted) {
        el.value = el.value.slice(0, from) + text + el.value.slice(to);
        // insertText fires `input` itself; a raw write does not, and the
        // autosize and the warning both hang off it.
        $(el).trigger('input');
      }
      el.setSelectionRange(sel_from, sel_to);
    },

    /*
     * Wraps the selection in a marker pair, or strips a pair that is already
     * there so a second press undoes the first. An empty selection gets the
     * pair with the caret between them, which is the only thing a press with
     * nothing selected can mean.
     */
    wrapSelection: function(el, open, close) {
      var v = el.value,
          s = el.selectionStart,
          e = el.selectionEnd;

      // The selection took in the markers as well as the text. Shifting inward
      // makes that the same case as selecting the text alone, so one unwrap
      // formula serves both rather than two hand-derived sets of offsets.
      if (e - s >= open.length + close.length &&
          v.slice(s, s + open.length) === open &&
          v.slice(e - close.length, e) === close) {
        s += open.length;
        e -= close.length;
      }

      if (v.slice(s - open.length, s) === open && v.slice(e, e + close.length) === close) {
        HN.replaceRange(el, s - open.length, e + close.length, v.slice(s, e),
                        s - open.length, e - open.length);
      }
      else {
        HN.replaceRange(el, s, e, open + v.slice(s, e) + close,
                        s + open.length, e + open.length);
      }
    },

    /* Whole lines, because both block buttons rewrite line starts. */
    selectedLines: function(el) {
      var v = el.value,
          from = v.lastIndexOf('\n', el.selectionStart - 1) + 1,
          to = v.indexOf('\n', el.selectionEnd);
      return { from: from, to: to == -1 ? v.length : to };
    },

    /*
     * Prefixes every touched line, or removes the prefix when all of them
     * already carry it. `needs_blank_line` is rule 4: code is only code after a
     * blank line, so a block written straight under a paragraph needs one made
     * for it, and a block at the top of the box needs nothing.
     */
    prefixLines: function(el, prefix, needs_blank_line) {
      var v = el.value,
          range = HN.selectedLines(el),
          lines = v.slice(range.from, range.to).split('\n'),
          on = lines.every(function(line) { return line.indexOf(prefix) === 0; }),
          body = lines.map(function(line) {
            return on ? line.slice(prefix.length) : prefix + line;
          }).join('\n'),
          lead = (!on && needs_blank_line && range.from > 0 &&
                  !/\n[ \t]*\n$/.test(v.slice(0, range.from))) ? '\n' : '';

      HN.replaceRange(el, range.from, range.to, lead + body,
                      range.from + lead.length,
                      range.from + lead.length + body.length);
    },

    /*
     * Buttons, help and the warning, above one textarea. Built only when
     * hnesFormatBar is on; with it off the box keeps HN's pinned help link and
     * nothing else about it changes.
     */
    addFormatTools: function(box, textarea, help, links_work) {
      var el = textarea[0],
          bar = $('<div/>').addClass('hnes-format-bar'),
          panel = HN.getFormattingHelp(links_work),
          warn = $('<div/>').addClass('hnes-format-warn').attr('aria-live', 'polite');

      HN.FORMAT_TOOLS.forEach(function(tool) {
        if (tool.linked && !links_work) return;
        // type="button" and not a bare <button>: inside HN's form the default
        // type is submit, so a formatting press would post the comment.
        $('<button type="button"/>').addClass('hnes-format-btn')
          .attr('title', tool.title)
          .text(tool.label)
          .on('click', function(e) { e.preventDefault(); tool.run(el); })
          .appendTo(bar);
      });

      // HN ships the "help" link already, so reuse it rather than growing a
      // second control for the same job. Its href stays, which keeps a
      // middle-click on /formatdoc working.
      if (!help.length) {
        help = $('<a/>').attr('href', 'formatdoc').text('help');
      }
      help.addClass('hnes-format-help-link');
      HN.wireHelpPanel(help, panel);
      bar.append(help);

      box.addClass('has-format-bar').prepend(bar).append(panel, warn);
      HN.watchFormatting(el, warn);

      // Bound on the textarea, not the document: the page-level key handler
      // ignores keys while a text box has focus, by design, so it cannot carry
      // this one.
      textarea.on('keydown', function(e) {
        if (e.key != 'i' && e.key != 'I') return;
        if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
        e.preventDefault();
        HN.wrapSelection(el, '*', '*');
      });
    },

    /*
     * The Markdown warning. Debounced because a pass is five regex scans of the
     * whole draft — O(n) in its length, which is cheap once and not cheap on
     * every keystroke of a long comment.
     */
    watchFormatting: function(el, warn) {
      // 0, not null: setTimeout hands back a number, and clearTimeout(0) is a
      // no-op, so the unset state can be the same type as the set one.
      var timer = 0,
          run = function() {
            var value = el.value;

            warn.empty();
            HN.FORMAT_LINTS.forEach(function(lint) {
              if (!lint.re.test(value)) return;

              var row = $('<p/>').text(lint.msg).appendTo(warn);
              if (!lint.to) return;

              $('<button type="button"/>').addClass('hnes-format-fix')
                .text(lint.fix)
                .on('click', function(e) {
                  e.preventDefault();
                  // The whole draft as one replacement, so the rewrite is one
                  // undo step rather than none.
                  HN.replaceRange(el, 0, el.value.length, HN.applyLint(lint, el.value), 0, 0);
                  el.setSelectionRange(el.value.length, el.value.length);
                  run();
                })
                .appendTo(row);
            });
          };

      $(el).on('input', function() {
        clearTimeout(timer);
        timer = setTimeout(run, 300);
      });
    },

    injectCSS: function() {
      $('head').append('<link rel="stylesheet" type="text/css" href="news.css">');
    },

    /*
     * boot.js hides the page at document_start by putting .hnes-pending on <html>;
     * dropping it here is what reveals the finished rewrite. The stylesheet also
     * reveals the page on a timer, so a throw before this point costs the user some
     * styling rather than a blank Hacker News.
     *
     * Held behind the settings read because rewriteNavigation is: the header is
     * built from a stored list of sections, and revealing first would show the
     * default tabs and then swap them. In practice this waits for nothing —
     * boot.js issued the read at document_start and it has landed by now — and
     * HNESModes.load resolves even when storage throws, so a reveal cannot be
     * lost to it. Queued after rewriteNavigation's callback, which is what puts
     * the nav on screen before the page is.
     */
    reveal: function() {
      HNESModes.ready(function() {
        document.documentElement.classList.remove('hnes-pending');
      });
    },

    /*
     * The Bootstrap Icons "gear-fill" glyph (MIT). Inline rather than a file so
     * it takes currentColor and rides the header link's own colour and hover
     * states. Solid rather than a stroked outline: at 15px on a saturated
     * ground, hairline strokes go muddy where a filled silhouette stays crisp.
     *
     * fill-rule="evenodd" is what punches the centre out. The inner circle is a
     * second subpath, and under the default nonzero rule its winding direction
     * decides whether it is a hole or a disc — evenodd makes that not matter.
     */
    GEAR_SVG: '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" fill-rule="evenodd" aria-hidden="true" focusable="false"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"></path></svg>',

    /*
     * A magnifier drawn as strokes, inline for the same reason as the gear.
     * Stroked rather than a library glyph so its weight can match the filled
     * gear beside it; the outline glyphs read as a hairline next to it.
     */
    SEARCH_SVG: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="6.5" cy="6.5" r="4.6"/><path d="M10.1 10.1 14.4 14.4"/></svg>',

    /*
     * The header's third cell — the login link when logged out, the user menu
     * and karma when logged in — so the icons sit at the right edge rather
     * than in among the section tabs, which are navigation and not controls.
     * That cell is right-aligned by the stylesheet. Search goes in first, the
     * gear last, and the login link or user menu HN put there stays between.
     * A page where HN ships no .pagetop in the cell gets one, so every caller
     * and every stylesheet rule sees the same parent.
     */
    headerSlot: function() {
      var cell = $('#header td:nth-child(3)').first(),
          slot = cell.find('.pagetop').first();
      // Wrapped, not appended: what the cell already held moves inside too.
      if (!slot.length && cell.length) {
        slot = cell.wrapInner($('<span/>').addClass('pagetop')).children('.pagetop');
      }
      return slot;
    },

    /*
     * Esc for a floating surface. Bound as it opens and cut by namespace as it
     * shuts, so no handler sits in front of keystrokes for a shut one.
     */
    escapeCloses: function(ns, close) {
      $(document).on('keydown.' + ns, function(e) {
        if (e.key === 'Escape') close();
      });
    },

    /*
     * Every floating surface at once: two showing together reads as a
     * rendering bug rather than as two menus. The older menus toggle .active
     * blindly, so their triggers have to lose it here or their next click
     * desyncs from what is on screen.
     */
    closeMenus: function() {
      $('.nav-drop-down').hide();
      $('.more-arrow > a.active').removeClass('active');
      if (HN.closeSettings) HN.closeSettings();
      if (HN.closeSearch) HN.closeSearch();
    },

    /*
     * Search, in the header rather than at the foot of the page where HN puts
     * it. Built here on every page instead of moving HN's form: HN prints one
     * on index and item pages only, and one form drawn the same way everywhere
     * beats two states. initElements drops HN's.
     *
     * Open and shut are one class on the form and CSS draws the width, so
     * reduced motion is a media query rather than a branch here.
     */
    initSearch: function() {
      var slot = HN.headerSlot();
      if (!slot.length) return;

      var input = $('<input/>').attr({
            type: 'search', name: 'q',
            placeholder: 'Search Hacker News', 'aria-label': 'Search Hacker News',
            autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false'
          }),
          toggle = $('<button/>').attr({ type: 'button', 'aria-label': 'Search', 'aria-expanded': 'false' })
                                .addClass('hnes-search-toggle')
                                .html(HN.SEARCH_SVG),
          form = $('<form/>').addClass('hnes-search')
                             .attr({ role: 'search', method: 'get', action: 'https://hn.algolia.com/' })
                             .append(input, toggle),
          query = function() { return String(input.val() || '').trim(); },
          // The class is the state: CSS draws the width off it, and reading it
          // back is a class check, not a layout.
          isOpen = function() { return form.hasClass('hnes-search-open'); },
          set = function(on) {
            form.toggleClass('hnes-search-open', on);
            // On the header, not the form: below the phone breakpoint the open
            // field takes the whole first row, and that is the row's rule.
            $('#header').toggleClass('hnes-searching', on);
            toggle.toggleClass('active', on).attr('aria-expanded', on ? 'true' : 'false');
          },
          close = function() {
            if (!isOpen()) return;
            set(false);
            $(document).off('.hnesSearch');
          },
          show = function() {
            if (isOpen()) return;
            HN.closeMenus();
            set(true);
            HN.escapeCloses('hnesSearch', function() {
              close();
              toggle.trigger('focus');
            });
            input.trigger('focus');
          };

      // mousedown, not click: a press on the icon would otherwise blur the
      // field first, and the focusout below would shut it before the click ran.
      toggle.on('mousedown', function(e) { e.preventDefault(); });
      // One control, never a dead one: shut it opens, open with text it
      // submits, open and empty it shuts.
      toggle.click(function() {
        if (!isOpen()) return show();
        if (query()) form.trigger('submit'); else close();
      });
      // Nothing to search for. The footer form used to send its own
      // placeholder text as the query.
      form.on('submit', function(e) {
        if (!query()) e.preventDefault();
      });
      // Left empty, it shuts. Text keeps it open, so a click elsewhere does not
      // lose a half-typed query. Moving to the button is not leaving.
      form.on('focusout', function(e) {
        var to = /** @type {Node | null} */ (e.relatedTarget);
        if (form[0].contains(to) || query()) return;
        close();
      });

      // The `/` binding's way in, and closeMenus's way out.
      HN.openSearch = show;
      HN.closeSearch = close;
      slot.prepend(form);
    },

    /*
     * The settings panel: one gear at the end of the nav, one panel behind it,
     * every mode in HNESModes drawn into it.
     *
     * This used to be three controls sitting in the nav — a cycle each for theme
     * and view, a menu for palette. The shapes differed because nav width decided
     * them and not because the settings differ, and neither shape had room to say
     * what `flow` or `newsprint` actually do. Behind a gear there is room, and the
     * nav is back to its own links plus an icon.
     *
     * The panel body is built on first open rather than at init. That is what lets
     * it read its selection off <html> instead of storage: boot.js's read has
     * certainly landed by the time someone clicks, so there is no second round
     * trip and no promise to thread from document_start to here.
     *
     * Recomputing the marks rather than tracking them is what makes a change
     * from another tab show up correctly here: there is no second copy of the
     * state to go stale. Every open recomputes, and so does the subscription
     * below, which covers a panel already on screen when the other tab writes.
     */
    initSettings: function() {
      var slot = HN.headerSlot();
      if (!slot.length) return;

      var link = $('<a/>').attr('href', 'javascript:void(0)')
                          .addClass('hnes-gear')
                          .attr('title', 'Display settings')
                          .attr('aria-label', 'Display settings')
                          .attr('aria-expanded', 'false')
                          .html(HN.GEAR_SVG),
          host = $('<span/>').addClass('hnes-settings-host').append(link),
          // An empty set rather than null: the panel is built on first open, and
          // every use before that (.not(), .css()) is a no-op on one.
          panel = $(),
          // Tracked rather than read back off the DOM: jQuery's :visible measures
          // the element, which forces a synchronous layout of the whole document —
          // expensive on a long thread, and for a fact we already know. Same
          // reason display is set directly rather than through .toggle(), which
          // resolves the default display by appending a probe element to <body>.
          open  = false,
          close = function() {
            if (!open) return;
            open = false;
            panel.css('display', 'none');
            link.removeClass('active').attr('aria-expanded', 'false');
            // Unbound with the panel: a document keydown handler otherwise sits
            // in front of every keystroke in a comment box for a panel that is
            // shut. Namespaced, so nothing else on the document is disturbed.
            $(document).off('.hnesSettings');
          };

      link.click(function(e) {
        e.stopPropagation();
        if (open) return close();

        HN.closeMenus();

        if (!panel.length) host.append(panel = HN.buildSettingsPanel());
        open = true;
        HN.markSettings(panel);
        // flex, not block: the panel is three rows and only the middle one
        // scrolls, so the strip and the reload bar stay on screen.
        panel.css('display', 'flex');
        link.addClass('active').attr('aria-expanded', 'true');

        // Click-away and Esc. The stopPropagation above is what makes binding
        // here safe as well as necessary: without it this very click would carry
        // on to the document and shut the panel again.
        $(document).on('click.hnesSettings', close);
        HN.escapeCloses('hnesSettings', close);
      });

      // A panel left open while another tab changes something: boot.js has
      // already restyled the page underneath it, so without this its marks say
      // one thing and the page says another.
      HNESModes.subscribe(function(touched) {
        // A behaviour change made anywhere leaves this page showing the old
        // nav, so the bar is owed here too — on the next open if not this one.
        if (touched.some(function(spec) { return !spec.attr; })) HN.settingsStale = true;
        if (open) HN.markSettings(panel);
      });

      // The `h` binding's way in. Guarded rather than a bare trigger, because
      // clicking the gear while it is open closes it — which would make the key
      // a toggle that fights whatever put the panel on screen.
      HN.openSettings = function() { if (!open) link.trigger('click'); };
      HN.closeSettings = close;

      slot.append(host);
    },

    /*
     * Reuses .nav-drop-down, the surface the user and "more" menus already use,
     * so the panel inherits their placement and elevation rather than growing a
     * second menu style. .hnes-settings then overrides the row styling, which is
     * the only part a list of options does differently from a list of links.
     */
    buildSettingsPanel: function() {
      var panel = $('<div/>').addClass('nav-drop-down hnes-settings');

      // Stopped once, at the panel, rather than per option: the click-away
      // handler is on the document, so without this a click on a group heading
      // or on the panel's own padding would close it. Picking an option still
      // reaches this on the way up, which is what keeps the panel open to pick
      // again.
      panel.click(function(e) { e.stopPropagation(); });

      // Consecutive specs sharing a label share one heading, which is what puts
      // two switches under a single "Reading" instead of a heading each.
      var groups = {}, order = [], heading = '';
      HNESModes.list.forEach(function(spec) {
        if (spec.label !== heading) {
          heading = spec.label;
          groups[heading] = $('<div/>').addClass('hnes-settings-group')
                                       .append($('<div/>').addClass('hnes-settings-label')
                                                          .text(spec.label));
          order.push(heading);
        }
        groups[heading].append(HN.buildSettingsRows(spec, panel));
      });

      // Not a mode, so it is not in the list — but it is a group like the rest
      // and a tab has to be able to name it.
      groups['Storage'] = HN.buildStorageGroup();
      order.push('Storage');

      panel.append(HN.buildSettingsTabs(groups, order));
      return panel.append(HN.buildReloadBar());
    },

    /*
     * One pane at a time. The panel had reached 1519px of content in a 536px
     * box: four of its seven groups were below the fold on a full-height
     * desktop, and the only thing saying so was an overlay scrollbar that macOS
     * fades out after a second.
     *
     * Every pane is built up front. The panel is already a lazy build — nothing
     * exists until the first open — and having paid that once, making a tab
     * switch cost a second one would be the wrong half to defer.
     */
    buildSettingsTabs: function(groups, order) {
      var strip = $('<div/>').addClass('hnes-settings-tabs').attr('role', 'tablist'),
          wrap  = $('<div/>').addClass('hnes-settings-panes'),
          tabs  = [],
          panes = [],
          taken = {},
          current = 0;

      var select = function(at) {
        current = at;
        tabs.forEach(function(tab, i) {
          var on = i === at;
          tab.toggleClass('hnes-settings-tab-on', on)
             .attr('aria-selected', on ? 'true' : 'false')
             // Roving tabindex: the strip is one stop for Tab, and the arrows
             // move within it. Four stops in a row would be four stops between
             // the gear and the first setting.
             .attr('tabindex', on ? '0' : '-1');
          panes[i].css('display', on ? 'block' : 'none');
        });
      };

      HNESModes.tabs.forEach(function(spec, i) {
        var pane = $('<div/>').addClass('hnes-settings-pane')
                              .attr('role', 'tabpanel')
                              .attr('id', 'hnes-pane-' + spec.id)
                              .attr('aria-labelledby', 'hnes-tab-' + spec.id);

        spec.groups.forEach(function(name) {
          if (!groups[name]) return;   // a tab may name a group a build dropped
          pane.append(groups[name]);
          taken[name] = true;
        });

        var tab = $('<button/>').attr('type', 'button')
                                .addClass('hnes-settings-tab')
                                .attr('role', 'tab')
                                .attr('id', 'hnes-tab-' + spec.id)
                                .attr('aria-controls', 'hnes-pane-' + spec.id)
                                .text(spec.label)
                                .click(function() { select(i); });

        tabs.push(tab);
        panes.push(pane);
        strip.append(tab);
        wrap.append(pane);
      });

      // A group no tab claimed goes in the pane that opens, rather than
      // nowhere. Adding a spec with a new label and forgetting HNESModes.tabs
      // should look wrong on sight, not silently drop the setting.
      order.forEach(function(name) {
        if (!taken[name] && panes.length) panes[0].append(groups[name]);
      });

      strip.on('keydown', function(e) {
        var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        // Wraps. Four tabs is short enough that walking off one end to reach
        // the other end is the shortest path about as often as not.
        select((current + step + tabs.length) % tabs.length);
        tabs[current].focus();
      });

      select(0);
      return $().add(strip).add(wrap);
    },

    /* Set when a spec with no `attr` changes — here or in another tab. Not
       cleared: the only thing that clears it is the reload it is asking for. */
    settingsStale: false,

    /*
     * A behaviour spec saves the instant it is clicked, but nothing on the page
     * moves: hn.js read it at document_end and built the header nav and the key
     * bindings from what storage said then. Clicking a section and watching the
     * header not change reads as the click having failed, which is the one
     * thing a settings panel must never look like. So it says so, and offers
     * the reload rather than leaving the user to find it.
     *
     * Below the panes rather than inside one, because it is raised by whichever
     * tab was open and answered by any of them.
     */
    buildReloadBar: function() {
      var row = $('<a/>').attr('href', 'javascript:void(0)')
                         .addClass('hnes-settings-opt hnes-settings-action')
                         .append($('<span/>').addClass('hnes-settings-text')
                           .append($('<span/>').addClass('hnes-settings-name')
                                               .text('Reload to apply'))
                           .append($('<span/>').addClass('hnes-settings-hint')
                                               .text('Saved. The header and the shortcuts are built on load')));
      row.click(function() { window.location.reload(); });
      return $('<div/>').addClass('hnes-settings-reload')
                        .css('display', 'none')
                        .append(row);
    },

    buildSettingsRows: function(spec, panel) {
      var opts = $('<div/>').addClass('hnes-settings-opts');

      // A swatch group's rows *are* the swatches — see the note in style.css.
      if (spec.ui === 'swatch') opts.addClass('hnes-settings-swatches');

      // A switch is one row for the whole spec: the state is the switch, so
      // drawing values[0] and values[1] as two rows would say it twice.
      if (spec.ui === 'toggle') {
        opts.append(HN.buildSettingsOpt(spec, spec.values[0], panel));
        if (spec.help) opts.append(HN.buildKeyHelp(spec.help));
        return opts;
      }

      // Above the rows, inside the same box: a set needs a line saying what
      // being in it means, which a list of named choices does not.
      if (spec.hint) opts.append($('<div/>').addClass('hnes-settings-note').text(spec.hint));
      spec.values.forEach(function(value) {
        opts.append(HN.buildSettingsOpt(spec, value, panel));
      });
      return opts;
    },

    buildSettingsOpt: function(spec, value, panel) {
      var toggle = spec.ui === 'toggle',
          row = $('<a/>').attr('href', 'javascript:void(0)')
                         .addClass('hnes-settings-opt')
                         .attr('data-hnes-opt', spec.key + ':' + value.id),
          text = $('<span/>').addClass('hnes-settings-text')
                             .append($('<span/>').addClass('hnes-settings-name')
                                                 .text(toggle ? spec.name : value.label)),
          hint = toggle ? spec.hint : value.hint;

      // The row carries the palette, so it paints itself in that palette's own
      // ground, ink and accent. It cannot drift from what picking it does,
      // because it is the same stylesheet rule doing both.
      if (spec.ui === 'swatch') {
        row.attr('data-hnes-palette', value.id)
           .append($('<i/>').addClass('hnes-swatch-bar'));
      }
      // Fourteen sections with a line of prose each would be the whole panel.
      // They carry it as a tooltip instead — which is where that text already
      // lives, on the nav links these rows decide the placement of.
      if (hint && spec.ui === 'multi') row.attr('title', hint);
      else if (hint) text.append($('<span/>').addClass('hnes-settings-hint').text(hint));
      row.append(text);
      // The switch is an <i> with no text, so on its own it is invisible to a
      // screen reader — the row would read as its label and say nothing about
      // which way it is set. markSettings keeps aria-checked in step.
      if (toggle) row.addClass('hnes-settings-switchrow')
                     .attr('role', 'switch')
                     .append($('<i/>').addClass('hnes-settings-switch'));

      row.click(function() {
        HNESModes.commit(spec, HN.nextSetting(spec, value));
        if (!spec.attr) HN.settingsStale = true;
        HN.markSettings(panel);
      });

      return row;
    },

    /*
     * What clicking a row means, which is the only thing that differs between
     * the `ui` kinds: a list picks, a switch flips, a set adds or removes.
     */
    nextSetting: function(spec, value) {
      if (spec.ui === 'toggle') {
        return HNESModes.current(spec) === spec.values[0].id
          ? spec.values[1].id : spec.values[0].id;
      }
      if (spec.ui === 'multi') {
        var selected = HNESModes.selected(spec),
            at = selected.indexOf(value.id);
        if (at >= 0) selected.splice(at, 1);
        else selected.push(value.id);
        return selected.join(',');
      }
      return value.id;
    },

    /*
     * The keyboard bindings, listed rather than settable. Rebinding is a real
     * feature with a real cost — capture, conflict checking, a reset — and the
     * thing actually missing was that they were nowhere written down.
     */
    buildKeyHelp: function(keys) {
      var list = $('<div/>').addClass('hnes-keys');
      keys.forEach(function(key) {
        list.append($('<kbd/>').text(key.id))
            .append($('<span/>').text(key.label));
      });
      return list;
    },

    /*
     * The `?` overlay. Built from the same `help` table buildKeyHelp draws
     * into the settings panel, so the two can never list different bindings.
     */
    /** @type {JQuery | null} */
    keyHelpEl: null,

    openKeyHelp: function() {
      if (HN.keyHelpEl) return;
      var keysSpec = HNESModes.spec('hnesKeys');
      if (!keysSpec || !keysSpec.help) return;
      var box = $('<div/>').addClass('hnes-keyhelp')
                           .attr('role', 'dialog')
                           .attr('aria-modal', 'true')
                           .attr('aria-label', 'Keyboard shortcuts')
                           .attr('tabindex', '-1')
                           .append($('<div/>').addClass('hnes-settings-label').text('Keyboard shortcuts'))
                           .append(HN.buildKeyHelp(keysSpec.help))
                           // Stopped here so the backdrop's own click-outside
                           // handler does not see the panel as "outside".
                           .click(function(e) { e.stopPropagation(); });
      HN.keyHelpEl = $('<div/>').addClass('hnes-keyhelp-backdrop')
                                .click(HN.closeKeyHelp)
                                .append(box)
                                .appendTo('body');
      HN.escapeCloses('hnesKeyHelp', HN.closeKeyHelp);
      box.trigger('focus');
    },

    closeKeyHelp: function() {
      if (!HN.keyHelpEl) return;
      $(document).off('.hnesKeyHelp');
      HN.keyHelpEl.remove();
      HN.keyHelpEl = null;
    },

    toggleKeyHelp: function() {
      if (HN.keyHelpEl) HN.closeKeyHelp(); else HN.openKeyHelp();
    },

    /*
     * Not a setting — the one place in the extension that can say how much it
     * is holding, and empty the one store that never shrinks. Comment collapse
     * state is written per comment and carries no expire stamp, so the sweep in
     * background.js steps over it and it has grown for the life of the
     * extension with no way to see it, let alone clear it.
     */
    buildStorageGroup: function() {
      var group = $('<div/>').addClass('hnes-settings-group')
                             .append($('<div/>').addClass('hnes-settings-label').text('Storage')),
          note = $('<div/>').addClass('hnes-settings-note'),
          row = $('<a/>').attr('href', 'javascript:void(0)')
                         .addClass('hnes-settings-opt hnes-settings-action')
                         .append($('<span/>').addClass('hnes-settings-text')
                           .append($('<span/>').addClass('hnes-settings-name')
                                               .text('Clear collapsed comments'))
                           .append($('<span/>').addClass('hnes-settings-hint')
                                               .text('Threads already open keep their state until reloaded'))),
          // A host permission can only be asked for from a user gesture on an
          // extension page, which a content script is not, so this row can do
          // no more than send the reader to the page that can ask. Via the
          // worker: openOptionsPage does not exist in content scripts, and a
          // web page may not navigate to an extension page that is not
          // web-accessible.
          algolia = $('<a/>').attr('href', 'javascript:void(0)')
                             .addClass('hnes-settings-opt hnes-settings-action')
                             .append($('<span/>').addClass('hnes-settings-text')
                               .append($('<span/>').addClass('hnes-settings-name')
                                                   .text('Theme hn.algolia.com'))
                               .append($('<span/>').addClass('hnes-settings-hint')
                                                   .text("Opt in on the extension's options page")));

      algolia.click(function() { chrome.runtime.sendMessage({ open: 'options' }); });

      // getBytesInUse rather than reading the store: this runs on every open,
      // and the store it is measuring is the one that gets large.
      chrome.storage.local.getBytesInUse(null, function(bytes) {
        note.text(HN.formatBytes(bytes) + ' stored');
      });

      row.click(function() {
        chrome.storage.local.get(null, function(all) {
          var keys = Object.keys(all).filter(function(key) {
            var value = all[key];
            return value && typeof value === 'object' && 'isCollapsed' in value;
          });
          chrome.storage.local.remove(keys, function() {
            chrome.storage.local.getBytesInUse(null, function(bytes) {
              note.text(keys.length + ' cleared — ' + HN.formatBytes(bytes) + ' left');
            });
          });
        });
      });

      return group.append(note)
                  .append($('<div/>').addClass('hnes-settings-opts').append(row).append(algolia));
    },

    formatBytes: function(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    /* Recomputed on every open rather than tracked, so the panel is right after
       a change made in another tab as well as one made in this one. */
    markSettings: function(panel) {
      panel.find('.hnes-settings-opt').removeClass('hnes-settings-on');
      HNESModes.list.forEach(function(spec) {
        // A switch that is off has no row to mark: its row is values[0], the
        // on state, so absence of the mark is what draws it off.
        var ids = spec.ui === 'multi' ? HNESModes.selected(spec)
                                      : [HNESModes.current(spec)];
        ids.forEach(function(id) {
          panel.find('[data-hnes-opt="' + spec.key + ':' + id + '"]')
               .addClass('hnes-settings-on');
        });
      });
      panel.find('.hnes-settings-switchrow').each(function() {
        $(this).attr('aria-checked', $(this).hasClass('hnes-settings-on') ? 'true' : 'false');
      });
      panel.find('.hnes-settings-reload')
           .css('display', HN.settingsStale ? 'block' : 'none');
    },

    /*
     * These used to proxy to the background page's localStorage over sendMessage.
     * Content scripts can reach chrome.storage.local directly, so the proxy is gone.
     * (hckrnews.com still issues one read per list item — that is now a direct
     * storage call rather than a message round trip, but it should be batched
     * the way HNComments.loadMeta already does.)
     *
     * Keys and values are still coerced to strings because that is what localStorage
     * did implicitly and the call sites depend on it: results are handed to JSON.parse,
     * and 'update_profile' is compared against the literal string "false".
     */
    getLocalStorage: function(key, callback) {
      var name = String(key);
      chrome.storage.local.get(name, function(items) {
        callback({ data: items[name] });
      });
    },

    setLocalStorage: function(key, value) {
      var item = {};
      item[String(key)] = String(value);
      chrome.storage.local.set(item);
    },

    getUserData: function(usernames, callback) {
      chrome.storage.local.get(usernames.map(String), function(items) {
        callback({ data: items });
      });
    },

    doLogin: function() {
      /*
       * HN serves this URL with no form more often than it looks: a 429 while
       * you are being rate limited, an error body, an already-logged-in
       * redirect. Everything below assumes the form and its submit button, so
       * bail before touching the document rather than rewriting half of it.
       *
       * Reaching the deref used to throw, which stopped hn.js before reveal()
       * and left the page blank until the stylesheet's failsafe animation fired
       * two seconds later — so the symptom was a long blank page followed by a
       * half-built one, on the page where a user is least able to guess why.
       * Same early-return shape doCreateAccount already uses below.
       */
      var submitButton = $('form input[type="submit"]').get(0);
      if (!submitButton) return;

      $('body').attr('id', 'login-body');
      document.title = "Login | Hacker News";

      HN.injectCSS();

      // save and remove (to be re-added later) any rogue messages outside of any tag (e.g. "Bad login.")
      var rogue_messages = $('body').contents().filter(function(){ return this.nodeType == 3; });
      var message = rogue_messages.text().trim();
      rogue_messages.remove();

      var recover_password_link = $('body > a');
      if (recover_password_link.length > 0)
        recover_password_link.remove();

      // remove login header, submit button (will be re-added later)
      $('body > b:first').remove();
      var buttonHtml = submitButton.outerHTML;
      $('form:first input[type=submit]').remove();

      var headerHtml = '<tr id="header"><td bgcolor="#ff6600"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:2px"><tbody><tr><td><a href="http://ycombinator.com"><img src="y18.svg" width="18" height="18" style="border:1px #ffffff solid;"></a></td><td><span class="pagetop" id="top-navigation"><span class="nav-links"><span><a href="/news" class="top" title="Top stories">top</a>|</span><span><a href="/newest" class="new" title="Newest stories">new</a>|</span><span><a href="/best" class="best" title="Best stories">best</a></span></div></span></span></td></tr></tbody></table></td></tr>';

      // wrap content into a table
      $('body > form:first').attr('id', 'login-form');
      $('#login-form').wrap('<tr id="content"><td></td></tr>');
      $('tr#content').wrap('<table border="0" cellpadding="0" cellspacing="0" width="85%"></table>');

      // add header table row and submit button row
      $('tr#content').before(headerHtml);
      $('#login-form tr:last').after('<tr><td></td><td>' + buttonHtml + '</td></tr>');

      $('table').wrap('<center></center>');
      $('#login-form').before('<h1>Login</h1>');

      if (recover_password_link.length > 0)
        $('#login-form').before(recover_password_link);

      // re-add rogue messages previously removed
      if (message)
        $('tr#content > td:first > h1').before(' <p id="login-msg">' + message + '</p>');

      // register?
      if ($("b:contains('Create Account')").length > 0) {
        HN.doCreateAccount();
      }
    },

    doCreateAccount: function() {
      // first check if doLogin() has already built a login prompt,
      // then check if there is another form present (e.g. Create Account)
      if ($('body#login-body').length == 0) return;
      if ($('body > form').length == 0) return;

      // save and remove title/form
      var formTitle = $('body > b').text();
      $('body > b').remove();
      $('body > form').attr('id', 'register-form');
      var formContent = $('#register-form').get(0).outerHTML;
      $('#register-form').remove();

      // rebuild title/form inside the existing table
      $('tr#content > td:last').append(formContent);

      // Same reason as doLogin: a create-account form without a submit button
      // is markup we do not recognise, and the heading is still worth adding.
      var submitButton = $('#register-form > input[type="submit"]').get(0);
      if (submitButton) {
        $('#register-form > input[type="submit"]').remove();
        $('#register-form tr:last').after('<tr><td></td><td>' + submitButton.outerHTML + '</td></tr>');
      }
      $('#register-form').before('<h1>Create Account</h1>');
    },

    doPostsList: function() {
      $("body").attr("id", "index-body");

      HN.init_keys();

      //HN.removeUpvotes();
      //with upvotes, the 'more' link needs to be shifted 1 more col
      HN.moveMoreLink();
      HN.formatScore();
      HN.formatURL();

      //check for new comments
      CommentTracker.checkIndexPage();
      //heat map points
      HN.getAndRateStories();
      //enable highlighting of clicked links
      HN.enableLinkHighlighting();

      HN.replaceVoteButtons();
    },

    /*addClassToCommenters: function() {
      //add class to comment author
      var commenters = $(".comhead a[href*=user]");
      commenters.addClass('commenter');
    },*/

    doCommentsList: function(pathname, track_comments) {
      //HN.addClassToCommenters();

      //add classes to comment page header (OP post) and the table containing all the comments
      var comments;

      var itemId = HN.currentItemId();
      // Direct children only: a poll's own options render as a table nested
      // inside the item header, and '#content table' would pick that up as
      // below_header[1] instead of the real comments table that follows the
      // header as its sibling (bug 1).
      var below_header = $('#content > td > table');

      // Three skeleton cards shaped like a comment, standing in for the plain
      // "Loading comments" box. The status text moves into loading_status,
      // updated below and in loadMoreLink — it's screen-reader only so the
      // cards stay the only thing a sighted reader sees while comments load.
      var skeletonCard = '<div class="hnes-skeleton-card">' +
          '<div class="hnes-skeleton-line hnes-skeleton-line-head"></div>' +
          '<div class="hnes-skeleton-line"></div>' +
          '<div class="hnes-skeleton-line hnes-skeleton-line-short"></div>' +
        '</div>';
      $('<div id="loading_comments" class="hnes-skeleton">' +
          '<p class="hnes-skeleton-status">Loading comments</p>' +
          skeletonCard + skeletonCard + skeletonCard +
        '</div>').insertBefore(below_header[1]);

      if (pathname == "/item") {
        $("body").attr("id", "item-body");
        $(below_header[0]).addClass('item-header');

        comments = $(below_header[1]);
        comments.addClass('comments-table');

        var poll = $('.item-header table');
        if (poll)
          HN.graphPoll(poll);

        //linkify self-post text
        $('.item-header tr:nth-child(3)').addClass('self-post-text').linkify();

        // The item subtext still carries HN's raw " | " pipes; the index
        // subline already dropped them, so bring this one in line.
        HN.stripPipes($('.item-header .subline'));

        //fix spacing issue #86
        $(".item-header td").removeAttr('colspan');

        //fixes issue #121 (indent on individual comment pages)
        $(".item-header td[class='ind']").remove()

        // move reply button to new line.
        $(".item-header input[type='submit']").css("display", "block");

        var more = $('.morelink');
        //recursively load more pages on closed thread
        if (more) {
          HN.loadMoreLink(more);
        }
      }
      else {// if (pathname == "/threads") {
        $("body").attr("id", "threads-body");
        comments = $(below_header[0]);
        comments.addClass('comment-tree');
        HN.doAfterCommentsLoad();
      }

      //do not want to track comments on 'more' pages
      //TODO: infinite scroll and tracking on 'more' pages
      //if (track_comments) {
      //  CommentTracker.init();
      //}
    },

    doUserProfile: function() {
      $('body').attr('id', 'user-body');
      $('#content > td').attr('id', 'user-profile');

      var options = $('tr > td[valign="top"]');
      var user = options[0];
      var created = $(options[1]);
      var karma = $(options[2]);
      var about = $(options[3]);

      about.next().addClass('hnes-user-about');
      HN.addUserTagControl($(user).next());
      HN.groupUserLinks(about);

      if (options.length === 4) {
        //other user pages
        $('#user-profile a[href^="submitted"]').parent().attr('id', 'others-profile-submitted');
        about.next().linkify();
      }
      else {
        //your user page
        $('#user-profile').addClass('your-profile');
        var email = $(options[4]);
        var showdead = $(options[5]);
        var noprocrast = $(options[6]);
        var maxvisit = $(options[7]);
        var minaway = $(options[8]);
        var delay;
        if($('tr > td[valign="top"]:contains("topcolor:")').length) {
          var topcolor = $(options[9]);
          topcolor.addClass('select-option');
          topcolor.next().append($('<span>Default: ff6600</span>'));
          delay = $(options[10]);
        }
        else {
          delay = $(options[11]);
        }

        //fix spacing
        email.addClass('select-option');
        showdead.addClass('select-option');
        noprocrast.addClass('select-option');
        maxvisit.addClass('select-option');
        minaway.addClass('select-option');
        delay.addClass('select-option');
        $('#user-profile a[href="changepw"]').parent().attr('id', 'your-profile-change-password');

        var current_karma = parseInt(karma.next().text());
        var karma_for_flag = 21;
        var karma_for_polls = 201;
        var karma_for_downvotes = 501;
        var can_flag_msg;
        var can_create_polls_msg;
        var can_downvote_msg;
        if (current_karma < karma_for_flag) {
          can_flag_msg = $('<p>You need ' + (karma_for_flag - current_karma) + ' more karma until you can flag posts.</p>');
        }
        else {
          can_flag_msg = $('<p>You can flag posts.</p>');
        }
        if (current_karma < karma_for_polls) {
          can_create_polls_msg = $('<p>You need ' + (karma_for_polls - current_karma) + ' more karma until you can create a poll.</p>');
        }
        else {
          can_create_polls_msg = $('<p>You can <a href="//news.ycombinator.com/newpoll">create a poll</a>.</p>');
        }
        if (current_karma < karma_for_downvotes) {
          can_downvote_msg = $('<p>You need ' + (karma_for_downvotes - current_karma) + ' more karma until you can downvote comments.</p>');
        }
        else {
          can_downvote_msg = $('<p>You can downvote comments.</p>');
        }
        karma.next().append(can_flag_msg).append(can_create_polls_msg).append(can_downvote_msg);

        // Same disclosure as the comment box's, and the same rules behind it.
        // Built shut rather than on first click: the panel is a handful of list
        // items, and lazily creating it was what kept this from sharing the
        // comment box's toggle in the first place.
        var about_help = about.next().find('a[href="formatdoc"]');
        if (about_help.length) {
          about.next().append(HN.wireHelpPanel(about_help, HN.getFormattingHelp(false)));
        }

        var dead_explanation = $('<p>Showdead allows you to see all the submissions and comments that have been killed by the editors.</p>');
        showdead.next().append($('<span>Default: no</span>')).append(dead_explanation);

        var noprocrast_explanation = $('<p>Noprocast is a way to prevent yourself from spending too much time on Hacker News. If you turn it on you\'ll only be allowed to visit the site for maxvisit minutes at a time, with gaps of minaway minutes in between.</p>');
        noprocrast.next().append($('<span>Default: no</span>')).append(noprocrast_explanation);

        maxvisit.next().append($('<span>Default: 20</span>'));
        minaway.next().append($('<span>Default: 180</span>'));

        var delay_explanation = $('<p>Delay allows you to delay the public posting of comments you make for delay minutes.</p>');
        delay.next().append($('<span>Default: 0</span>')).append(delay_explanation);

        //redirect to profile page after updating, instead of /x page
        $('input[value="update"]').click(function() {
          HN.setLocalStorage('update_profile', window.location.href);
        });
      }

      // Loads the stored tag onto the control just built and wires up its
      // click/keyup handlers — HNComments.apply does this for a comment page,
      // but /user never runs that, so nothing else will.
      HN.addInfoToUsers();
    },

    /*
     * Beside the username, cloned from the comment template's .author so it is
     * the same markup, not a lookalike. addInfoToUsers, editUserTag and
     * setUserTag all find their targets by walking up from an anchor inside
     * .author — that's what lets a tag set here show up in comments and back.
     */
    addUserTagControl: function(valueCell) {
      // HN's own cell holds the name. The URL query is attacker-controlled.
      var username = valueCell.text().trim();
      var template = /** @type {HTMLTemplateElement} */ (new HNComments(0).commentTemplate).content;
      var author = document.importNode(
        /** @type {Element} */ (template.querySelector('.author')), true);
      var link = /** @type {HTMLAnchorElement} */ (author.querySelector('a'));
      link.href = 'user?id=' + encodeURIComponent(username);
      link.textContent = username;
      var icon = /** @type {HTMLImageElement} */ (author.querySelector('.hnes-tag-icon'));
      icon.src = chrome.runtime.getURL('/images/tag.svg');
      valueCell.empty().append(author);
    },

    /*
     * HN prints submissions/comments/favorites (plus hidden/upvoted/changepw on
     * your own page) as a stack of one-link rows below the fields table. Pull
     * them out into one row of pills instead, right after "about".
     */
    groupUserLinks: function(about) {
      var links = $('#user-profile').find(
        'a[href^="submitted"], a[href^="threads"], a[href^="favorites"], a[href^="hidden"], a[href^="upvoted"], a[href="changepw"]'
      );
      if (!links.length) return;

      var pillRow = $('<div class="hnes-user-links">');
      links.each(function() {
        $(this).closest('tr').remove();
        pillRow.append($(this).addClass('hnes-pill'));
      });
      $('<tr><td colspan="2"></td></tr>').find('td').append(pillRow).end()
        .insertAfter(about.closest('tr'));
    },

    /*
     * The rules as a list, built from FORMAT_RULES so the comment box and the
     * profile's `about` field cannot drift apart the way the old hardcoded
     * copy drifted from /formatdoc.
     */
    getFormattingHelp: function(links_work) {
      var list = $('<ul/>');

      HN.FORMAT_RULES.forEach(function(rule) {
        if (rule.linked && !links_work) return;
        // .text() and not an HTML string: rule 6 contains <angle brackets>.
        list.append($('<li/>').text(rule.text));
      });

      var no = HN.FORMAT_UNSUPPORTED.slice(),
          last = no.pop();

      return $('<div class="input-help"/>')
        .append(list)
        .append($('<p class="input-help-unsupported"/>')
          .text('No ' + no.join(', ') + ' or ' + last + '.'));
    },

    prettyPrintDaysAgo: function(days) {
      //copied from http://stackoverflow.com/a/8942982
      var str = '';
      var values = {
        ' year': 365,
        ' month': 30,
        ' day': 1
      };

      for (var x in values) {
        var amount = Math.floor(days / values[x]);

        if (amount >= 1) {
          str += amount + x + (amount > 1 ? 's' : '');
          if (x != ' day') {
            str += ' ';
          }
          days -= amount * values[x];
        }
      }

      return str;
    },

    graphPoll: function(poll) {
      poll.addClass('poll-options');
      var totalscore = 0;
      var poll_scores = poll.find('.default');
      poll_scores.each(function() {
        var score = Number($(this).text().split(' ')[0]);
        totalscore += score;
      });
      // Each score row sits directly after its option row (tr.athing), so the
      // two lists share an order. Folding the bar into the option row itself,
      // rather than the row(s) HN gives the score, is what turns three rows
      // into one.
      poll.find('tr.athing').each(function() {
        var $option = $(this);
        var $scoreRow = $option.next();
        var score = Number($scoreRow.find('.default').text().split(' ')[0]);
        var pct = totalscore > 0 ? Math.round(score / totalscore * 100) : 0;
        if (score > 0) {
          pct = Math.max(pct, 1);
        }

        var $bar = $('<div/>').addClass('poll-graph')
          .append($('<div/>').addClass('poll-graph-track')
            .append($('<div/>').addClass('poll-graph-fill').css('width', pct + '%')))
          .append($('<span/>').addClass('poll-graph-score')
            .append($scoreRow.find('.comhead'))
            .append(' · ' + pct + '%'));

        $option.find('td.comment').append($bar);
        $scoreRow.remove();
      });
    },

    loadMoreLink: function(elem) {
      if (elem.length == 0) {
        HN.doAfterCommentsLoad();
        return;
      }

      var loading_status = document.querySelector('#loading_comments .hnes-skeleton-status');
      if (loading_status) {
        loading_status.textContent += '.';
      }

      var moreurl = elem.attr('href');
      var load_div = $('<div/>');
      load_div.load(moreurl + " > center > table > tbody > tr:nth-child(3) > td > table > tbody > tr", function(response) {
        $(".comments-table > tbody").append(load_div.children());
        $(".morelink").remove();
        var morelink = $('.title a[rel="nofollow"]:contains(More)');
        if (morelink) {
          HN.loadMoreLink(morelink);
        }
      });
    },

    doAfterCommentsLoad: function() {
      HN.hnComments.apply();
      var loading_status = document.querySelector('#loading_comments .hnes-skeleton-status');
      if (loading_status) {
        loading_status.textContent = "Rendering comments...";
      }
    },

    // Only ever called for a post list. The comment-page branch that used to sit
    // here called jQuery's .size(), removed in 3.0, so it could not have run
    // since the 3.2.1 upgrade.
    replaceVoteButtons: function() {
      $('img[src$="grayarrow.gif"]').replaceWith('<div class="up-arrow"></div>');
      $('img[src$="graydown.gif"]').replaceWith('<div class="down-arrow last-arrow"></div>');
      $('div.up-arrow').addClass('postlist-arrow');
    },

    addInfoToUsers: function() {
      var author_els = document.querySelectorAll('.author a');
      var usernames = Array.from(author_els).map( x => x.textContent );

      // Threads repeat authors heavily; the loop below still needs the
      // index-aligned list, but the storage read only needs each name once.
      HN.getUserData([...new Set(usernames)], response => {
        if (!response) return;
        var userData = response.data;
        for (var i = 0; i < author_els.length; i++) {
          var author_el = author_els[i],
              name = usernames[i],
              userInfo = userData[name];

          if (userInfo) {
            // The bare-number legacy format is converted once during the MV2
            // storage migration (normalizeLegacyValue in background.js), so
            // everything arriving here is already '{"votes":n,"tag":…}'.
            var info;
            try {
              info = JSON.parse(userInfo);
            }
            catch (e) {
              info = {}
            }
            // display user tag and score
            if (info.tag) HN.displayUserTag(author_el, info.tag || '');
            if (info.votes) HN.displayUserScore(author_el, info.votes);
          }
        };
      });


      $(document).on('click', '.hnes-tag, .hnes-tagText', function(e) {
      // Using .on() so that the event applies to all elements generated in the future
        HN.editUserTag(e);
      });

      $(document).on('keyup', '.hnes-tagEdit', function(e) {
        var code = e.keyCode || e.which,
            parent = $(e.target).parent(),
            gp = parent.parent();

        if (code === 13) { // Enter
          var author = gp.find('a').text(),
              tagEdit = parent.find('.hnes-tagEdit');
          HN.setUserTag(author, tagEdit.val());
          parent.removeClass('edit');
        }
        if (code === 27) { // Escape
          var tagText = parent.find('.hnes-tagText'),
              tagEdit = parent.find('.hnes-tagEdit');
          tagEdit.val(tagText.text());
          parent.removeClass('edit');
        }
      });
    },

    upvoteUserData: function(author, value) { // Adds value to the user's upvote count, saves and displays it.
      var commenter = $('.author:contains('+author+')');
      HN.getLocalStorage(author, function(response) {
        var userInfo = {},
        new_upvote_total = value;

        if (response.data) {
          userInfo = JSON.parse(response.data);
        }

        if (userInfo.votes) { // If we already have up/downvoted this user before.
          new_upvote_total += userInfo.votes;
        }
        userInfo.votes = new_upvote_total;
        if (new_upvote_total === 0) {
          delete userInfo.votes;
        }
        HN.setLocalStorage(author, JSON.stringify(userInfo));
        HN.showNewUserScore(author, new_upvote_total); // Set the upvote count
      });
    },

    showNewUserScore: function(author, value) {
      var author_els = $('.author:contains('+author+')');
      for (var i = 0; i < author_els.length; i++) {
        var author_el = author_els[i];
        var score_el = author_el.querySelector('.hnes-user-score');
        if (value !== 0) {
          score_el.textContent = value;
          score_el.parentElement.classList.remove('noscore');
        } else {
          score_el.parentElement.classList.add('noscore');
        }
      }
    },

    displayUserScore: function(el, upvotes) {
      var userscoreEl = el.parentElement.querySelector('.hnes-user-score');
      userscoreEl.textContent = upvotes;
      userscoreEl.parentElement.classList.remove('noscore');
    },

    displayUserTag: function(el, tag) {
      if (tag) {
        el.parentElement.querySelector('.hnes-tagText').textContent = tag;
        el.parentElement.querySelector('.hnes-tagEdit').value = tag;
      }
    },

    editUserTag: function(e) {
      var parent = $(e.target).parent(),
          tagEdit = parent.find('.hnes-tagEdit'),
          tagText = parent.find('.hnes-tagText');
      parent.addClass('edit');
      tagEdit.focus();
    },

    setUserTag: function(author, tag) {
      HN.getLocalStorage(author, function(response) {
        var userInfo = {};

        if (response.data)
          userInfo = JSON.parse(response.data);

        if (tag !== '')
          userInfo.tag = tag;
        else
          delete userInfo.tag;

        HN.setLocalStorage(author, JSON.stringify(userInfo));
      });

      var commenter = $('.author:contains('+author+')');
      for (var i = 0; i < commenter.length; i++) {
        var tagText = $(commenter[i]).parent().find('.hnes-tagText'),
            tagEdit = $(commenter[i]).parent().find('.hnes-tagEdit');

        // Change it all to the new value:
        tagText.text(tag);
        tagEdit.val(tag);
      }
    },

    removeNumbers: function() {
      $('td[align="right"]').remove();
    },

    formatScore: function() {
      $('.subtext').each(function(){
        var $this = $(this);

        // Job rows carry no score span and no author link, so a positional
        // guess (first span, first/second link) lands on the age instead.
        var score = $this.find('span.score');
        var as = $this.find('a');
        var by = $this.find('a.hnuser');
        var at = $this.find('.age a');
        var comments;

        if (score.length == 0)
          score = $("<span/>");
        else
          score.text(parseInt(score.text()));
        score.addClass("score").attr('title', 'Points');

        if ($(as[as.length - 1]).text() != 'web') {
          comments = $(as[as.length - 1]);
        }
        else {
          comments = $('<a>-</a>');
        }

        // Function-scoped, not shared: this runs per row, and as a global every
        // row read whatever the previous one wrote.
        var comments_link = $(at).attr('href');

        if (comments.text() == "discuss" || /ago$/.test(comments.text())) {
          comments = $("<a/>").html('0')
                              .attr('href', comments.attr('href'));
        }
        else if (comments.text() == "comments") {
          comments = $("<a/>").html('?')
                              .attr('href', comments.attr('href'));
        }
        else if (comments.text() == "") {
          score.text('');
        }
        else {
          comments.text(parseInt(comments.text()) || '-');
        }

        comments.attr('href', comments_link);
        comments.addClass("comments")
        comments.attr('title', 'Comments');

        var by_el;
        if (by.length == 0)
          by_el = $("<span/>");
        else
          by_el = $('<span/>').addClass('submitter')
                              .text('by ')
                              .append(by.attr('title', 'View profile'));

        // Grouped in one wrapper so a narrow viewport can drop the whole
        // subline to its own row without disturbing the title/domain above it.
        var subline = $('<span/>').addClass('hnes-subline').append(by_el);

        var score_el = $('<td/>').append(score);
        var comments_el = $('<td/>').append(comments);
        var $prev = $this.parent().prev();
        $prev.prepend(score_el);
        $prev.prepend(comments_el);
        $prev.find('.title').append(subline);
        $this.parent().next().remove();
        $this.parent().remove();

        subline.append(
          $('<span />').addClass('hnes-age').text(at.text()),
          $('<span />').addClass('hnes-actions').append(
              $this.find('a[href^=flag]'),
              $this.find('a[href^=vouch]'),
              $this.find('a[href^="https://hn.algolia.com/?query="]'),
              $this.find('a[href^=hide]'),
              $this.find('a[href^="https://www.google.com/search?q="]')
          )
        );
      });
    },

    highlightCommentsLink: function(e) {
      $(this).toggleClass('hover-comments-score')
      $(this).next().toggleClass('hover-comments-score');
    },
    highlightScoreLink: function(e) {
      $(this).toggleClass('hover-comments-score')
      $(this).prev().toggleClass('hover-comments-score');
    },

    formatURL: function() {
        $('.comhead').each(function() {
          var url_el = $('<span/>').text(
                         $(this).text().substring(2, $(this).text().length - 1)
                       );
          var left_paren = $('<span/>').addClass('paren')
                                       .text('(');
          var right_paren = $('<span/>').addClass('paren')
                                        .text(')');
          $(this).text('');
          $(this).append(left_paren)
                 .append(url_el)
                 .append(right_paren);
        });
    },

    moveMoreLink: function() {
      $('#more').prev().attr('colspan', '3');
    },
    removeUpvotes: function() {
      var titles = $('.title');
      if ($(titles[titles.length - 1]).attr('id') == "more")
        $('.title').slice(0, -1).siblings().remove();
      else
        $('.title').siblings().remove();
    },

    rewriteUserNav: function(pagetop) {
      var user_links = $('<span/>').addClass('nav-links');
      var as = pagetop.find('a');
      var user_profile = $(as[0]);
      var logout = $(as[1]);
      var user_name = user_profile.text();

      var user_drop = $('<span/>').append(
                        $('<a/>').text(user_name)
                                 .attr('href', '#')
                      ).attr('title', 'Toggle user links')
                      .attr('id', 'my-more-link')
                      .addClass('more-arrow');

      logout.detach();
      user_profile.detach();
      var score_str = pagetop.text();
      var regex = /\(([^)]+)\)/;
      var matches = regex.exec(score_str);
      var score = matches[1];

      var score_elem = $('<span/>').text('|')
                                   .append(
                                     $('<span/>').text(score)
                                                 .attr('id', 'my-karma')
                                                 .attr('title', 'Your karma')
                                   );
      user_links.append(score_elem);
      pagetop.empty();
      pagetop.append(user_links.prepend(user_drop));

      var hidden_div = $('<div/>').attr('id', 'user-hidden')
                                  .addClass('nav-drop-down');
      var user_pages = [ ['profile', '/user', 'Your profile and settings'],
                         ['comments', '/threads', 'Your comments and replies'],
                         ['submitted', '/submitted', "Stories you've submitted"],
                         ['upvoted', '/upvoted', "Stories you've voted for"],
                         ['favorites', '/favorites', "Stories you've favorited"]
                       ];
      // An empty set is the sentinel: .text() and .append() on one are no-ops,
      // so nothing downstream needs a null check.
      var new_active = $();
      for (var i in user_pages) {
        var link_text = user_pages[i][0];
        var link_href = user_pages[i][1];
        var link_title = user_pages[i][2];
        var link = $('<a/>').text(link_text)
                            .attr('href', link_href + '?id=' + user_name)
                            .attr('title', link_title);

        if (window.location.pathname == link_href)
          new_active = link.clone().addClass('nav-active-link')
                                   .addClass('new-active-link');

        hidden_div.append(link);
      }
      if (new_active.length) {
        /*
         * `||` here made the guard always true — no path is both /upvoted and
         * /favorites — so the two pages it names were the two it let through,
         * and they are exactly the two with no ?id= to match. The deref below
         * threw for every logged-in user on either of them. Found by the type
         * checker; nothing tests a logged-in session.
         *
         * The match is checked as well as the path, because HN drops ?id= on
         * more pages than these two when you are looking at your own.
         */
        var id_match = window.location.pathname != '/upvoted' &&
                       window.location.pathname != '/favorites' &&
                       window.location.search.match(/id=(\w+)/);
        if (id_match) {
          var user_id = id_match[1];
          if (user_id == user_name)
            user_id = 'Your';
          else
            user_id = user_id + "'s";
          new_active.text(user_id + " " + new_active.text());
        }
        // Queued rather than appended: the tab strip this reaches into is built
        // from a stored setting now, so it may not exist yet. ready() fires in
        // order, and rewriteNavigation queued first.
        HNESModes.ready(function() {
          $('#top-navigation .nav-links').append($('<span/>')
                                         .text('|')
                                         .append(new_active));
        });
      }

      hidden_div.append(
        logout.attr('id', 'user-logout')
              .attr('title', 'Logout')
      );
      user_links.append(hidden_div);

      HN.wireDropDown(user_drop, hidden_div);
      hidden_div.hide();
      HN.setTopColor();
    },
    /*
     * Which sections are header tabs and which sit under "more" is a stored
     * preference now, so the header cannot be built until the read lands.
     * reveal() waits on the same queue and was queued after this, so the page is
     * never shown wearing the default tabs and then corrected.
     */
    rewriteNavigation: function() {
      HNESModes.ready(function() {
        // A missing spec would mean the descriptor list moved under us; showing
        // every section beats showing none.
        var nav_spec = HNESModes.spec('hnesNav'),
            chosen = nav_spec ? HNESModes.selected(nav_spec) : null,
            visible_pages = [],
            hidden_pages = [];

        // Split in HNESModes.sections order rather than in the order they were
        // picked, so moving one section across never reorders the others.
        HNESModes.sections.forEach(function(section) {
          (!chosen || chosen.indexOf(section.id) >= 0 ? visible_pages : hidden_pages).push(section);
        });

        HN.paintNavigation(visible_pages, hidden_pages);
      });
    },

    paintNavigation: function(visible_pages, hidden_pages) {
        var topsel = $('.topsel');
        var navigation = $('td:nth-child(2) .pagetop');
        navigation.attr('id', 'top-navigation');

        if (topsel.length == 0) {
          topsel = $('<span/>').addClass('nav-links');
          navigation.append(topsel);
        }
        else {
          topsel.removeClass('topsel').addClass('nav-links');
          topsel.empty();
        }
        visible_pages.forEach(function(section) {
          var span = $('<span/>').text('|');
          var new_link = $('<a/>').attr('href', section.href)
                                  .text(section.label)
                                  .addClass(section.label)
                                  .attr('title', section.hint);

          if (window.location.pathname == section.href)
            new_link.addClass('nav-active-link')

          topsel.append(span.prepend(new_link));
        });
        if (window.location.pathname == '/')
          $('.top').addClass('nav-active-link');

        var more_link = $('<span/>').append($('<a/>')
                                    .text('more')
                                    .attr('href', '#'))
                                    .attr('title', 'Toggle more links')
                                    .attr('id', 'nav-more-link')
                                    .addClass('more-arrow');
        var hidden_div = $('<div/>').attr('id', 'nav-others')
                                    .addClass('nav-drop-down');

        // The current section can be one of the hidden ones. It still needs a
        // pill, but beside the others where "top" sits, not bolted on after
        // "more" — and once it's up here it shouldn't also sit in the drawer.
        var new_active = $();
        hidden_pages.forEach(function(section) {
          var link = $('<a/>').attr('href', section.href)
                              .attr('title', section.hint)
                              .text(section.label)
                              .addClass(section.label);
          if (window.location.pathname == section.href) {
            new_active = link.addClass('nav-active-link new-active-link');
          } else {
            hidden_div.append(link);
          }
        });
        var hasHidden = hidden_div.children().length > 0;

        if (new_active.length)
          topsel.append($('<span/>').text('|').append(new_active));

        // Nothing left over means no menu to open: promoting every section is a
        // reachable choice now, and a "more" with an empty drawer under it is
        // the kind of dead affordance the panel exists to avoid.
        if (hasHidden) topsel.append(more_link);

        navigation.empty().append(topsel);

        // Sibling of .nav-links, not a child of it: below the mobile
        // breakpoint .nav-links scrolls sideways, and an overflow:auto
        // ancestor clips an absolutely positioned descendant's drawer even
        // though the drawer itself escapes normal flow to float over the page.
        if (hasHidden) navigation.append(hidden_div);

        HN.wireDropDown(more_link, hidden_div);

        if (hasHidden) {
          hidden_div.offset({'left': more_link.position().left});
          hidden_div.hide();
        }
    },

    /* Both header dropdowns behave alike: the trigger's link marks itself
       active while the drawer is open, and a click on either closes it. */
    wireDropDown: function(trigger, drawer) {
      var toggle = function() {
        // Read off the inline style hide() sets rather than :visible, which
        // would force a layout to learn a fact already on the element.
        if (drawer[0].style.display === 'none') HN.closeMenus();
        trigger.find('a').toggleClass('active');
        drawer.toggle();
      };
      trigger.click(toggle);
      drawer.click(toggle);
    },

    toggleMoreNavLinks: function(e) {
      var others = $('#nav-others');
      others.toggle();
    },

    setTopColor: function(){
      // HN tints the header on special days. The dropdowns no longer follow it —
      // they are menu surfaces floating over the page now, not extensions of the
      // header, and inheriting the tint is what made them read as orange smears.
      // (The old .nav-drop-down a:hover rule was a no-op anyway; jQuery cannot
      // set styles on a pseudo-class.)
      var header = document.getElementById("header"),
          headerCell = header && header.children[0],
          topcolor = headerCell && headerCell.getAttribute("bgcolor");

      if (topcolor && topcolor.toLowerCase() != '#ff6600') {
        $('#header').css('background-color', topcolor);
      }
    },

    /*
     * The settings are read inside the handler rather than gating the binding,
     * so turning shortcuts off in one tab is honoured by every open tab at the
     * next keystroke rather than at its next load. It costs a cached lookup per
     * keydown, on a handler that already runs on every keydown.
     */
    init_keys: function(){
        var j = 74, // Next Item
            k = 75, // Previous Item
            o = 79, // Open Story
            p = 80, // View Comments
            h = 72, // Open Help
            l = 76, // New tab
            c = 67, // Comments in new tab
            b = 66, // Open comments and link in new tab
            slash = 191, // Search; with shift it is `?`, the overlay listing all of these
            shiftKey = 16; // allow modifier
        $(document).keydown(function(e){
          // Typing is not navigation. This used to check one flag set by the
          // search box's own focus handler, which left every comment box and
          // the submit form unguarded — `j` mid-reply scrolled the page out
          // from under it. Asking the focused element covers all of them, and
          // covers boxes HN adds later without being told about them.
          // jQuery's types say Document here; the runtime value is the focused
          // element, which is what the instanceof below establishes.
          var el = /** @type {*} */ (e.target);
          if (el instanceof HTMLElement &&
              (el.isContentEditable ||
               /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
          if (e.ctrlKey || !HNESModes.on('hnesKeys')) return;

          if (e.which == j) {
            HN.next_story();
          } else if (e.which == k) {
            HN.previous_story();
          } else if (e.which == l) {
            HN.open_story_in_new_tab();
          } else if (e.which == o) {
            HN.open_story_in_current_tab();
          } else if (e.which == p) {
            HN.open_comments_in_current_tab();
          } else if (e.which == slash && e.shiftKey) {
            HN.toggleKeyHelp();
          } else if (e.which == slash) {
            // Stopped, or the `/` lands in the field it just focused — and in
            // Firefox it opens quick find as well.
            e.preventDefault();
            if (HN.openSearch) HN.openSearch();
          } else if (e.which == h) {
            // The help this key was bound to was never written; the panel lists
            // these bindings, so it is the screen the binding always meant.
            if (HN.openSettings) HN.openSettings();
          } else if (e.which == b) {
            HN.open_comments_in_new_tab();
            HN.open_story_in_new_tab();
          }
        })
    },

    open_story_in_current_tab: function() {
      HN.open_story(false);
    },
    open_story_in_new_tab: function() {
      HN.open_story(true);
    },
    open_comments_in_current_tab: function() {
      HN.view_comments(false);
    },
    open_comments_in_new_tab: function() {
      HN.view_comments(true);
    },

    next_story: function() {
      HN.next_or_prev_story(true);
    },
    previous_story: function() {
      HN.next_or_prev_story(false);
    },

    next_or_prev_story: function(next){
      if ($('.on_story').length == 0) {
        if (next)
          $('#content tr:first').addClass("on_story");
      } else {
        var current = $('.on_story');
        var next_lem;
        if (next)
          next_lem = current.next();
        else
          next_lem = current.prev();
        if (next_lem.length) {
          next_lem.addClass("on_story");
          $('html, body').stop();
          var top = next_lem.offset().top - 10;
          // Same failsafe as the spine transition: a motion-sensitive reader
          // gets the jump, not the 200ms scroll.
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            $('html, body').scrollTop(top);
          } else {
            $('html, body').animate({ scrollTop: top }, 200);
          }
          current.removeClass("on_story");
        }
      }
    },

    open_story: function(new_tab){
      if ($('.on_story').length != 0) {
        var story = $('.on_story .title .titleline > a');
        if (new_tab) {
          $('.on_story .title').addClass("link-highlight");
          window.open(story.attr("href"));
        }
        else
          window.location = story.attr("href");
      }
    },

    view_comments: function(new_tab){
      if ($('.on_story').length != 0) {
        var comments = $('.on_story .comments');
        if (comments.length != 0) {
          if (new_tab)
            window.open(comments.attr("href"));
          else
            window.location = comments.attr("href");
        }
      }
    },

    getAndRateStories: function() {
      var NO_HEAT = 50;
      var MILD    = 75;
      var MEDIUM  = 99;
      $('.score').each(function(i){
        // parseInt rather than the string compare this used to do: "" coerced to
        // 0 and took the no-heat branch, which is a real score of zero. A row
        // with no score at all is skipped instead.
        var score = parseInt($(this).html().replace(/[a-z]/g, ''), 10);
        if (isNaN(score)) return;

        if (score < NO_HEAT) {
          $(this).addClass('no-heat');
        } else if (score < MILD) {
          $(this).addClass('mild');
        } else if (score < MEDIUM) {
          $(this).addClass('medium');
        } else {
          $(this).addClass('hot');
        };
      });
    },

    enableLinkHighlighting: function() {
      $('.title a:link').click(function() {
          $(this).closest('td').addClass('link-highlight');
      });
    }
}

//show new comment count on hckrnews.com
if (window.location.host == "hckrnews.com") {
  // Gated on the setting because this is the one place HNES touches a host
  // other than Hacker News, and until the panel existed there was no way to
  // find that out, let alone stop it. The read is skipped, not just the
  // rendering — the point of switching it off is the reads.
  HNESModes.ready(function() {
    if (!HNESModes.on('hnesHckrnews')) return;
    $('ul.entries li').each(function() {
      HN.getLocalStorage($(this).attr('id'), function(response) {
        if (response.data != undefined) {
          var data = JSON.parse(response.data);
          var id = data.id;
          var num = data.num ? data.num : 0;
          var now = Number($('#'+id).find('.comments').text());
          var unread = Math.max(now - num, 0);
          var prepend = unread == 0 ? "" + unread + " / " : "<span>"+unread+"</span> / ";
          $(document).ready(function() {
            $('#'+id).find('.comments').prepend(prepend);
          });
        }
      });
    });
  });
}
else {
  HN.init();

  $(document).ready(function(){
    if ("Unknown or expired link." == $('body').html()) {
      HN.setLocalStorage('expired', true);
      window.location.replace("/");
      return;
    }
    else {
      HN.getLocalStorage('expired', function(response) {
        if (response.data != undefined) {
          var expired = JSON.parse(response.data);
          if (expired) {
            $('#header').after("<p id=\"alert\">You reached an <a href=\"//news.ycombinator.com/item?id=17705\" title=\"what?\">expired page</a> and have been redirected back to the front page.</p>");
            HN.setLocalStorage('expired', false);
          }
        }
      });
    }

    //redirect to profile page after updating it
    if (window.location.pathname == "/x") {
      HN.getLocalStorage('update_profile', function(response) {
        if (response.data != undefined && response.data != "false") {
          HN.setLocalStorage('update_profile', false);
          window.location.replace(response.data);
        }
      });
    }

    HN.initSearch();
    HN.initSettings();
    HN.reveal();
  });
}
