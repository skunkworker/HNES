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
                  <a class="unvoter unvote" title="Unvote"></a>
                  <a class="collapser" title="Toggle collapse"></a>
                  <span class="score"></span>
                  <span class="author">
                    <a href="" title="User profile"></a>
                    <span class="hnes-user-score-cont noscore" title="User score">(<span class="hnes-user-score"></span>)</span>
                    <span class="hnes-tag-cont">
                      <img class="hnes-tag" title="Tag user">
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
        storyLinkEl = t.querySelector('.storyon a'),
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
        commentTextEl = commentEl.querySelector('.commtext'),
        commentColor = (commentTextEl && Array.from(commentTextEl.classList)
                          .find(cls => /^c[0-9a-f]{2}$/.test(cls))) || 'c00',
        isDead = t.querySelector('span.comhead').textContent.includes(' [dead] '),
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
      parentEl = commentEl.querySelector('.parent'),
      authorEl = commentEl.querySelector('.author a'),
      userscoreEl = commentEl.querySelector('.hnes-user-score'),
      tagImageEl = commentEl.querySelector('.hnes-tag'),
      tagTextEl = commentEl.querySelector('.hnes-tagText'),
      voteblockEl = commentEl.querySelector('.voteblock');

    c.el = commentEl;

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
    commentEl.querySelector('a.unvote').href = c.unVoteUrl;

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

    commentEl.querySelector('.collapser').addEventListener('click', e => {
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
        commentEl.querySelector('a.unvote').href = c.unVoteUrl;

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
    commentEl.querySelector('a.unvote').addEventListener('click', e => {
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

    const nodeMap = this.nodeListToTree(this.markupToNodeList(commentTree));

    this.prepare(nodeMap, nodeMap => {
      this.nodeMap = nodeMap;
      const commentsContainer = document.createElement('div');
      commentsContainer.id = 'hnes-comments';

      this.renderComments(this.nodeMap.root.children, commentsContainer);
      commentTree.parentNode.replaceChild(commentsContainer, commentTree);
      if (itemList) {
        commentsContainer.classList.add('nolevels')
      } else {
        // highlight new comments on threaded pages
        CommentTracker.init();
      }
      // load and show user tags and point totals
      HN.addInfoToUsers();
      var loading_comments = document.getElementById('loading_comments');
      if (loading_comments) {
        loading_comments.classList.add('hidden');
      }
    });
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

          let storyIdResults = /id=(\w+)/.exec(window.location.search);
          let storyId = storyIdResults ? storyIdResults[1] : false;
          HN.hnComments = new HNComments(storyId);
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

      var search_domain = "hn.algolia.com";
      HN.setSearchInput($('input[name="q"]'), search_domain);

      var icon = $('img[src="y18.gif"]');
      icon.parent().attr({"href": "http://news.ycombinator.com/"});
      icon.attr('title', 'Hacker News');
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
      /*
       * The header's third cell — the login link when logged out, the user menu
       * and karma when logged in — so the gear sits at the right edge rather
       * than in among the section tabs, which are navigation and not settings.
       * That cell is right-aligned by the stylesheet, so appending puts the gear
       * last. Falling back to the cell itself covers a page where HN ships no
       * .pagetop in it.
       */
      var cell = $('#header td:nth-child(3)').first(),
          slot = cell.find('.pagetop').first();
      if (!slot.length) slot = cell;
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

        // Any other open menu closes first; two floating surfaces at once reads
        // as a rendering bug rather than as two menus. Their triggers have to
        // lose .active with them — the older menus toggle that class blindly, so
        // leaving it set desyncs their next click from what is on screen.
        $('.nav-drop-down').not(panel).hide();
        $('.more-arrow > a.active').removeClass('active');

        if (!panel.length) host.append(panel = HN.buildSettingsPanel());
        open = true;
        HN.markSettings(panel);
        panel.css('display', 'block');
        link.addClass('active').attr('aria-expanded', 'true');

        // Click-away and Esc. The stopPropagation above is what makes binding
        // here safe as well as necessary: without it this very click would carry
        // on to the document and shut the panel again.
        $(document).on('click.hnesSettings', close)
                   .on('keydown.hnesSettings', function(e) {
                     if (e.key === 'Escape') close();
                   });
      });

      // A panel left open while another tab changes something: boot.js has
      // already restyled the page underneath it, so without this its marks say
      // one thing and the page says another.
      HNESModes.subscribe(function() {
        if (open) HN.markSettings(panel);
      });

      // The `h` binding's way in. Guarded rather than a bare trigger, because
      // clicking the gear while it is open closes it — which would make the key
      // a toggle that fights whatever put the panel on screen.
      HN.openSettings = function() { if (!open) link.trigger('click'); };

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
      var group = $(), heading = '';
      HNESModes.list.forEach(function(spec) {
        if (spec.label !== heading) {
          heading = spec.label;
          group = $('<div/>').addClass('hnes-settings-group')
                             .append($('<div/>').addClass('hnes-settings-label')
                                                .text(spec.label));
          panel.append(group);
        }
        group.append(HN.buildSettingsRows(spec, panel));
      });

      panel.append(HN.buildStorageGroup());
      return panel;
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
                                               .text('Threads already open keep their state until reloaded')));

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

      return group.append(note).append($('<div/>').addClass('hnes-settings-opts').append(row));
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

      var headerHtml = '<tr id="header"><td bgcolor="#ff6600"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:2px"><tbody><tr><td><a href="http://ycombinator.com"><img src="y18.gif" width="18" height="18" style="border:1px #ffffff solid;"></a></td><td><span class="pagetop" id="top-navigation"><span class="nav-links"><span><a href="/news" class="top" title="Top stories">top</a>|</span><span><a href="/newest" class="new" title="Newest stories">new</a>|</span><span><a href="/best" class="best" title="Best stories">best</a></span></div></span></span></td></tr></tbody></table></td></tr>';

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

      let itemIdResults = /id=(\w+)/.exec(window.location.search);
      var itemId = itemIdResults ? itemIdResults[1] : false;
      var below_header = $('#content table');

      $("<p id='loading_comments'>Loading comments</p>").insertBefore(below_header[1])

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
      $('#content > td').attr('id', 'user-profile');

      var options = $('tr > td[valign="top"]');
      var user = options[0];
      var created = $(options[1]);
      var karma = $(options[2]);
      var about = $(options[3]);

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

        var about_help = about.next().find('a[href="formatdoc"]');
        about_help.click(function(e) {
          e.preventDefault();
          var input_help = about.next().find('.input-help');
          if (input_help.length) {
            input_help.remove();
          }
          else {
            about.next().append(HN.getFormattingHelp(false));
          }
        });

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
    },

    getFormattingHelp: function(links_work) {
      var help = '<p>Blank lines separate paragraphs.</p>' +
             '<p>Text after a blank line that is indented by two or more spaces is reproduced verbatim (this is intended for code).</p>' +
             '<p>Text surrounded by asterisks is italicized, if the character after the first asterisk isn\'t whitespace.</p>';
      if (links_work)
        help += '<p>Urls become links.</p>';

      return $('<div class="input-help">').append($(help));
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
      var poll_max_width = 500;
      var totalscore = 0;
      var poll_scores = poll.find('.default');
      poll_scores.each(function() {
        var score = Number($(this).text().split(' ')[0]);
        totalscore += score;
      });
      poll_scores.each(function() {
        var score = Number($(this).text().split(' ')[0]);
        if (score > 0) {
          var width = Math.max(1, score / totalscore * poll_max_width);
          var graph_el = $('<tr/>').append($('<td/>'))
                                   .append($('<td/>').append($('<div/>').addClass('poll-graph')
                                                                        .width(width)));
          $(this).parent().after(graph_el)
        }
      });
    },

    loadMoreLink: function(elem) {
      if (elem.length == 0) {
        HN.doAfterCommentsLoad();
        return;
      }

      var loading_comments = document.getElementById('loading_comments')
      if (loading_comments) {
        loading_comments.textContent += '.';
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
      var loading_comments = document.getElementById("loading_comments");
      if (loading_comments) {
        loading_comments.textContent = "Rendering comments...";
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

        var score = $this.find('span:first');
        var as = $this.find('a');
        var by = $this.find('a:eq(0)');
        var at = $this.find('a:eq(1)');
        var comments;

        if (score.length == 0)
          score = $("<span/>").text('0');
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

        var score_el = $('<td/>').append(score);
        var comments_el = $('<td/>').append(comments);
        var $prev = $this.parent().prev();
        $prev.prepend(score_el);
        $prev.prepend(comments_el);
        $prev.find('.title').append(by_el);
        $this.parent().next().remove();
        $this.parent().remove();

        $('<span />').addClass('hnes-actions').append(
            $this.find('a[href^=flag]'),
            $this.find('a[href^=vouch]'),
            $this.find('a[href^="https://hn.algolia.com/?query="]'),
            $this.find('a[href^=hide]'),
            $this.find('a[href^="https://www.google.com/search?q="]')
        ).insertAfter(by_el);

        $('<span />').addClass('hnes-age').text(at.text()).insertAfter(by_el);
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

      var user_drop_toggle = function() {
        user_drop.find('a').toggleClass('active')
        hidden_div.toggle();
      }
      user_drop.click(user_drop_toggle);
      hidden_div.click(user_drop_toggle);
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

        var new_active = $();
        hidden_pages.forEach(function(section) {
          var new_link = $('<a/>').attr('href', section.href)
                                  .attr('title', section.hint)
                                  .text(section.label)
                                  .addClass(section.label);

          if (window.location.pathname == section.href)
            new_active = new_link.clone().addClass('nav-active-link')
                                         .addClass('new-active-link');

          hidden_div.append(new_link);
        });

        // Nothing left over means no menu to open: promoting every section is a
        // reachable choice now, and a "more" with an empty drawer under it is
        // the kind of dead affordance the panel exists to avoid.
        if (hidden_pages.length) topsel.append(more_link).append(hidden_div);

        if (new_active.length)
          topsel.append($('<span/>').text('|').append(new_active));

        navigation.empty().append(topsel);

        var toggle_more_link = function() {
          more_link.find('a').toggleClass('active');
          hidden_div.toggle();
        }
        more_link.click(toggle_more_link);
        hidden_div.click(toggle_more_link);

        if (hidden_pages.length) {
          hidden_div.offset({'left': more_link.position().left});
          hidden_div.hide();
        }
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

    setSearchInput: function(el, domain) {
      var text = "Search on " + domain;
      $("input[name='q']").val(text);
      el.focus(function(){
        if (el.val() == text) {
          el.val("");
        }
      });
      el.blur(function(){
        if (el.val() == "") {
          el.val(text);
        }
      });
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
          $('html, body').animate({
            scrollTop: next_lem.offset().top - 10
            }, 200);
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

    HN.initSettings();
    HN.reveal();
  });
}
