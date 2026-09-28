/* ============================================================
   栖旅 · 交互层
   画廊 / 城市详情 / 社区交流 / 收藏 / 发帖
   ============================================================ */
(function () {
  'use strict';

  const D = window.QiyuData;
  const S = window.Scenes;
  const STORE_KEY = 'qiyu.state.v1';

  /* ---------------- 状态 ---------------- */

  const store = {
    savedCities: [],
    savedPosts: [],
    likedPosts: [],
    userPosts: [],
    userReplies: {},
    compare: [],
    notes: {},
    prefs: null,      // 我的偏好权重（拖动详情页滑杆后才有）
    remoteUsers: {},  // 云端用户档案（id → {name,color,home}）
    remotePosts: [],  // 云端帖子（接了后端才有）
    motion: true,
    me: { name: '我', color: '#1f1c18' },
    account: null,
    load: function () {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return;
        const o = JSON.parse(raw);
        if (Array.isArray(o.savedCities)) store.savedCities = o.savedCities;
        if (Array.isArray(o.savedPosts)) store.savedPosts = o.savedPosts;
        if (Array.isArray(o.likedPosts)) store.likedPosts = o.likedPosts;
        if (Array.isArray(o.userPosts)) store.userPosts = o.userPosts;
        if (o.userReplies && typeof o.userReplies === 'object') store.userReplies = o.userReplies;
        if (Array.isArray(o.compare)) store.compare = o.compare.slice(0, 3);
        if (o.notes && typeof o.notes === 'object') store.notes = o.notes;
        if (o.prefs && typeof o.prefs === 'object') store.prefs = o.prefs;
        if (o.remoteUsers && typeof o.remoteUsers === 'object') store.remoteUsers = o.remoteUsers;
        if (Array.isArray(o.remotePosts)) store.remotePosts = o.remotePosts;
        if (typeof o.motion === 'boolean') store.motion = o.motion;
        if (o.me && o.me.name) store.me = o.me;
        if (o.account && o.account.phone) {
          store.account = o.account;
          store.me = { name: o.account.name || '我', color: o.account.color || '#c8452e' };
        }
      } catch (e) { /* 忽略损坏的本地数据 */ }
    },
    save: function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({
          savedCities: store.savedCities,
          savedPosts: store.savedPosts,
          likedPosts: store.likedPosts,
          userPosts: store.userPosts,
          userReplies: store.userReplies,
          compare: store.compare,
          notes: store.notes,
          prefs: store.prefs,
          remoteUsers: store.remoteUsers,
          remotePosts: store.remotePosts,
          motion: store.motion,
          me: store.me,
          account: store.account
        }));
      } catch (e) { /* 存储不可用时静默降级 */ }
    }
  };

  const state = {
    view: 'gallery',
    cat: 'all',
    province: 'all',
    cost: 'all',
    comfort: false,
    weather: false,
    transit: false,
    milk: false,
    spot: 'all',
    q: '',
    sort: 'index',
    topic: 'all',
    feedCity: 'all',
    feedSort: 'new'
  };

  let cardScenes = [];
  let cardVideos = [];
  let lazyScenes = [];
  let sceneObserver = null;
  let galleryCols = 0;
  let detailScene = null;
  let auraScene = null;
  let detailVideo = null;
  let miniVideo = null;
  let miniScene = null;
  let detailNavObserver = null;
  let detailCityId = null;
  let detailMonth = null;   // 详情页里选中的月份（看那一格的细节）

  /* ---------------- 实拍短片 ---------------- */

  const videoItems = [];
  let videoObserver = null;

  function syncVideo(item) {
    if (!item || !item.el) return;
    const el = item.el;
    const shouldPlay = item.visible && store.motion && !document.hidden;
    if (shouldPlay) {
      const p = el.play();
      if (p && p.catch) p.catch(function () { /* 自动播放被拦截时忽略 */ });
    } else {
      el.pause();
    }
  }

  function syncAllVideos() {
    videoItems.forEach(syncVideo);
  }

  function attachVideo(el, opts) {
    opts = opts || {};
    const item = { el: el, visible: false, rate: opts.rate || 1 };
    el.__videoItem = item;
    videoItems.push(item);
    // 卡片里的片子放的是「加速后的实拍」，再叠一个随机倍速，
    // 一排看过去每条节奏都不一样，不会像同一条被复制了几十遍。
    if (item.rate !== 1) {
      el.playbackRate = item.rate;
      el.defaultPlaybackRate = item.rate;
      el.addEventListener('loadedmetadata', function () { el.playbackRate = item.rate; });
    }
    if (!videoObserver && typeof IntersectionObserver !== 'undefined') {
      videoObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          const it = e.target.__videoItem;
          if (!it) return;
          it.visible = e.isIntersecting;
          syncVideo(it);
        });
      }, { rootMargin: '140px 0px' });
    }
    if (videoObserver) videoObserver.observe(el);
    else { item.visible = true; syncVideo(item); }
    return item;
  }

  function detachVideo(item) {
    if (!item) return;
    item.el.pause();
    const i = videoItems.indexOf(item);
    if (i >= 0) videoItems.splice(i, 1);
    if (videoObserver) videoObserver.unobserve(item.el);
  }

  function videoTag(v, forCard) {
    // focus 用来控制裁切构图：宽画幅视频放进卡片里时，可避开原片自带的字幕等元素
    const style = (forCard && v.focus) ? ' style="--video-focus:' + esc(v.focus) + '"' : '';
    return '<video class="city-video" src="' + esc(v.src) + '" poster="' + esc(v.poster) +
      '" muted loop playsinline preload="metadata" aria-hidden="true"' + style + '></video>';
  }

  /* ---------------- 小工具 ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function avatar(user, size) {
    const el = document.createElement('span');
    el.className = 'avatar' + (size ? ' avatar-' + size : '');
    el.style.background = user.color || '#666';
    el.textContent = (user.name || '旅').slice(0, 1);
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function user(id) {
    if (id === 'me') return { id: 'me', name: store.me.name, color: store.me.color, home: '正在旅居' };
    if (store.remoteUsers && store.remoteUsers[id]) return store.remoteUsers[id];
    return D.USERS[id] || { id: id, name: '旅人', color: '#666666', home: '' };
  }

  /* 编辑部的内容（官方手册）对所有人开放；用户投稿才是注册后才能看更多 */
  function isOfficialPost(p) {
    return !!(p && p.author && user(p.author).official);
  }

  // 未登录时该看到哪些帖子：官方全给，用户笔记只放前几条
  function guestVisible(list) {
    if (isMember()) return { shown: list, hidden: 0 };
    const cfg = acctCfg();
    const official = list.filter(isOfficialPost);
    const fromUsers = list.filter(function (p) { return !isOfficialPost(p); });
    const hidden = Math.max(0, fromUsers.length - cfg.guestPosts);
    const shown = official.concat(fromUsers.slice(0, cfg.guestPosts))
      .sort(function (a, b) { return b.ts - a.ts; });
    return { shown: shown, hidden: hidden };
  }

  /* ---------------- 账号：注册才能看更多 ---------------- */

  function acctCfg() {
    return (D.SETTINGS && D.SETTINGS.account) ||
      { signupFree: true, postFree: true, guestRows: 2, guestStats: 2, guestPosts: 3 };
  }

  function isMember() {
    return !!(store.account && store.account.phone);
  }

  /* 被锁住的整段内容：不渲染真数据，只给一块引导注册的牌子 */
  function lockBlock(title, sub, cta) {
    return '<div class="lock-block">' +
      '<span class="lock-icon" aria-hidden="true">🔒</span>' +
      '<p class="lock-title">' + esc(title) + '</p>' +
      (sub ? '<p class="lock-sub">' + esc(sub) + '</p>' : '') +
      '<button type="button" class="primary-btn" data-open-auth="1">' +
        esc(cta || '免费注册，看完整内容') + '</button>' +
      '</div>';
  }

  function renderAccount() {
    const slot = $('[data-account-slot]');
    if (!slot) return;
    if (isMember()) {
      slot.innerHTML =
        '<span class="account-me" title="已登录：' + esc(store.account.phone) + '">' +
          '<span class="avatar" style="background:' + esc(store.account.color || '#c8452e') + '">' +
            esc((store.account.name || '旅').slice(0, 1)) + '</span>' +
          '<span class="account-name">' + esc(store.account.name || '旅人') + '</span>' +
        '</span>' +
        '<button type="button" class="ghost-btn btn-slim" data-signout>退出</button>';
    } else {
      slot.innerHTML = '<button type="button" class="primary-btn btn-slim" data-open-auth="1">注册 / 登录</button>';
    }
  }

  function openAuth(reason) {
    const box = $('#auth');
    if (!box) return;
    $('[data-auth-reason]').textContent = reason ||
      '注册免费，发帖也免费。注册后可以看完整的旅居数据和全部社区笔记。';
    applyAuthMode();
    box.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(function () { const f = $('[data-auth-phone]'); if (f) f.focus(); }, 30);
  }

  /* 本地版是「手机号 + 验证码」，接了后端以后是「邮箱 + 密码 + 注册/登录切换」 */
  let authMode = 'signup';

  function applyAuthMode() {
    const remote = !!(window.QiyuSync && window.QiyuSync.on);
    const tabs = $('[data-auth-tabs]');
    if (tabs) tabs.hidden = !remote;
    $$('[data-auth-mode]').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-auth-mode') === authMode);
    });
    const emailEl = $('[data-auth-phone]');
    const passEl = $('[data-auth-code]');
    const nameField = $('[data-auth-name-field]');
    const submit = $('[data-auth-form] button[type="submit"]');
    if (!emailEl || !passEl) return;

    if (remote) {
      setText('[data-auth-title]', authMode === 'signup' ? '注册栖旅账号' : '登录栖旅');
      setText('[data-auth-label-email]', '邮箱');
      setText('[data-auth-label-code]', '密码');
      emailEl.type = 'email';
      emailEl.removeAttribute('inputmode');
      emailEl.setAttribute('maxlength', '80');
      emailEl.setAttribute('autocomplete', 'email');
      emailEl.setAttribute('placeholder', 'you@example.com');
      passEl.type = 'password';
      passEl.setAttribute('maxlength', '72');
      passEl.setAttribute('autocomplete', authMode === 'signup' ? 'new-password' : 'current-password');
      passEl.setAttribute('placeholder', '至少 6 位');
      if (nameField) nameField.hidden = authMode === 'signin';
      setText('[data-auth-note]', authMode === 'signup'
        ? '注册免费，发帖也免费。邮箱只用来登录和找回密码，不会发广告。'
        : '用注册时的邮箱和密码登录。');
      if (submit) submit.textContent = authMode === 'signup' ? '注册并进入' : '登录';
    } else {
      setText('[data-auth-title]', '注册 / 登录');
      setText('[data-auth-label-email]', '手机号');
      setText('[data-auth-label-code]', '验证码');
      emailEl.type = 'tel';
      emailEl.setAttribute('inputmode', 'numeric');
      emailEl.setAttribute('maxlength', '11');
      emailEl.setAttribute('autocomplete', 'tel');
      emailEl.setAttribute('placeholder', '11 位手机号');
      passEl.type = 'text';
      passEl.setAttribute('inputmode', 'numeric');
      passEl.setAttribute('maxlength', '6');
      passEl.setAttribute('autocomplete', 'one-time-code');
      passEl.setAttribute('placeholder', '6 位数字（原型阶段随便填）');
      if (nameField) nameField.hidden = false;
      setText('[data-auth-note]', '原型阶段不会真的发短信，验证码填 6 位数字就能进；账号目前只存在这台设备上。');
      if (submit) submit.textContent = '注册并进入';
    }
  }

  function closeAuth() {
    const box = $('#auth');
    if (!box) return;
    box.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  function submitAuth(ev) {
    ev.preventDefault();
    const phoneEl = $('[data-auth-phone]');
    const codeEl = $('[data-auth-code]');
    const nameEl = $('[data-auth-name]');
    const remote = !!(window.QiyuSync && window.QiyuSync.on);

    // 接了后端：邮箱 + 密码（注册时会自动建一条用户档案）
    if (remote) {
      const email = (phoneEl.value || '').trim();
      const pass = codeEl.value || '';
      const nick = (nameEl.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('邮箱填得不太对'); phoneEl.focus(); return; }
      if (pass.length < 6) { toast('密码至少 6 位'); codeEl.focus(); return; }
      const submitBtn = $('[data-auth-form] button[type="submit"]');
      const isSignup = authMode === 'signup';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = isSignup ? '注册中…' : '登录中…'; }
      const done = function () { if (submitBtn) submitBtn.disabled = false; applyAuthMode(); };
      (isSignup ? window.QiyuSync.signUp(email, pass, nick) : window.QiyuSync.signIn(email, pass))
        .then(function (data) {
          done();
          if (!data || !data.access_token) {
            toast('注册成功，去邮箱点一下确认链接，再回来登录');
            authMode = 'signin';
            applyAuthMode();
            return;
          }
          const meta = (data.user && data.user.user_metadata) || {};
          window.QiyuApp.setAccount({
            phone: email, email: email, color: '#c8452e',
            name: meta.name || nick || '旅人', ts: Date.now()
          });
          closeAuth();
          toast(isSignup ? '注册成功，欢迎来栖旅' : '登录成功');
          cloudPull();
        })
        .catch(function (err) {
          done();
          toast(err && err.message ? err.message : '没成功，再试一次');
        });
      return;
    }

    const phone = (phoneEl.value || '').replace(/\D/g, '');
    const code = (codeEl.value || '').replace(/\D/g, '');
    let name = (nameEl.value || '').trim();
    if (phone.length !== 11) { toast('手机号填 11 位数字'); phoneEl.focus(); return; }
    if (code.length !== 6) { toast('验证码填 6 位数字（原型阶段随便填）'); codeEl.focus(); return; }
    if (!name) name = '旅人' + phone.slice(-4);
    store.account = { phone: phone, name: name, color: '#c8452e', ts: Date.now() };
    store.me = { name: name, color: '#c8452e' };
    store.save();
    closeAuth();
    renderAccount();
    refreshAfterAccount();
    toast('欢迎，' + name + '。注册免费，发帖也免费。');
  }

  function signOut() {
    const who = store.account ? store.account.name : '';
    store.account = null;
    store.me = { name: '我', color: '#1f1c18' };
    if (window.QiyuSync && window.QiyuSync.on) {
      window.QiyuSync.signOut();
      store.remotePosts = [];
      store.likedPosts = [];
      cloudPull();   // 退回游客视角，重新拉那 3 条
    }
    store.save();
    renderAccount();
    refreshAfterAccount();
    toast(who ? '已退出 ' + who + ' 的账号' : '已退出登录');
  }

  /* 登录/退出后，把当前看得到的视图按新权限重画一遍 */
  function refreshAfterAccount() {
    renderGallery();
    if (state.view === 'feed') renderFeed();
    if (state.view === 'saved') renderSaved();
    if (detailCityId) openDetail(detailCityId);
    updateBadges();
  }

  /* ---------------- 云端数据落进本地 store ---------------- */

  /* sync.js 拉完数据后调用这里：把服务器上的帖子、作者、点赞、收藏、笔记并进本地 store，
     界面照旧用同一套渲染逻辑，不用改。 */
  function ingestRemote(payload) {
    if (!payload) return 0;
    // 同一批数据可能来自两个接口（官方内容 + 游客可见内容），按 id 去重，避免同一条出现两次
    const seen = {};
    const rows = (payload.posts || []).filter(function (row) {
      if (!row || !row.id || seen[row.id]) return false;
      seen[row.id] = true;
      return true;
    });
    const users = {};
    rows.forEach(function (row) {
      if (!row.author) return;
      users[row.author] = {
        id: row.author,
        name: row.author_name || '旅人',
        color: row.author_color || '#666666',
        home: row.author_home || '',
        official: !!row.author_official
      };
    });
    (payload.replies || []).forEach(function (r) {
      if (!r.author) return;
      const pr = r.profiles || {};
      users[r.author] = {
        id: r.author,
        name: pr.name || '旅人',
        color: pr.color || '#666666',
        home: pr.home || '',
        official: !!pr.official
      };
    });
    store.remoteUsers = Object.assign({}, store.remoteUsers, users);

    const repliesByPost = {};
    (payload.replies || []).forEach(function (r) {
      const list = repliesByPost[r.post] || (repliesByPost[r.post] = []);
      list.push({ author: r.author, text: r.body, ts: Date.parse(r.created_at) || Date.now() });
    });

    const liked = (payload.liked || []).map(function (id) { return 'r' + id; });

    store.remotePosts = rows.map(function (row) {
      const id = 'r' + row.id;
      const isLiked = liked.indexOf(id) >= 0;
      const serverLikes = Number(row.likes || 0);
      return {
        id: id,
        remoteId: row.id,
        city: row.city || '',
        topic: row.topic || 'daily',
        author: row.author,
        ts: Date.parse(row.created_at) || Date.now(),
        text: row.body,
        // 服务端的总数里已经含了我这一票，先减掉，界面会用 likedPosts 再加回来
        likes: Math.max(0, serverLikes - (isLiked ? 1 : 0)),
        replies: repliesByPost[row.id] || [],
        mine: !!(payload.me && row.author === payload.me)
      };
    });

    store.likedPosts = liked;
    if (payload.saved) store.savedCities = payload.saved.slice();
    (payload.notes || []).forEach(function (n) { store.notes[n.city] = n.body; });
    if (payload.prefs) store.prefs = payload.prefs;
    store.save();

    renderGallery();
    if (state.view === 'feed') renderFeed();
    if (state.view === 'saved') renderSaved();
    if (detailCityId) openDetail(detailCityId);
    updateBadges();
    syncCompareButtons();
    return store.remotePosts.length;
  }

  /* 拉一次云端（发帖/回复/点赞之后调用） */
  function cloudPull() {
    if (!window.QiyuSync || !window.QiyuSync.on) return;
    window.QiyuSync.pull().catch(function () { /* 断网就先用本地的 */ });
  }

  function fmtTime(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    const h = Math.floor(min / 60);
    if (h < 24) return h + ' 小时前';
    const d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    return Math.floor(d / 30) + ' 个月前';
  }

  function toast(msg) {
    const el = $('[data-toast]');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove('is-on');
      setTimeout(function () { el.hidden = true; }, 260);
    }, 2000);
  }

  function monthLabel(m) { return (m + 1) + '月'; }

  function bestMonthText(city) {
    const b = city.stats.best.slice().sort(function (a, c) { return a - c; });
    if (!b.length) return '—';
    const groups = [];
    let start = b[0], prev = b[0];
    for (let i = 1; i < b.length; i++) {
      if (b[i] === prev + 1) { prev = b[i]; continue; }
      groups.push([start, prev]); start = prev = b[i];
    }
    groups.push([start, prev]);
    // 跨年窗口（如 11 月–次年 4 月）合并成一段，避免出现“1月–4月、11月–12月”
    if (groups.length > 1 && groups[0][0] === 0 && groups[groups.length - 1][1] === 11) {
      const first = groups.shift();
      const last = groups.pop();
      groups.unshift([last[0], first[1]]);
    }
    return groups.map(function (g) {
      return g[0] === g[1] ? monthLabel(g[0]) : monthLabel(g[0]) + '–' + monthLabel(g[1]);
    }).join('、');
  }

  function money(n) { return '¥' + n.toLocaleString('zh-CN'); }

  /* ---------------- 帖子数据 ---------------- */

  function allPosts() {
    const seed = D.POSTS.map(function (p) {
      return {
        id: p.id, city: p.city, topic: p.topic, author: p.author,
        ts: Date.now() - p.hoursAgo * 3600 * 1000,
        text: p.text, likes: p.likes,
        replies: (p.replies || []).map(function (r) {
          return { author: r.author, text: r.text, ts: Date.now() - r.hoursAgo * 3600 * 1000 };
        })
      };
    });
    const mine = store.userPosts.map(function (p) {
      return {
        id: p.id, city: p.city, topic: p.topic, author: 'me', ts: p.ts,
        text: p.text, likes: 0, replies: [], mine: true
      };
    });
    // 接了云端以后，帖子里还有一份来自服务器的（作者是 uuid）
    return mine.concat(store.remotePosts || []).concat(seed);
  }

  function repliesOf(post) {
    const extra = store.userReplies[post.id] || [];
    return post.replies.concat(extra.map(function (r) {
      return { author: 'me', text: r.text, ts: r.ts };
    }));
  }

  function likeCount(post) {
    return post.likes + (store.likedPosts.indexOf(post.id) >= 0 ? 1 : 0);
  }

  function cityPostCount(cityId) {
    return allPosts().filter(function (p) { return p.city === cityId; }).length;
  }

  /* ---------------- 画廊 ---------------- */

  /* ---------------- 筛选：一处定义，画廊与命中数共用 ---------------- */

  function factValue(city, key) {
    const f = (city.facts || []).filter(function (x) { return x[0] === key; })[0];
    return f ? f[1] : '';
  }

  function hasTransit(city) {
    return /高铁|机场|铁路/.test(factValue(city, '交通'));
  }

  function milkTeaOf(city) {
    return city.milkTea || { tier: 1, label: '一般', brands: '' };
  }

  function hasMilkTea(city) {
    return milkTeaOf(city).tier >= 2;
  }

  function spotType(id) {
    return D.SPOT_TYPES.filter(function (t) { return t.id === id; })[0] || null;
  }

  function cityHay(city) {
    return [city.name, city.region, city.tagline, city.intro, city.attractions]
      .concat(city.tags).join(' ').toLowerCase();
  }

  function hasSpot(city) {
    const t = spotType(state.spot);
    if (!t || !t.re) return true;
    return t.re.test(cityHay(city));
  }

  function bestComfort(city) {
    return Math.max.apply(null, city.months.comfort);
  }

  function currentComfort(city) {
    return city.months.comfort[new Date().getMonth()];
  }

  function currentTemp(city) {
    return city.months.temp[new Date().getMonth()];
  }

  /* skip：算某一项的命中数时，把它自己排除掉（典型的分面筛选算法） */
  function matches(city, skip) {
    if (skip !== 'cat' && state.cat !== 'all' && city.cat !== state.cat) return false;
    if (skip !== 'province' && state.province !== 'all' && provinceOf(city) !== state.province) return false;
    if (skip !== 'cost' && state.cost !== 'all') {
      const c = city.stats.cost;
      if (state.cost === 'low' && c > 3000) return false;
      if (state.cost === 'mid' && (c < 3000 || c > 5000)) return false;
      if (state.cost === 'high' && c < 5000) return false;
    }
    if (skip !== 'comfort' && state.comfort && bestComfort(city) < 88) return false;
    if (skip !== 'weather' && state.weather) {
      const t = currentTemp(city);
      if (t < 15 || t > 28) return false;
    }
    if (skip !== 'transit' && state.transit && !hasTransit(city)) return false;
    if (skip !== 'milk' && state.milk && !hasMilkTea(city)) return false;
    if (skip !== 'spot' && state.spot !== 'all' && !hasSpot(city)) return false;
    const q = state.q.trim().toLowerCase();
    if (!q) return true;
    return cityHay(city).indexOf(q) >= 0;
  }

  /* 临时改变某一项，数出命中数，再改回来 */
  function countWith(key, val) {
    const saved = state[key];
    state[key] = val;
    const n = D.CITIES.filter(function (c) { return matches(c); }).length;
    state[key] = saved;
    return n;
  }

  function visibleCities() {
    const list = D.CITIES.filter(function (c) { return matches(c); });
    const sorters = {
      index: function (a, b) { return b.stats.index - a.stats.index; },
      cost: function (a, b) { return a.stats.cost - b.stats.cost; },
      net: function (a, b) { return b.stats.net - a.stats.net; },
      hot: function (a, b) { return (b.likes + b.comments * 2) - (a.likes + a.comments * 2); },
      // 按「我的偏好」重算：拖动城市页里的四个滑杆，画廊就按这个顺序排
      mine: function (a, b) { return prefIndex(b) - prefIndex(a); }
    };
    return list.sort(sorters[state.sort] || sorters.index);
  }

  function provinceOf(city) {
    return (city.region || '').split(' · ')[0];
  }

  function renderProvinceOptions() {
    const sel = $('[data-province]');
    if (!sel) return;
    const counts = {};
    D.CITIES.forEach(function (c) {
      const p = provinceOf(c);
      counts[p] = (counts[p] || 0) + 1;
    });
    const list = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b, 'zh-Hans-CN');
    });
    sel.innerHTML = '<option value="all">全部 ' + D.CITIES.length + ' 座</option>' +
      list.map(function (p) {
        return '<option value="' + esc(p) + '">' + esc(p) + '（' + counts[p] + '）</option>';
      }).join('');
  }

  function provinceList() {
    const counts = {};
    D.CITIES.forEach(function (c) {
      const p = provinceOf(c);
      counts[p] = (counts[p] || 0) + 1;
    });
    return Object.keys(counts);
  }

  function renderCatChips() {
    const box = $('[data-cat-chips]');
    box.innerHTML = D.CATEGORIES.map(function (c) {
      const n = c.id === 'all' ? D.CITIES.length : D.CITIES.filter(function (x) { return x.cat === c.id; }).length;
      return '<button type="button" role="tab" class="chip' + (state.cat === c.id ? ' is-on' : '') +
        '" aria-selected="' + (state.cat === c.id) + '" data-cat="' + c.id + '">' +
        esc(c.name) + '<i>' + n + '</i></button>';
    }).join('');
  }

  /* ---------------- 首屏六项筛选 ----------------
     六项 = 悬停浮现的六条数据，一一对应。
     每个按钮上的数字是"勾选后会命中几座"（分面筛选：算自己时把自己排除掉），
     所以数字会随其他条件一起收敛。 */

  const COST_STEPS = [
    { val: 'all', name: '月成本不限' },
    { val: 'low', name: '≤ ¥3,000' },
    { val: 'mid', name: '¥3,000–5,000' },
    { val: 'high', name: '≥ ¥5,000' }
  ];

  function qfBtn(kind, val, name, count, on, disabled, hint) {
    return '<button type="button" class="qf' + (on ? ' is-on' : '') + '"' +
      ' data-qf="' + esc(kind) + '" data-qf-val="' + esc(val) + '"' +
      ' aria-pressed="' + !!on + '"' + (disabled ? ' disabled' : '') +
      (hint ? ' title="' + esc(hint) + '"' : '') + '>' +
      esc(name) + '<i>' + count + '</i></button>';
  }

  function renderQuickFilters() {
    const box = $('[data-quick-filters]');
    if (!box) return;
    const focused = document.activeElement;
    const keep = focused && box.contains(focused)
      ? focused.getAttribute('data-qf') + '|' + focused.getAttribute('data-qf-val')
      : '';

    const parts = [];
    parts.push('<span class="qf-label">六项快筛</span>');

    // 1. 月成本
    parts.push('<span class="qf-group" role="group" aria-label="月成本">');
    COST_STEPS.forEach(function (s) {
      const n = countWith('cost', s.val);
      parts.push(qfBtn('cost', s.val, s.name, n, state.cost === s.val, n === 0 && state.cost !== s.val));
    });
    parts.push('</span>');

    parts.push('<span class="qf-sep"></span>');

    // 2. 舒适度 / 3. 天气 / 4. 交通 / 5. 奶茶
    [['comfort', '全年舒服', '全年至少有几个月舒适度 88 以上'],
     ['weather', '现在就好', '本月平均气温在 15–28℃ 之间'],
     ['transit', '能坐高铁', '有高铁站或机场'],
     ['milk', '奶茶店多', '奶茶门店密度为中档以上（初稿，待 POI 校准）']].forEach(function (x) {
      const key = x[0];
      const n = countWith(key, true);
      parts.push(qfBtn(key, '1', x[1], n, state[key], n === 0 && !state[key], x[2]));
    });

    parts.push('<span class="qf-sep"></span>');

    // 6. 旅游景点
    parts.push('<select class="qf qf-select" data-qf-spot aria-label="按景点类型筛选">' +
      D.SPOT_TYPES.map(function (t) {
        const n = countWith('spot', t.id);
        return '<option value="' + esc(t.id) + '"' + (state.spot === t.id ? ' selected' : '') + '>' +
          esc(t.name) + '（' + n + '）</option>';
      }).join('') +
      '</select>');

    const anyOn = state.cost !== 'all' || state.comfort || state.weather ||
      state.transit || state.milk || state.spot !== 'all';
    if (anyOn) {
      parts.push('<button type="button" class="qf qf-reset" data-qf-reset>清空筛选</button>');
    }

    box.innerHTML = parts.join('');

    // 每次重绘都重新生成按钮，键盘焦点要放回原来那一个
    if (keep) {
      const btn = box.querySelector('[data-qf="' + keep.split('|')[0] + '"][data-qf-val="' +
        keep.split('|')[1].replace(/"/g, '') + '"]');
      if (btn && !btn.disabled) btn.focus();
    }
  }

  function resetQuickFilters() {
    state.cost = 'all';
    state.comfort = false;
    state.weather = false;
    state.transit = false;
    state.milk = false;
    state.spot = 'all';
  }

  /* 空结果时不说"没有"，而是告诉用户"去掉哪一条就有了" */
  function emptyHint() {
    const active = [];
    if (state.cost !== 'all') active.push(['cost', '月成本', 'all']);
    if (state.comfort) active.push(['comfort', '全年舒服', false]);
    if (state.weather) active.push(['weather', '现在就好', false]);
    if (state.transit) active.push(['transit', '能坐高铁', false]);
    if (state.milk) active.push(['milk', '奶茶店多', false]);
    if (state.spot !== 'all') active.push(['spot', '景点类型', 'all']);
    for (let i = 0; i < active.length; i++) {
      const saved = state[active[i][0]];
      state[active[i][0]] = active[i][2];
      const n = D.CITIES.filter(function (c) { return matches(c); }).length;
      state[active[i][0]] = saved;
      if (n > 0) return '没有同时满足全部条件的城市；去掉「' + active[i][1] + '」后还有 ' + n + ' 座。';
    }
    return '';
  }

  /* ---------------- 内容卡片（每排最左边那一幅） ---------------- */

  /* 城市多了以后，画布不必一次全建：先铺一层调色板底色，
     等卡片接近视口再创建真正的画面（69 个画布同时存在会吃掉大量显存）。 */
  function palettePair(city) {
    const pal = city.scene ? S.PALETTES[city.scene.palette] : null;
    const a = pal ? pal.sky[Math.min(2, pal.sky.length - 1)][1] : '#cfc7b8';
    const b = pal ? pal.water[0] : '#8f8878';
    return [a, b];
  }

  function mountScene(entry) {
    if (entry.item || !entry.canvas.isConnected) return;
    entry.item = S.create(entry.canvas, entry.city.scene, {
      key: 'card-' + entry.city.id,
      speed: 0.9
    });
    entry.item.__city = entry.city.id;
    cardScenes.push(entry.item);
  }

  function attachSceneLazy(canvas, city) {
    const pair = palettePair(city);
    canvas.style.background = 'linear-gradient(168deg,' + esc(pair[0]) + ',' + esc(pair[1]) + ')';
    const entry = { canvas: canvas, city: city, item: null };
    if (!sceneObserver && typeof IntersectionObserver !== 'undefined') {
      sceneObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          const it = e.target.__lazyScene;
          if (!it || !e.isIntersecting) return;
          sceneObserver.unobserve(e.target);
          mountScene(it);
        });
      }, { rootMargin: '700px 0px' });
    }
    canvas.__lazyScene = entry;
    lazyScenes.push(entry);
    if (sceneObserver) sceneObserver.observe(canvas);
    else mountScene(entry);
    return entry;
  }

  function clearLazyScenes() {
    lazyScenes.forEach(function (it) {
      if (sceneObserver) sceneObserver.unobserve(it.canvas);
    });
    lazyScenes = [];
  }

  /* 视频也按需挂载：先用封面图占位，滚到附近才创建 <video>。
     69 个 video 元素同时请求媒体数据会互相挤掉（远端卡片被取消后触发 error，
     反而会误触发绘制兜底），这样一次最多只加载十来条。 */
  let videoMountObserver = null;
  let videoMountEntries = [];

  function attachVideoLazy(cardEl, city) {
    const media = $('.card-media', cardEl);
    const img = $('.card-poster', media);
    if (img && city.video.focus) img.style.objectPosition = city.video.focus;

    const entry = { card: cardEl, city: city, mounted: false };
    if (!videoMountObserver && typeof IntersectionObserver !== 'undefined') {
      videoMountObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          const it = e.target.__videoMount;
          if (!it || !e.isIntersecting || it.mounted) return;
          videoMountObserver.unobserve(e.target);
          mountCardVideo(it);
        });
      }, { rootMargin: '220px 0px' });
    }
    cardEl.__videoMount = entry;
    videoMountEntries.push(entry);
    if (videoMountObserver) videoMountObserver.observe(cardEl);
    else mountCardVideo(entry);
    return entry;
  }

  function mountCardVideo(entry) {
    if (entry.mounted || !entry.card.isConnected) return;
    entry.mounted = true;
    const el = entry.card;
    const city = entry.city;
    const media = $('.card-media', el);
    const video = document.createElement('video');
    video.className = 'city-video';
    video.src = city.video.src;
    video.poster = city.video.poster;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    if (city.video.focus) video.style.setProperty('--video-focus', city.video.focus);
    const poster = $('.card-poster', media);
    if (poster) media.replaceChild(video, poster);
    else media.insertBefore(video, media.firstChild);

    const item = attachVideo(video, { rate: randomRate() });
    cardVideos.push(item);
    // 实拍素材真的出问题（文件缺失、编码不支持）时，换回程序化画面
    let attempts = 0;
    video.addEventListener('error', function () {
      if (el.__drawFallback || !el.__allowDraw) return;
      // 不管什么错误都先重试两次（并发加载偶发失败很常见），
      // 连续失败才判定这条实拍确实不可用，换回程序化画面。
      if (attempts < 2) {
        attempts++;
        setTimeout(function () {
          try { video.load(); syncVideo(item); } catch (e) { /* 忽略 */ }
        }, 1500 * attempts);
        return;
      }
      el.__drawFallback = true;
      detachVideo(item);
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      media.replaceChild(canvas, video);
      el.classList.remove('has-video');
      const pill = $('.card-top .pill', el);
      if (pill) {
        pill.className = 'pill pill-live';
        pill.innerHTML = '<i></i>实时绘制';
      }
      attachSceneLazy(canvas, city);
    });
  }

  function clearVideoMounts() {
    videoMountEntries.forEach(function (it) {
      if (videoMountObserver) videoMountObserver.unobserve(it.card);
    });
    videoMountEntries = [];
  }

  function ccShell(eyebrow, title) {
    const el = document.createElement('article');
    el.className = 'content-card';
    el.innerHTML = '<p class="cc-eyebrow">' + esc(eyebrow) + '</p>' +
      (title ? '<h3 class="cc-title">' + esc(title) + '</h3>' : '');
    return el;
  }

  function ccEntry(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    return wrap;
  }

  /* 1. 数据：网速最快的三座城市 */
  function contentRankCard() {
    const el = ccShell('数据 · 实测网速', '网速最快的三座城市');
    const list = D.CITIES.slice().sort(function (a, b) {
      return b.stats.net - a.stats.net;
    }).slice(0, 3);
    const max = list[0].stats.net;
    const rows = document.createElement('div');
    rows.className = 'cc-rows';
    list.forEach(function (c, i) {
      rows.appendChild(ccEntry(
        '<button type="button" class="cc-row" data-goto="' + c.id + '">' +
          '<b>' + (i + 1) + '</b><span>' + esc(c.name) + '</span><i>' + c.stats.net + ' Mbps</i>' +
        '</button>' +
        '<div class="cc-bar"><em style="width:' + Math.round((c.stats.net / max) * 100) + '%"></em></div>'
      ));
    });
    el.appendChild(rows);
    const foot = document.createElement('div');
    foot.className = 'cc-foot';
    foot.innerHTML = '<span>中位值 · 远程办公优先 <span class="cc-link">点城市看详情</span></span>';
    el.appendChild(foot);
    return el;
  }

  /* 2. 实拍短片（会动的封面） */
  function contentVideoCard() {
    const city = D.cityById('dali');
    const v = city.video;
    const el = document.createElement('article');
    el.className = 'content-card cc-video';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('data-goto', city.id);
    el.setAttribute('aria-label', '看大理的实拍短片');
    el.innerHTML =
      '<div class="cc-scrim"></div>' +
      '<div class="cc-inner">' +
        '<span class="cc-play" aria-hidden="true">▶</span>' +
        '<p class="cc-eyebrow">实拍 · 大理</p>' +
        '<h3 class="cc-title">洱海的日出，<br>4.4 秒循环</h3>' +
        '<div class="cc-foot"><span class="cc-link">看实拍短片 →</span></div>' +
      '</div>';
    const video = document.createElement('video');
    video.className = 'bg-img';
    video.src = v.src;
    video.poster = v.poster;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    el.insertBefore(video, el.firstChild);
    cardVideos.push(attachVideo(video));
    return el;
  }

  /* 3. 社区：一句真实的旅居笔记 */
  function contentQuoteCard() {
    const posts = allPosts().filter(function (p) { return !!p.city; })
      .sort(function (a, b) { return likeCount(b) - likeCount(a); });
    const post = posts[0] || null;
    const city = post ? D.cityById(post.city) : null;
    const au = user(post ? post.author : 'youyou');
    const el = ccShell('社区 · ' + (city ? city.name : '旅居笔记'), '住在这里的人怎么说');
    if (post) {
      el.setAttribute('data-goto', post.city);
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.style.cursor = 'pointer';
    }
    const quote = document.createElement('p');
    quote.className = 'cc-text';
    quote.textContent = post ? '「' + post.text + '」' : '还没有笔记，你可以发第一条。';
    el.appendChild(quote);
    const foot = document.createElement('div');
    foot.className = 'cc-foot';
    const av = document.createElement('span');
    av.className = 'cc-avatar';
    av.style.background = au.color;
    av.textContent = au.name.slice(0, 1);
    foot.appendChild(av);
    const meta = document.createElement('span');
    meta.textContent = au.name + (post ? ' · ♥ ' + likeCount(post) : '');
    foot.appendChild(meta);
    const more = document.createElement('span');
    more.className = 'cc-link';
    more.style.marginLeft = 'auto';
    more.textContent = '看更多 →';
    foot.appendChild(more);
    el.appendChild(foot);
    return el;
  }

  /* 4. 引导发帖 */
  function contentPostCard() {
    const el = ccShell('发布 · 两分钟', '你住过的那座城市，值得被写下来');
    const text = document.createElement('p');
    text.className = 'cc-text';
    text.textContent = '房租多少、网速稳不稳、几月最舒服、哪些坑别踩——真实的一手经验比任何榜单都有用。';
    el.appendChild(text);
    const foot = document.createElement('div');
    foot.className = 'cc-foot';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'primary-btn cc-btn';
    btn.setAttribute('data-open-composer', '');
    btn.textContent = '+ 发布旅居笔记';
    foot.appendChild(btn);
    el.appendChild(foot);
    return el;
  }

  /* 5. 话题分布 */
  function contentTopicCard() {
    const el = ccShell('话题 · 本周', '大家都在聊什么');
    const all = allPosts();
    const counts = D.TOPICS.filter(function (t) { return t.id !== 'all'; }).map(function (t) {
      return { t: t, n: all.filter(function (p) { return p.topic === t.id; }).length };
    }).sort(function (a, b) { return b.n - a.n; });
    const max = Math.max(1, counts[0] ? counts[0].n : 1);
    const rows = document.createElement('div');
    rows.className = 'cc-rows';
    counts.slice(0, 4).forEach(function (x) {
      rows.appendChild(ccEntry(
        '<button type="button" class="cc-row" data-topic-jump="' + x.t.id + '">' +
          '<span>#' + esc(x.t.name) + '</span><i>' + x.n + ' 条</i>' +
        '</button>' +
        '<div class="cc-bar"><em style="width:' + Math.round((x.n / max) * 100) + '%"></em></div>'
      ));
    });
    el.appendChild(rows);
    return el;
  }

  /* 6. 社区：本周新发布的笔记 */
  function contentNewNotesCard() {
    const el = ccShell('社区 · 本周新发布', '刚有人在这些城市落脚');
    const list = allPosts().slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 3);
    const rows = document.createElement('div');
    rows.className = 'cc-rows';
    list.forEach(function (p) {
      const city = p.city ? D.cityById(p.city) : null;
      const au = user(p.author);
      rows.appendChild(ccEntry(
        '<button type="button" class="cc-row"' + (city ? ' data-goto="' + city.id + '"' : '') + '>' +
          '<b class="cc-initial" style="background:' + esc(au.color) + '">' + esc(au.name.slice(0, 1)) + '</b>' +
          '<span>' + esc(city ? city.name : '旅居随笔') + '</span>' +
          '<i>' + fmtTime(p.ts) + '</i>' +
        '</button>'
      ));
    });
    el.appendChild(rows);
    const foot = document.createElement('div');
    foot.className = 'cc-foot';
    foot.innerHTML = '<span>' + allPosts().length + ' 条笔记 · ' +
      '<button type="button" class="cc-link cc-linkbtn" data-view="feed">去交流 →</button></span>';
    el.appendChild(foot);
    return el;
  }

  /* 7. 合作位（广告） */
  function contentSponsorCard() {
    const s = D.SPONSOR;
    const el = document.createElement('article');
    el.className = 'content-card cc-sponsor';
    el.innerHTML =
      '<img class="bg-img" src="' + esc(s.image) + '" alt="" loading="lazy" decoding="async">' +
      '<div class="cc-scrim"></div>' +
      '<div class="cc-inner">' +
        '<p class="cc-eyebrow">' + esc(s.eyebrow) + '</p>' +
        '<h3 class="cc-title">' + esc(s.title) + '</h3>' +
        '<p class="cc-text">' + esc(s.text) + '</p>' +
        '<div class="cc-foot">' +
          '<span class="cc-advertiser">' + esc(s.advertiser) + '</span>' +
          '<button type="button" class="cc-cta" data-sponsor>' + esc(s.cta) + '</button>' +
        '</div>' +
      '</div>';
    return el;
  }

  const CARD_NEW_NOTES = { build: contentNewNotesCard };
  const CARD_VIDEO = { build: contentVideoCard };
  const CARD_SPONSOR = { build: contentSponsorCard };

  // 编辑类卡片，按天轮换，避免每天都一样
  const EDITORIAL_CARDS = [
    { build: contentQuoteCard },
    { build: contentRankCard },
    { build: contentTopicCard },
    { build: contentPostCard }
  ];

  const CONTENT_CARDS = [CARD_NEW_NOTES].concat(EDITORIAL_CARDS);

  function dayIndex() {
    return Math.floor(Date.now() / 86400000);
  }

  /* 每排最左边那幅的排布：
     第 1 格固定「本周新发布」（社区新鲜度），第 2 格固定「实拍短片」（视觉），
     中间按天轮换一张编辑卡，最后一格放合作位；窄屏逐级收敛，避免整屏都是卡片。 */
  function contentPlan(slots) {
    const out = [];
    if (slots <= 0) return out;
    out.push(CARD_NEW_NOTES);
    if (slots >= 2) out.push(CARD_VIDEO);
    const sponsorSlots = slots >= 3 ? 1 : 0;
    const rotating = Math.max(0, slots - 2 - sponsorSlots);
    const start = dayIndex() % EDITORIAL_CARDS.length;
    for (let i = 0; i < rotating; i++) {
      out.push(EDITORIAL_CARDS[(start + i) % EDITORIAL_CARDS.length]);
    }
    if (sponsorSlots) out.push(CARD_SPONSOR);
    return out;
  }

  /* ---------------- 照片与画廊之间的滚动卡片带 ---------------- */

  function truncate(s, n) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  /* 随机倍速：0.75–1.65 之间，两位小数。
     片子本身已经是 4 倍速的延时素材，这里再叠一层随机，
     让一排卡片各有各的节奏。 */
  function randomRate() {
    return Math.round((0.75 + Math.random() * 0.9) * 100) / 100;
  }

  function mqCard(cls, inner, attrs) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mq-card' + (cls ? ' ' + cls : '');
    el.innerHTML = inner;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    }
    return el;
  }

  /* 用城市画面的调色板做一个小小的色块，和画廊里的画面呼应 */
  function cityChip(city) {
    const pal = city.scene ? S.PALETTES[city.scene.palette] : null;
    const a = pal ? pal.sky[Math.min(2, pal.sky.length - 1)][1] : '#8a8a8a';
    const b = pal ? pal.water[0] : '#5a5a5a';
    return '<span class="mq-chip" style="background:linear-gradient(140deg,' + esc(a) + ',' + esc(b) + ')">' +
      esc(city.name.slice(0, 1)) + '</span>';
  }

  /* 滚动卡片带的内容刻意做得杂：城市、笔记、话题、数据、实拍、引导都有 */
  function marqueeItems() {
    const out = [];
    const all = allPosts();
    const byNew = all.slice().sort(function (a, b) { return b.ts - a.ts; });
    const byHot = all.slice().sort(function (a, b) { return likeCount(b) - likeCount(a); });
    const month = new Date().getMonth();

    out.push(mqCard('is-stat',
      '<span class="mq-chip is-plain">栖</span>' +
      '<span class="mq-body"><b>' + D.CITIES.length + ' 座城市 · ' + all.length + ' 条旅居笔记</b>' +
      '<span>点这里回到画廊</span></span>',
      { 'data-scroll-gallery': '' }));

    const best = D.CITIES.slice().sort(function (a, b) {
      return b.months.comfort[month] - a.months.comfort[month];
    }).slice(0, 3);
    out.push(mqCard('',
      cityChip(best[0]) +
      '<span class="mq-body"><b>' + (month + 1) + ' 月最舒服 · ' + esc(best[0].name) + '</b>' +
      '<span>其次是 ' + esc(best[1].name) + '、' + esc(best[2].name) + '</span></span>',
      { 'data-goto': best[0].id }));

    D.CITIES.slice().sort(function (a, b) { return b.stats.index - a.stats.index; })
      .slice(0, 8).forEach(function (c) {
        out.push(mqCard('',
          cityChip(c) +
          '<span class="mq-body"><b>' + esc(c.name) + ' · 指数 ' + c.stats.index + '</b>' +
          '<span>' + esc(c.region) + ' · 月均 ' + money(c.stats.cost) + '</span></span>',
          { 'data-goto': c.id }));
      });

    byNew.slice(0, 3).forEach(function (p) {
      const city = p.city ? D.cityById(p.city) : null;
      const au = user(p.author);
      out.push(mqCard('',
        '<span class="mq-chip is-round" style="background:' + esc(au.color) + '">' +
          esc(au.name.slice(0, 1)) + '</span>' +
        '<span class="mq-body"><b>' + esc(city ? city.name : '旅居随笔') + ' · ' + esc(au.name) + '</b>' +
        '<span>' + esc(truncate(p.text, 16)) + ' · ' + fmtTime(p.ts) + '</span></span>',
        city ? { 'data-goto': city.id } : { 'data-view': 'feed' }));
    });

    if (byHot[0] && byHot[0].city) {
      const city = D.cityById(byHot[0].city);
      out.push(mqCard('',
        '<span class="mq-chip is-plain">♥</span>' +
        '<span class="mq-body"><b>被赞最多 · ♥ ' + likeCount(byHot[0]) + '</b>' +
        '<span>' + esc(city ? city.name : '') + '：' + esc(truncate(byHot[0].text, 14)) + '</span></span>',
        { 'data-goto': byHot[0].city }));
    }

    D.TOPICS.filter(function (t) { return t.id !== 'all'; }).map(function (t) {
      return { t: t, n: all.filter(function (p) { return p.topic === t.id; }).length };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 3).forEach(function (x) {
      out.push(mqCard('',
        '<span class="mq-chip is-topic">#</span>' +
        '<span class="mq-body"><b>#' + esc(x.t.name) + ' · ' + x.n + ' 条</b>' +
        '<span>只看这个话题</span></span>',
        { 'data-topic-jump': x.t.id }));
    });

    out.push(mqCard('',
      '<img class="mq-thumb" src="assets/video/dali-poster.jpg" alt="" loading="lazy" decoding="async">' +
      '<span class="mq-body"><b>实拍 · 洱海日出</b><span>4.4 秒循环短片</span></span>',
      { 'data-goto': 'dali' }));
    out.push(mqCard('',
      '<img class="mq-thumb" src="assets/img/band-three-pagodas.jpg" alt="" loading="lazy" decoding="async">' +
      '<span class="mq-body"><b>辰时 · 崇圣寺三塔</b><span>大理实拍素材</span></span>',
      { 'data-goto': 'dali' }));

    const cheap = D.CITIES.slice().sort(function (a, b) { return a.stats.cost - b.stats.cost; })[0];
    out.push(mqCard('',
      cityChip(cheap) +
      '<span class="mq-body"><b>最省 · ' + esc(cheap.name) + '</b>' +
      '<span>月均 ' + money(cheap.stats.cost) + '</span></span>',
      { 'data-goto': cheap.id }));

    const fast = D.CITIES.slice().sort(function (a, b) { return b.stats.net - a.stats.net; })[0];
    out.push(mqCard('',
      cityChip(fast) +
      '<span class="mq-body"><b>网速最快 · ' + esc(fast.name) + '</b>' +
      '<span>' + fast.stats.net + ' Mbps</span></span>',
      { 'data-goto': fast.id }));

    out.push(mqCard('',
      '<span class="mq-chip is-plain">＋</span>' +
      '<span class="mq-body"><b>写下你的旅居经验</b><span>房租、网速、几月最舒服</span></span>',
      { 'data-open-composer': '' }));

    return out;
  }

  function renderMarquee() {
    const track = $('[data-marquee-track]');
    if (!track) return;
    const items = marqueeItems();
    track.innerHTML = '';
    items.forEach(function (el) { track.appendChild(el); });
    // 复制一份，位移一半轨道就能无缝循环
    items.forEach(function (el) { track.appendChild(el.cloneNode(true)); });
  }

  /* 卡片悬停浮现的六条数据 = 首屏六项筛选，一一对应。
     没有数据的行直接不渲染（不写"暂无"），少于三条时只显示有的那几条。 */
  function dlRow(label, value, extra) {
    return '<div class="dl-row"><span class="dl-k">' + esc(label) + '</span>' +
      '<span class="dl-v">' + value + '</span>' + (extra || '') + '</div>';
  }

  /* 交通那行只留最有信息量的一句：优先带"高铁"的短句，其次机场。
     "双机场 + 高铁枢纽，市内地铁覆盖好" → 取逗号前那半句，比整句更利落。 */
  function transitSummary(city) {
    const raw = factValue(city, '交通');
    if (!raw) return null;
    const bits = String(raw).split(/[；;。]/);
    const pick = bits.filter(function (b) { return /高铁|铁路/.test(b); })[0] ||
      bits.filter(function (b) { return /机场|直飞/.test(b); })[0] || bits[0];
    const head = pick.split(/[，,]/)[0];
    const short = (head && /高铁|铁路|机场|直飞/.test(head)) ? head : pick;
    return truncate(short.trim(), 18);
  }

  /* 当月气温按气候均值给一句人话，说明"现在值不值得来" */
  function weatherWord(t) {
    if (t >= 28) return '偏热';
    if (t >= 22) return '温暖';
    if (t >= 15) return '舒服';
    if (t >= 5) return '偏凉';
    return '寒冷';
  }

  function comfortBars(city) {
    const now = new Date().getMonth();
    return '<span class="dl-bar" aria-hidden="true">' + city.months.comfort.map(function (v, i) {
      const h = Math.max(3, Math.round((v / 100) * 16));
      return '<i class="' + (i === now ? 'is-now' : '') + '" style="height:' + h + 'px"></i>';
    }).join('') + '</span>';
  }

  function cardDataLayer(city) {
    const rows = [];
    const month = new Date().getMonth();
    const tea = milkTeaOf(city);

    // 1. 月成本
    rows.push(dlRow('月成本', money(city.stats.cost) + ' <em>/ 月</em>'));

    // 2. 舒适度（12 格迷你条，当月高亮）
    rows.push(dlRow('舒适度', city.months.comfort[month] + ' <em>本月</em>', comfortBars(city)));

    // 3. 天气（本月平均气温；没接实时天气 API 之前不含湿度）
    const t = currentTemp(city);
    rows.push(dlRow('天气', t + '℃ <em>' + weatherWord(t) + '</em>'));

    // 4. 交通
    const tt = transitSummary(city);
    if (tt) rows.push(dlRow('交通', esc(tt)));

    // 5. 奶茶
    if (tea.tier > 0) {
      rows.push(dlRow('奶茶', '密度 ' + esc(tea.label),
        tea.brands ? ' <em>' + esc(tea.brands) + '</em>' : ''));
    }

    // 6. 景点
    if (city.attractions) rows.push(dlRow('景点', esc(truncate(city.attractions, 20))));

    // 未登录只露前几项，剩下的换成一块「注册可见」
    let shown = rows;
    if (!isMember()) {
      const keep = acctCfg().guestRows;
      shown = rows.slice(0, keep);
      const rest = rows.length - shown.length;
      if (rest > 0) {
        shown.push(dlRow('其余 ' + rest + ' 项', '<span class="need-signup">注册可见</span>'));
      }
    }

    // 触屏展开时数据层会盖住画面，末尾补一个城市名（桌面端不显示）
    return '<div class="card-data-layer" aria-hidden="true">' + shown.join('') +
      '<b class="dl-city">' + esc(city.name) + ' · ' + esc(city.region) + '</b></div>';
  }

  /* 触屏设备：没有 hover，靠 .is-open 展开数据层，同时只允许一张展开 */
  function noHover() {
    return window.matchMedia ? window.matchMedia('(hover: none)').matches : false;
  }

  function closeOpenCards(except) {
    $$('.card.is-open').forEach(function (el) { if (el !== except) el.classList.remove('is-open'); });
  }

  function cardEl(city) {
    const isVideo = !!city.video;
    const allowDraw = !(D.SETTINGS && D.SETTINGS.drawnFallback === false);
    const isPending = !isVideo && !allowDraw;
    const rate = isVideo ? randomRate() : 1;
    const el = document.createElement('article');
    el.className = 'card' + (isVideo ? ' has-video' : '') + (isPending ? ' is-pending' : '');
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    const posts = cityPostCount(city.id);
    const saved = store.savedCities.indexOf(city.id) >= 0;
    el.setAttribute('aria-label', city.name + '，' + city.region + '，旅居指数 ' + city.stats.index +
      '，月均 ' + money(city.stats.cost) + '，点开查看详情与 ' + posts + ' 条旅居笔记');
    el.innerHTML =
      '<div class="card-media">' +
        (isVideo ? '<img class="card-poster" src="' + esc(city.video.poster) + '" alt="" decoding="async">'
          : (isPending ? '<div class="card-pending" aria-hidden="true"></div>' : '<canvas aria-hidden="true"></canvas>')) +
        (isPending ? '' : '<div class="card-scrim"></div>') +
      '</div>' +
      '<div class="card-top">' +
        '<span class="pill ' + (isVideo ? 'pill-film' : 'pill-live') + '"><i></i>' +
          (isVideo ? '实拍画面' : (isPending ? '实拍待接入' : '实时绘制')) + '</span>' +
        '<button type="button" class="icon-btn star' + (saved ? ' is-on' : '') + '" data-star="' + city.id + '"' +
          ' aria-pressed="' + saved + '" aria-label="收藏 ' + esc(city.name) + '">★</button>' +
      '</div>' +
      '<div class="card-copy">' +
        '<h3><b>' + esc(city.name) + '</b><span>' + esc(city.region) + '</span></h3>' +
        '<p class="tagline">' + esc(city.tagline) + '</p>' +
        '<p class="card-data">' +
          (state.sort === 'mine'
            ? '你的指数 ' + Math.round(prefIndex(city)) + '<em>·</em>'
            : '指数 ' + city.stats.index + '<em>·</em>') +
          (isMember()
            ? money(city.stats.cost) + '<em>·</em>' + city.stats.net + ' Mbps'
            : '<span class="need-signup">成本 / 网速 注册可见</span>') +
          '<em>·</em>♥ ' + city.likes + '</p>' +
      '</div>' +
      cardDataLayer(city);

    if (isVideo) {
      el.__allowDraw = allowDraw;
      attachVideoLazy(el, city);
    } else if (!isPending) {
      attachSceneLazy($('canvas', el), city);
    }

    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-star]')) return;
      // 触屏没有 hover：第一次点开数据层，第二次才进详情
      if (noHover() && !el.classList.contains('is-open')) {
        closeOpenCards(el);
        el.classList.add('is-open');
        return;
      }
      openDetail(city.id);
    });
    el.addEventListener('keydown', function (ev) {
      // 卡片内部还有星标按钮等控件，键盘事件要留给它们自己处理
      if (ev.target !== el) return;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDetail(city.id); }
    });
    return el;
  }

  function galleryColumns() {
    const box = $('[data-gallery]');
    const tpl = box ? getComputedStyle(box).gridTemplateColumns : '';
    const n = tpl ? tpl.split(' ').filter(Boolean).length : 5;
    return Math.max(1, n);
  }

  /* 断点变化后列数会变，需要按新列数重排内容卡片的位置 */
  function syncGalleryColumns() {
    if (state.view !== 'gallery') return;
    if (galleryColumns() !== galleryCols) renderGallery();
  }

  function renderGallery() {
    cardScenes.forEach(function (i) { i.destroy(); });
    cardScenes = [];
    cardVideos.forEach(detachVideo);
    cardVideos = [];
    clearLazyScenes();
    clearVideoMounts();
    const box = $('[data-gallery]');
    box.innerHTML = '';
    const list = visibleCities();
    const cols = galleryColumns();
    galleryCols = cols;
    const withContent = !state.q.trim() && list.length >= 4;

    if (!withContent) {
      list.forEach(function (c) { box.appendChild(cardEl(c)); });
    } else {
      // 每排最左边一幅是内容卡片，其余是该排的城市。
      // 小屏时列数变少，内容卡片按列数收敛，避免整页都是卡片。
      const maxContent = cols > 1 ? Math.min(CONTENT_CARDS.length, cols - 1) : 1;
      const plan = contentPlan(maxContent);
      let cityIndex = 0;
      let cardIndex = 0;
      while (cityIndex < list.length) {
        if (cardIndex < plan.length) {
          box.appendChild(plan[cardIndex].build());
          cardIndex++;
          const take = cols > 1 ? cols - 1 : 4;
          for (let k = 0; k < take && cityIndex < list.length; k++) {
            box.appendChild(cardEl(list[cityIndex++]));
          }
        } else {
          for (let k = 0; k < cols && cityIndex < list.length; k++) {
            box.appendChild(cardEl(list[cityIndex++]));
          }
        }
      }
    }

    const emptyEl = $('[data-gallery-empty]');
    emptyEl.hidden = list.length > 0;
    const baseEmpty = '没有匹配的城市，换个关键词试试。';
    const hint = list.length ? '' : emptyHint();
    emptyEl.textContent = hint ? hint : baseEmpty;
    $('[data-result-line]').textContent = list.length
      ? '正在展示 ' + list.length + ' 座城市 · 点开看旅居数据与旅居笔记'
      : '';
    const live = $('[data-stat-live]');
    if (live) live.textContent = list.length + ' 幅';
    renderQuickFilters();
  }

  /* ---------------- 12 个月气候/舒适度图 ---------------- */

  function monthsChart(city) {
    const W = 720, H = 158, padX = 26;
    const colW = (W - padX * 2) / 12;
    const barTop = 12, barBase = 86;
    const tempTop = 104, tempBase = 132;
    const temps = city.months.temp;
    const tMin = Math.min.apply(null, temps), tMax = Math.max.apply(null, temps);
    const nowMonth = new Date().getMonth();

    let bars = '', labels = '', line = '', dots = '';
    for (let i = 0; i < 12; i++) {
      const cx = padX + colW * i + colW / 2;
      const bw = colW * 0.56;
      const v = city.months.comfort[i];
      const bh = Math.max(3, (v / 100) * (barBase - barTop));
      const isBest = city.stats.best.indexOf(i) >= 0;
      const cls = v >= 82 ? 'c-good' : (v >= 66 ? 'c-mid' : 'c-low');
      bars += '<rect class="bar ' + cls + (isBest ? ' is-best' : '') + '" x="' + (cx - bw / 2).toFixed(1) +
        '" y="' + (barBase - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) +
        '" rx="2"><title>' + monthLabel(i) + ' 舒适度 ' + v + '</title></rect>';
      const t = temps[i];
      const ty = tempBase - ((t - tMin) / Math.max(1, tMax - tMin)) * (tempBase - tempTop);
      line += (i === 0 ? 'M' : 'L') + cx.toFixed(1) + ' ' + ty.toFixed(1) + ' ';
      dots += '<circle class="temp-dot" cx="' + cx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="2.2">' +
        '<title>' + monthLabel(i) + ' 平均 ' + t + '℃</title></circle>';
      labels += '<text class="m-label' + (isBest ? ' is-best' : '') + '" x="' + cx.toFixed(1) + '" y="' + (H - 4) +
        '" text-anchor="middle">' + monthLabel(i) + '</text>';
      if (i === nowMonth) {
        labels += '<text class="m-now" x="' + cx.toFixed(1) + '" y="' + (barTop - 2) +
          '" text-anchor="middle">现在</text>';
      }
    }

    return '' +
      '<svg class="months-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="' + esc(city.name) + ' 十二个月的气候舒适度与平均气温">' +
        '<line class="axis" x1="' + padX + '" y1="' + barBase + '" x2="' + (W - padX) + '" y2="' + barBase + '"></line>' +
        '<line class="axis" x1="' + padX + '" y1="' + tempBase + '" x2="' + (W - padX) + '" y2="' + tempBase + '"></line>' +
        bars +
        '<path class="temp-line" d="' + line + '"></path>' +
        dots + labels +
      '</svg>' +
      '<p class="chart-key">柱高＝体感舒适度（0–100）<em>·</em>折线＝平均气温（'
      + tMin + '℃ – ' + tMax + '℃）<em>·</em>深色柱与加粗月份＝最推荐的旅居窗口</p>';
  }

  /* ---------------- 帖子渲染 ---------------- */

  function postEl(post, opts) {
    opts = opts || {};
    const au = user(post.author);
    const el = document.createElement('article');
    el.className = 'post' + (au.official ? ' is-official' : '');
    const liked = store.likedPosts.indexOf(post.id) >= 0;
    const saved = store.savedPosts.indexOf(post.id) >= 0;
    const replies = repliesOf(post);
    const city = post.city ? D.cityById(post.city) : null;

    const head = document.createElement('div');
    head.className = 'post-head';
    head.appendChild(avatar(au));
    const who = document.createElement('div');
    who.className = 'post-who';
    who.innerHTML = '<span class="who-line"><strong>' + esc(au.name) + '</strong>' +
      (au.official ? '<em class="badge-official" title="网站编辑部整理，非用户投稿">官方整理</em>' : '') + '</span>' +
      '<span>' + esc(au.home ? au.home + ' · ' : '') + fmtTime(post.ts) + '</span>';
    head.appendChild(who);
    const tags = document.createElement('div');
    tags.className = 'post-tags';
    tags.innerHTML = '<span class="tag">#' + esc(D.topicName(post.topic)) + '</span>' +
      (city && !opts.hideCity ? '<button type="button" class="tag tag-city" data-goto="' + city.id + '">' + esc(city.name) + '</button>' : '') +
      (post.mine ? '<span class="tag tag-mine">我发布的</span>' : '');
    head.appendChild(tags);
    el.appendChild(head);

    const body = document.createElement('p');
    body.className = 'post-text';
    body.textContent = post.text;
    el.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'post-actions';
    actions.innerHTML =
      '<button type="button" class="act' + (liked ? ' is-on' : '') + '" data-like="' + post.id + '" aria-pressed="' + liked + '">' +
        '<span aria-hidden="true">♥</span> ' + likeCount(post) + '</button>' +
      '<button type="button" class="act" data-reply-toggle="' + post.id + '">' +
        '<span aria-hidden="true">💬</span> ' + replies.length + '</button>' +
      '<button type="button" class="act' + (saved ? ' is-on' : '') + '" data-save-post="' + post.id + '" aria-pressed="' + saved + '">' +
        '<span aria-hidden="true">★</span> ' + (saved ? '已收藏' : '收藏') + '</button>';
    el.appendChild(actions);

    const replyBox = document.createElement('div');
    replyBox.className = 'replies';
    replyBox.hidden = true;
    replies.forEach(function (r) {
      const ru = user(r.author);
      const rEl = document.createElement('div');
      rEl.className = 'reply';
      rEl.appendChild(avatar(ru, 'sm'));
      const rt = document.createElement('div');
      rt.innerHTML = '<span class="who-line"><strong>' + esc(ru.name) + '</strong>' +
        (ru.official ? '<em class="badge-official">官方整理</em>' : '') + '</span>' +
        '<span>' + fmtTime(r.ts) + '</span>';
      const rp = document.createElement('p');
      rp.textContent = r.text;
      rt.appendChild(rp);
      rEl.appendChild(rt);
      replyBox.appendChild(rEl);
    });
    const form = document.createElement('div');
    form.className = 'reply-form';
    form.hidden = true;
    form.innerHTML = '<input type="text" placeholder="写下你的经验…" aria-label="回复">' +
      '<button type="button" class="primary-btn" data-reply-send="' + post.id + '">回复</button>';
    replyBox.appendChild(form);
    el.appendChild(replyBox);
    return el;
  }

  function renderPostList(box, posts, opts) {
    box.innerHTML = '';
    if (!posts.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = opts.empty || '这个话题下还没有笔记，你可以发第一条。';
      box.appendChild(p);
      return;
    }
    posts.forEach(function (p) { box.appendChild(postEl(p, opts)); });
  }

  /* ---------------- 详情面板 ---------------- */

  /* ==== 详情页的可视化模型：把这座城市的数据算成看得懂的图形 ==== */

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* 旅居指数拆成四项，按权重缩放，让四项贡献正好加总成城市自己那个指数 */
  const BASE_WEIGHTS = { climate: 30, cost: 25, net: 20, window: 25 };

  function prefWeights() {
    const p = store.prefs || {};
    const w = {
      climate: typeof p.climate === 'number' ? p.climate : BASE_WEIGHTS.climate,
      cost: typeof p.cost === 'number' ? p.cost : BASE_WEIGHTS.cost,
      net: typeof p.net === 'number' ? p.net : BASE_WEIGHTS.net,
      window: typeof p.window === 'number' ? p.window : BASE_WEIGHTS.window
    };
    const sum = w.climate + w.cost + w.net + w.window;
    if (!sum) return { climate: 0.25, cost: 0.25, net: 0.25, window: 0.25 };
    return { climate: w.climate / sum, cost: w.cost / sum, net: w.net / sum, window: w.window / sum };
  }

  /* 四项原始分（0–100），权重另外算 —— 这样滑杆动了只需要重算一次加权 */
  function indexRaw(city) {
    return {
      climate: bestComfort(city),
      cost: clamp(118 - city.stats.cost / 90, 35, 98),
      net: clamp(28 + city.stats.net * 0.24, 40, 99),
      window: clamp(city.stats.best.length * 16 + 30, 45, 98)
    };
  }

  const DEFAULT_W = { climate: 0.30, cost: 0.25, net: 0.20, window: 0.25 };

  function weightedScore(city, w) {
    const raw = indexRaw(city);
    return raw.climate * w.climate + raw.cost * w.cost + raw.net * w.net + raw.window * w.window;
  }

  /* 按当前偏好算一座城市的指数：默认权重时正好等于站里标的那个指数 */
  function prefIndex(city) {
    const base = weightedScore(city, DEFAULT_W);
    const k = base ? city.stats.index / base : 1;
    return weightedScore(city, prefWeights()) * k;
  }

  function indexParts(city) {
    const base = indexRaw(city);
    const w = prefWeights();
    const rows = [
      { key: 'climate', name: '气候舒适', hint: '全年最舒服的月份', value: base.climate, weight: w.climate },
      { key: 'cost', name: '成本友好', hint: '月均花销越低分越高', value: base.cost, weight: w.cost },
      { key: 'net', name: '网速', hint: '实测下行中位值', value: base.net, weight: w.net },
      { key: 'window', name: '长住窗口', hint: '一年里适合久住的月份数', value: base.window, weight: w.window }
    ];
    const weighted = rows.reduce(function (a, r) { return a + r.value * r.weight; }, 0);
    // 用默认权重做基准，把「按你偏好」的分数归一到站里那个指数的量纲上：
    // 权重没动时 you == city.stats.index，动了之后就在它附近上下浮动。
    const baseScore = weightedScore(city, DEFAULT_W);
    const k = baseScore ? city.stats.index / baseScore : 1;
    const you = Math.round(weighted * k);
    const scale = weighted ? you / weighted : 1;
    rows.forEach(function (r) {
      r.points = Math.round(r.value * r.weight * scale);
      r.bar = Math.round(clamp(r.value * scale, 20, 100));
    });
    rows.you = you;
    rows.base = city.stats.index;
    rows.custom = !!store.prefs;
    return rows;
  }

  /* 月均花销拆成五块（当前口径是估算，页面上会标明） */
  function costSplit(city) {
    const total = city.stats.cost;
    const rentShare = clamp(0.30 + (total - 2500) / 16000, 0.30, 0.52);
    const round50 = function (n) { return Math.round(n / 50) * 50; };
    const rent = round50(total * rentShare);
    const food = round50(total * 0.26);
    const transport = round50(total * 0.08);
    const utility = round50(total * 0.09);
    const misc = Math.max(0, total - rent - food - transport - utility);
    return {
      total: total,
      rows: [
        { key: '房租（一居）', value: rent, cls: 'c1' },
        { key: '吃饭（六成自炊）', value: food, cls: 'c2' },
        { key: '交通', value: transport, cls: 'c3' },
        { key: '水电网络', value: utility, cls: 'c4' },
        { key: '杂项', value: misc, cls: 'c5' }
      ]
    };
  }

  /* 找几座气质接近的城市：成本、网速、类型、气候带、推荐月份都算进去 */
  function similarCities(city, n) {
    const scored = D.CITIES.filter(function (c) { return c.id !== city.id; }).map(function (c) {
      let s = 0;
      s -= Math.abs(c.stats.cost - city.stats.cost) / 400;
      s -= Math.abs(c.stats.net - city.stats.net) / 60;
      s -= Math.abs((c.stats.altitude || 0) - (city.stats.altitude || 0)) / 3000;
      if (c.cat === city.cat) s += 2.2;
      if (c.climate && c.climate === city.climate) s += 1.4;
      s += c.stats.best.filter(function (m) { return city.stats.best.indexOf(m) >= 0; }).length * 0.5;
      return { city: c, score: s };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, n || 3).map(function (x) { return x.city; });
  }

  function monthNote(city, i) {
    const t = city.months.temp[i];
    const v = city.months.comfort[i];
    const ratio = (city.months.costIndex && city.months.costIndex[i]) || 1;
    const cost = Math.round(city.stats.cost * ratio / 50) * 50;
    const word = v >= 82 ? '很舒服' : (v >= 66 ? '还行' : '不太好受');
    const compare = ratio > 1.02 ? '比均价高' : (ratio < 0.95 ? '比均价低' : '和均价差不多');
    const isBest = city.stats.best.indexOf(i) >= 0;
    return '<b>' + monthLabel(i) + '</b>：平均 ' + t + '℃，体感' + word + '（' + v + '/100）；' +
      '当月花销约 ' + money(cost) + '，' + compare + '。' +
      (isBest ? '这个月是推荐的旅居窗口，住得久更划算。' : '');
  }

  /* 十二个月一格：温度、舒适度条、当月花销相对于均价的比例 */
  /* 指数圆环 */
  function donut(score) {
    const r = 44, c = 2 * Math.PI * r;
    const dash = (score / 100) * c;
    return '<svg class="donut" viewBox="0 0 112 112" role="img" aria-label="旅居指数 ' + score + '">' +
      '<circle class="donut-bg" cx="56" cy="56" r="' + r + '"></circle>' +
      '<circle class="donut-fg" cx="56" cy="56" r="' + r +
        '" stroke-dasharray="' + dash.toFixed(1) + ' ' + (c - dash).toFixed(1) + '"></circle>' +
      '<text class="donut-num" x="56" y="54" text-anchor="middle">' + score + '</text>' +
      '<text class="donut-cap" x="56" y="74" text-anchor="middle">旅居指数</text>' +
      '</svg>';
  }

  /* 十二个月：一张组合图（舒适度面积 + 气温折线 + 当月花销柱），点月份看细节 */
  function monthChart(city, selected) {
    const W = 664, H = 218, padX = 30;
    const temps = city.months.temp;
    const comfort = city.months.comfort;
    const costIndex = city.months.costIndex || [];
    const tMin = Math.min.apply(null, temps), tMax = Math.max.apply(null, temps);
    const colW = (W - padX * 2) / 12;
    const top = 18, areaBase = 132, tempTop = 28, tempBase = 116, costBase = 194;
    const nowMonth = new Date().getMonth();
    const cx = function (i) { return padX + colW * i + colW / 2; };

    let areaPath = 'M' + padX.toFixed(1) + ' ' + areaBase;
    let linePath = '', dots = '', bars = '', labels = '', hits = '', bestTicks = '';
    for (let i = 0; i < 12; i++) {
      const x = cx(i);
      const cy = areaBase - (comfort[i] / 100) * (areaBase - top);
      areaPath += ' L' + x.toFixed(1) + ' ' + cy.toFixed(1);
      const ty = tempBase - ((temps[i] - tMin) / Math.max(1, tMax - tMin)) * (tempBase - tempTop);
      linePath += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + ty.toFixed(1);
      dots += '<circle class="mc-dot" cx="' + x.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="2.6"></circle>';
      const ratio = costIndex[i] || 1;
      const bh = Math.max(3, ((ratio - 0.78) / 0.4) * 26);
      bars += '<rect class="mc-bar' + (i === selected ? ' is-on' : '') + '" x="' + (x - 9).toFixed(1) +
        '" y="' + (costBase - bh).toFixed(1) + '" width="18" height="' + bh.toFixed(1) + '" rx="3"></rect>';
      labels += '<text class="mc-label' + (i === nowMonth ? ' is-now' : '') + '" x="' + x.toFixed(1) +
        '" y="' + (H - 5) + '" text-anchor="middle">' + monthLabel(i) + '</text>';
      if (city.stats.best.indexOf(i) >= 0) {
        bestTicks += '<rect class="mc-best" x="' + (x - 13).toFixed(1) + '" y="' + (areaBase + 3) +
          '" width="26" height="3" rx="1.5"></rect>';
      }
      hits += '<rect class="mc-hit" data-month="' + i + '" x="' + (x - colW / 2).toFixed(1) +
        '" y="0" width="' + colW.toFixed(1) + '" height="' + H + '" role="button" tabindex="0"></rect>';
    }
    areaPath += ' L' + cx(11).toFixed(1) + ' ' + areaBase + ' Z';
    const selX = cx(selected);

    return '<div class="month-chart">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(city.name) +
        ' 十二个月的舒适度、气温与花销">' +
        '<defs><linearGradient id="mcArea" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#74a08c" stop-opacity="0.45"></stop>' +
          '<stop offset="100%" stop-color="#74a08c" stop-opacity="0.04"></stop>' +
        '</linearGradient></defs>' +
        '<rect class="mc-band" x="' + (selX - colW / 2).toFixed(1) + '" y="0" width="' +
          colW.toFixed(1) + '" height="' + H + '"></rect>' +
        '<line class="mc-axis" x1="' + padX + '" y1="' + areaBase + '" x2="' + (W - padX) +
          '" y2="' + areaBase + '"></line>' +
        '<path class="mc-area" d="' + areaPath + '"></path>' +
        '<path class="mc-line" d="' + linePath + '"></path>' +
        dots + bestTicks + bars + labels + hits +
      '</svg>' +
      '<div class="mc-legend">' +
        '<span><i class="lg-area"></i>体感舒适度</span>' +
        '<span><i class="lg-line"></i>平均气温 ' + tMin + '–' + tMax + '℃</span>' +
        '<span><i class="lg-bar"></i>当月花销（越高越贵）</span>' +
        '<span><i class="lg-best"></i>推荐旅居窗口</span>' +
      '</div>' +
      '<div class="month-note" data-month-note>' + monthNote(city, selected) + '</div>' +
      '</div>';
  }

  /* 目的地小卡片：一直播着这座城市的短片，粘在右栏顶部不挡内容 */
  function miniCard(city) {
    return '<div class="mini-card" title="' + esc(city.name) + ' 的实拍短片">' +
      '<div class="mini-media">' +
        (city.video
          ? '<video class="mini-video" muted loop playsinline preload="metadata" aria-hidden="true" ' +
            'poster="' + esc(city.video.poster || '') + '" src="' + esc(city.video.src) + '"></video>'
          : '<canvas class="mini-canvas" aria-hidden="true"></canvas>') +
        '<span class="mini-live" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="mini-copy">' +
        '<span class="mini-tag">目的地</span>' +
        '<b>' + esc(city.name) + '</b>' +
      '</div>' +
      '</div>';
  }

  /* 详情页里的锚点导航 + 逐块浮现 + 数字滚动 */
  function bindDetailNav(panel) {
    const sections = $$('.detail-sec', panel);
    if (detailNavObserver) { detailNavObserver.disconnect(); detailNavObserver = null; }
    if (sections.length && typeof IntersectionObserver !== 'undefined') {
      detailNavObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          $$('.dnav', panel).forEach(function (b) {
            b.classList.toggle('is-on', b.getAttribute('data-jump') === e.target.id);
          });
        });
      }, { root: panel, rootMargin: '-25% 0px -60% 0px' });
      sections.forEach(function (s) { detailNavObserver.observe(s); });
    }
    sections.forEach(function (s, i) {
      s.style.setProperty('--reveal-delay', (i * 60) + 'ms');
      s.classList.add('is-reveal');
    });
    requestAnimationFrame(function () {
      $$('.is-reveal', panel).forEach(function (s) { s.classList.add('is-in'); });
    });
    $$('[data-count]', panel).forEach(function (el) {
      const target = Number(el.getAttribute('data-count'));
      if (!target) return;
      let n = 0;
      const step = Math.max(1, Math.round(target / 20));
      const timer = setInterval(function () {
        n += step;
        if (n >= target) { n = target; clearInterval(timer); }
        el.textContent = String(n);
      }, 28);
    });
  }

  /* 到周边主要城市的交通（直接从城市档案的「交通」一行拆出来，不另编数据） */
  function transitChips(city) {
    const raw = factOf(city, '交通') || '';
    if (!raw) return '';
    const items = raw.split(/[、；;，,]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6);
    if (!items.length) return '';
    return '<div class="transit-row">' + items.map(function (s) {
      return '<span class="transit-chip">' + esc(s) + '</span>';
    }).join('') + '</div>';
  }

  /* 数据来源与状态：把「哪些是实打实、哪些还是估算」摆在明面上 */
  function similarBlock(city, member) {
    const list = similarCities(city, 3);
    return '<div class="side-card">' +
      '<h4>气质接近的城市</h4>' +
      '<div class="sim-list">' + list.map(function (c) {
        const meta = '指数 ' + c.stats.index +
          (member ? ' · ' + money(c.stats.cost) + ' · ' + c.stats.net + ' Mbps' : '');
        return '<button type="button" class="sim-card" data-goto="' + c.id + '">' +
          (c.video ? '<img src="' + esc(c.video.poster) + '" alt="" loading="lazy" decoding="async">'
                   : '<span class="sim-blank"></span>') +
          '<span class="sim-copy"><b>' + esc(c.name) + '</b><em>' + esc(c.region) + '</em>' +
          '<span>' + esc(meta) + '</span></span>' +
          '</button>';
      }).join('') + '</div>' +
      '<p class="side-note">按成本、网速、气候带与推荐月份算出来的相近城市。</p>' +
      '</div>';
  }

  function sourcesBlock(city) {
    const rows = [
      ['气温 / 舒适度', '公开气象月均推算', '示例', 'est'],
      ['月均成本', '房租 + 餐饮 + 交通 + 杂项', '估算', 'est'],
      ['网速', '待接宽带发展联盟 / 用户实测', '待核实', 'todo'],
      ['医疗 / 交通', '待接卫健委名单与 12306', '待核实', 'todo'],
      ['社区笔记', '本站用户发布', '实时', 'live']
    ];
    return '<div class="side-card">' +
      '<h4>数据来源与状态</h4>' +
      '<ul class="src-list">' + rows.map(function (r) {
        return '<li><span>' + esc(r[0]) + '</span><em>' + esc(r[1]) + '</em>' +
          '<i class="src-badge src-' + r[3] + '">' + esc(r[2]) + '</i></li>';
      }).join('') + '</ul>' +
      '<p class="side-note">上线前每一项都会换成能点开来源的真实数据。知道哪一项不对？' +
        '<button type="button" class="link-btn" data-open-composer-city="' + city.id + '">来补一条</button>' +
      '</p>' +
      '</div>';
  }

  /* 首屏那四个大数字 */
  /* 推荐月份在首屏只给第一段窗口，完整窗口留给下面的细节 */
  function bestMonthShort(city) {
    const m = city.stats.best.slice().sort(function (a, b) { return a - b; });
    if (!m.length) return '全年';
    let end = 0;
    while (end + 1 < m.length && m[end + 1] === m[end] + 1) end++;
    return m[0] === m[end] ? (m[0] + 1) + '月' : (m[0] + 1) + '–' + (m[end] + 1) + '月';
  }

  function heroStats(city) {
    const items = [
      { k: '旅居指数', v: city.stats.index, s: '满分 100', count: city.stats.index },
      { k: '月均成本', v: money(city.stats.cost), s: '含房租与日常' },
      { k: '实测网速', v: city.stats.net, unit: 'Mbps', s: '下行中位值', count: city.stats.net },
      { k: '推荐月份', v: bestMonthShort(city), s: bestMonthText(city) }
    ];
    return items.map(function (it) {
      return '<div class="hs"><span class="hs-k">' + esc(it.k) + '</span>' +
        '<span class="hs-v">' + (it.count ? '<b data-count="' + it.count + '">0</b>' : esc(String(it.v))) +
          (it.unit ? '<em>' + it.unit + '</em>' : '') + '</span>' +
        '<span class="hs-s">' + esc(it.s) + '</span></div>';
    }).join('');
  }

  function factOf(city, keyPart) {
    const hit = city.facts.filter(function (f) { return f[0].indexOf(keyPart) >= 0; })[0];
    return hit ? hit[1] : '';
  }

  /* 「适合谁 / 要注意」直接用城市档案里已有的两行，不另编 */
  function fitChips(city) {
    const out = [];
    const fit = factOf(city, '适合的人');
    const care = factOf(city, '要注意');
    const best = factOf(city, '最适合');
    if (fit) out.push('<span class="fit-chip is-fit"><b>适合</b>' + esc(fit) + '</span>');
    if (care) out.push('<span class="fit-chip is-care"><b>注意</b>' + esc(care) + '</span>');
    if (best) out.push('<span class="fit-chip is-best"><b>推荐</b>' + esc(best) + '</span>');
    return out.join('');
  }

  function indexBlock(all, shown, city, member) {
    const w = prefWeights();
    const prefRows = [
      { key: 'climate', label: '气候' },
      { key: 'cost', label: '成本' },
      { key: 'net', label: '网速' },
      { key: 'window', label: '长住窗口' }
    ];
    const you = all.you;
    return '<div class="index-block">' +
      '<div class="index-donut">' + donut(you) +
        '<p class="donut-note" data-donut-note>' +
          (you === all.base ? '四项加起来就是这个分数'
                            : '按你的权重 · 平台口径 ' + all.base) +
        '</p>' +
      '</div>' +
      '<div class="index-bars">' + shown.map(function (p) {
        return '<div class="bar-row" data-bar="' + p.key + '">' +
          '<span class="bar-k">' + esc(p.name) + '<em>' + esc(p.hint) + '</em></span>' +
          '<span class="bar-track"><i style="width:' + p.bar + '%"></i></span>' +
          '<span class="bar-v">' + p.points + '<em>分</em></span>' +
          '</div>';
      }).join('') + '</div>' +
      '</div>' +
      '<p class="chart-key">默认权重是当前口径；下面四个滑杆交给你自己调，' +
        '拖完还能让整个画廊按你的偏好重排。</p>' +
      (member ? '<div class="pref-box" data-pref-box>' +
        '<div class="pref-head">' +
          '<b>按你在意的，重算一次</b>' +
          '<span class="index-you">你的指数 <b data-pref-index>' + you + '</b></span>' +
        '</div>' +
        '<div class="pref-list">' + prefRows.map(function (r) {
          return '<label class="pref-row">' +
            '<span>' + esc(r.label) + '</span>' +
            '<input type="range" min="0" max="100" step="5" data-pref="' + r.key + '" ' +
              'value="' + Math.round(w[r.key] * 100) + '">' +
            '<b data-pref-val="' + r.key + '">' + Math.round(w[r.key] * 100) + '</b>' +
            '</label>';
        }).join('') + '</div>' +
        '<div class="pref-foot">' +
          '<span class="hint">越靠右＝你越在意这一项</span>' +
          '<button type="button" class="ghost-btn btn-slim" data-pref-reset>用默认权重</button>' +
          '<button type="button" class="primary-btn btn-slim" data-pref-sort>画廊按我的偏好排</button>' +
        '</div>' +
      '</div>' : '');
  }

  /* 拖动滑杆后只重画这一块，不整页重排 */
  function refreshIndexBlock(panel, city) {
    const host = panel ? $('#detail-index', panel) : null;
    if (!host || !city) return;
    const parts = indexParts(city);
    const donutEl = host.querySelector('.donut');
    if (donutEl) donutEl.outerHTML = donut(parts.you);
    const noteEl = host.querySelector('[data-donut-note]');
    if (noteEl) {
      noteEl.textContent = parts.you === parts.base
        ? '四项加起来就是这个分数'
        : '按你的权重 · 平台口径 ' + parts.base;
    }
    parts.forEach(function (p) {
      const row = host.querySelector('[data-bar="' + p.key + '"]');
      if (!row) return;
      const bar = row.querySelector('.bar-track i');
      if (bar) bar.style.width = p.bar + '%';
      const val = row.querySelector('.bar-v');
      if (val) val.innerHTML = p.points + '<em>分</em>';
    });
    const youEl = host.querySelector('[data-pref-index]');
    if (youEl) youEl.textContent = parts.you;
  }

  /* 搭子 / 活动的小条目：一句话 + 一个动作 */
  function miniPostList(list, action, label, emptyText) {
    if (!list.length) return '<p class="side-empty">' + esc(emptyText) + '</p>';
    return '<div class="mini-posts">' + list.map(function (p) {
      const au = user(p.author);
      const n = repliesOf(p).length;
      const verb = action === 'join' ? '举手' : '报名';
      return '<article class="mini-post">' +
        '<div class="mini-who">' +
          '<span class="mini-avatar" style="background:' + esc(au.color || '#666') + '">' +
            esc((au.name || '旅').slice(0, 1)) + '</span>' +
          '<b>' + esc(au.name) + '</b>' +
          '<span class="mini-time">' + fmtTime(p.ts) + '</span>' +
        '</div>' +
        '<p class="mini-text">' + esc(p.text) + '</p>' +
        '<div class="mini-foot">' +
          '<span class="mini-count">' + n + ' 人' + verb + '</span>' +
          '<button type="button" class="ghost-btn btn-slim" data-' + action + '="' + p.id + '">' +
            esc(label) + '</button>' +
        '</div>' +
        '</article>';
    }).join('') + '</div>';
  }

  /* 右栏的交流互动：交流 / 搭子 / 活动三个标签 */
  function communitySide(city, posts, postsShown, member) {
    const people = {};
    posts.forEach(function (p) { people[p.author] = (people[p.author] || 0) + 1; });
    const topics = {};
    posts.forEach(function (p) { topics[p.topic] = (topics[p.topic] || 0) + 1; });
    const topicKeys = Object.keys(topics).sort(function (a, b) { return topics[b] - topics[a]; }).slice(0, 4);
    const maxTopic = Math.max.apply(null, [1].concat(topicKeys.map(function (k) { return topics[k]; })));
    const buddies = posts.filter(function (p) { return p.topic === 'buddy'; });
    const meets = posts.filter(function (p) { return p.topic === 'meet'; });

    const peopleHtml = Object.keys(people)
      .sort(function (a, b) { return people[b] - people[a]; })
      .slice(0, 6)
      .map(function (id) {
        const u = user(id);
        return '<span class="person"><i style="background:' + esc(u.color || '#666') + '">' +
          esc((u.name || '旅').slice(0, 1)) + '</i>' + esc(u.name) + '</span>';
      }).join('');

    const topicHtml = topicKeys.length
      ? '<div class="topic-bars">' + topicKeys.map(function (k) {
          return '<div class="topic-row"><span>#' + esc(D.topicName(k)) + '</span>' +
            '<i style="width:' + Math.round((topics[k] / maxTopic) * 100) + '%"></i>' +
            '<b>' + topics[k] + '</b></div>';
        }).join('') + '</div>'
      : '';

    return '<section class="side-card community-card" id="detail-community">' +
      '<div class="community-head">' +
        '<h4>' + esc(city.name) + ' 的交流</h4>' +
        '<span class="count">' + posts.length + ' 条笔记</span>' +
      '</div>' +
      '<div class="ctabs" role="tablist">' +
        '<button type="button" class="ctab is-on" data-ctab="all" role="tab">交流<em>' + posts.length + '</em></button>' +
        '<button type="button" class="ctab" data-ctab="buddy" role="tab">搭子<em>' + buddies.length + '</em></button>' +
        '<button type="button" class="ctab" data-ctab="meet" role="tab">活动<em>' + meets.length + '</em></button>' +
      '</div>' +

      '<div data-ctab-panel="all">' +
        '<div class="composer-inline composer-inline-slim">' +
          '<div class="avatar" data-me-avatar>旅</div>' +
          '<div class="composer-inline-body">' +
            '<textarea rows="2" placeholder="房租、网速、找搭子、避坑…" data-city-input="' + city.id + '"></textarea>' +
            '<div class="composer-inline-foot">' +
              '<span class="hint">真实经验比榜单更有用</span>' +
              '<button type="button" class="primary-btn" data-city-post="' + city.id + '">发布</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        (peopleHtml ? '<div class="people-row"><span class="people-cap">在这里的人</span>' + peopleHtml + '</div>' : '') +
        topicHtml +
        '<div class="post-list post-list-side" data-city-posts></div>' +
      '</div>' +

      '<div data-ctab-panel="buddy" hidden>' +
        miniPostList(buddies, 'join', '我也去', '这座城市还没有人找搭子，你可以先发一条。') +
        '<button type="button" class="ghost-btn btn-slim mini-add" data-city-compose="' + city.id +
          '" data-compose-topic="buddy">＋ 我也在找搭子</button>' +
      '</div>' +

      '<div data-ctab-panel="meet" hidden>' +
        miniPostList(meets, 'signup', '报名', '还没有人发起活动，你可以当第一个。') +
        '<button type="button" class="primary-btn btn-slim mini-add" data-city-compose="' + city.id +
          '" data-compose-topic="meet">＋ 发起一个活动</button>' +
      '</div>' +
      '</section>';
  }

  function costBars(split, city) {
    const total = split.total;
    const segs = split.rows.map(function (r) {
      const pct = total ? (r.value / total) * 100 : 0;
      return '<i class="seg ' + r.cls + '" style="width:' + pct.toFixed(1) + '%" title="' +
        esc(r.key) + ' ' + money(r.value) + '"></i>';
    }).join('');
    const legend = split.rows.map(function (r) {
      return '<li><i class="dot ' + r.cls + '"></i><span>' + esc(r.key) + '</span>' +
        '<b>' + money(r.value) + '</b><em>' + Math.round((r.value / total) * 100) + '%</em></li>';
    }).join('');
    return '<div class="cost-bar">' + segs + '</div>' +
      '<ul class="cost-legend">' + legend + '</ul>' +
      '<p class="chart-key">合计 ' + money(total) + ' / 月' +
      '<em>·</em>按当前口径估算，房租接入公开挂牌价后会替换</p>';
  }

  /* 私人笔记：只存在本机，不公开 */
  function notesBlock(city) {
    const text = (store.notes && store.notes[city.id]) || '';
    return '<div class="side-card">' +
      '<h4>我的笔记</h4>' +
      '<textarea class="note-input" rows="4" placeholder="写给自己的：想住哪一片、几月去、要问谁…" ' +
        'data-note-input="' + city.id + '">' + esc(text) + '</textarea>' +
      '<div class="side-card-foot">' +
        '<span class="side-note">只在你这台设备上，不会公开</span>' +
        '<button type="button" class="ghost-btn btn-slim" data-note-save="' + city.id + '">保存</button>' +
      '</div>' +
      '</div>';
  }

  /* ---------------- 城市页里的「官方手册」入口 ---------------- */

  // 编辑部内容的展示顺序：手册 → 避坑 → 远程办公
  const HANDBOOK_ORDER = ['guide', 'pit', 'work'];

  function officialPostsOf(cityId) {
    return allPosts().filter(function (p) {
      return p.city === cityId && user(p.author).official;
    });
  }

  function handbookCard(city, posts) {
    // 官方手册对所有人开放（含未登录），所以这里直接列出真实存在的几篇
    const rows = HANDBOOK_ORDER
      .map(function (t) { return posts.filter(function (p) { return p.topic === t; })[0] || null; })
      .filter(Boolean);
    if (!rows.length) return '';

    return '<div class="handbook-card">' +
      '<div class="handbook-head">' +
        '<em class="badge-official">官方整理</em>' +
        '<h4>' + esc(city.name) + '旅居手册</h4>' +
        '<span class="handbook-by">栖旅编辑部</span>' +
      '</div>' +
      '<div class="handbook-list">' +
        rows.map(function (p) {
          const title = String(p.text || '').split('\n')[0];
          return '<button type="button" class="handbook-row" data-handbook="' + city.id +
              '" data-topic="' + esc(p.topic) + '">' +
            '<span class="handbook-topic">#' + esc(D.topicName(p.topic)) + '</span>' +
            '<span class="handbook-title">' + esc(title) + '</span>' +
            '<span class="handbook-go">看全文 →</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="handbook-foot">' +
        '<span class="handbook-cnt">编辑部为这座城市整理了 ' + rows.length + ' 篇 · 所有人可读</span>' +
        '<button type="button" class="ghost-btn btn-slim" data-handbook="' + city.id + '">去交流区看全部 →</button>' +
      '</div>' +
    '</div>';
  }

  function openDetail(cityId) {
    const city = D.cityById(cityId);
    if (!city) return;
    detailCityId = cityId;
    const overlay = $('#detail');
    const panel = $('[data-detail-panel]');
    const saved = store.savedCities.indexOf(city.id) >= 0;
    const posts = allPosts().filter(function (p) { return p.city === city.id; })
      .sort(function (a, b) { return b.ts - a.ts; });

    // 未登录：指数构成只露两项、住下来的细节整段锁住、社区只露前几条
    const member = isMember();
    const cfg = acctCfg();
    const postsShown = guestVisible(posts).shown;
    const parts = indexParts(city);
    const partsShown = member ? parts : parts.slice(0, cfg.guestStats);
    const split = costSplit(city);
    const monthPick = (detailMonth === null || detailMonth === undefined) ? new Date().getMonth() : detailMonth;
    const inCompare = store.compare.indexOf(city.id) >= 0;

    panel.innerHTML =
      /* 整页的动态底：一幅随时辰画的画 + 这座城市封面的一点点影子 */
      '<div class="detail-aura" data-detail-aura aria-hidden="true">' +
        '<div class="aura-media" data-aura-media></div>' +
        '<div class="aura-wash"></div>' +
        '<div class="aura-grain"></div>' +
      '</div>' +
      '<button type="button" class="close-btn" data-close-detail aria-label="关闭">×</button>' +
      '<div class="detail-inner">' +
        '<div class="detail-hero">' +
          (city.video ? videoTag(city.video) : '<canvas aria-hidden="true"></canvas>') +
          '<div class="detail-hero-scrim"></div>' +
          '<div class="detail-hero-copy">' +
            '<span class="pill ' + (city.video ? 'pill-film' : 'pill-live') + '"><i></i>' +
              (city.video ? esc(city.video.label || '实拍画面') : '实时绘制') + '</span>' +
            '<h2 id="detail-title">' + esc(city.name) + '</h2>' +
            '<p class="detail-region">' + esc(city.region) + '</p>' +
            '<p class="detail-tagline">' + esc(city.tagline) + '</p>' +
          '</div>' +
          '<div class="detail-hero-stats">' + heroStats(city) + '</div>' +
          '<div class="detail-hero-foot">' + city.tags.map(function (t) {
            return '<span class="tag">' + esc(t) + '</span>';
          }).join('') +
            (city.video && city.video.credit ? '<span class="tag tag-credit">' + esc(city.video.credit) + '</span>' : '') +
          '</div>' +
        '</div>' +

        '<nav class="detail-nav" data-detail-nav aria-label="城市页导航">' +
          '<div class="dnav-list">' +
            '<button type="button" class="dnav is-on" data-jump="detail-overview">概览</button>' +
            '<button type="button" class="dnav" data-jump="detail-index">指数</button>' +
            '<button type="button" class="dnav" data-jump="detail-months">月份</button>' +
            '<button type="button" class="dnav" data-jump="detail-cost">花费</button>' +
            '<button type="button" class="dnav" data-jump="detail-facts">细节</button>' +
            '<button type="button" class="dnav" data-jump="detail-community">交流</button>' +
          '</div>' +
          miniCard(city) +
        '</nav>' +

        '<div class="detail-body">' +
          '<div class="detail-actions">' +
            '<button type="button" class="primary-btn star' + (saved ? ' is-on' : '') + '" data-star="' + city.id + '"' +
              ' aria-pressed="' + saved + '">' + (saved ? '★ 已在收藏' : '☆ 收藏这座城市') + '</button>' +
            '<button type="button" class="ghost-btn' + (inCompare ? ' is-on' : '') + '" data-compare="' + city.id + '">' +
              (inCompare ? '⇄ 已在对比' : '⇄ 加入对比') + '</button>' +
            '<button type="button" class="ghost-btn" data-share="' + city.id + '">↗ 分享</button>' +
            '<button type="button" class="ghost-btn" data-open-composer-city="' + city.id + '">＋ 在这里发一条</button>' +
            '<button type="button" class="primary-btn" data-compare-open' +
              (store.compare.length ? '' : ' hidden') + '>看对比（' + store.compare.length + '）</button>' +
            '<span class="detail-note">' + esc(city.region) + ' · 数据口径见右栏</span>' +
          '</div>' +

          '<div class="detail-grid">' +
          '<div class="detail-main">' +

          '<section class="detail-sec" id="detail-overview">' +
            '<h3><span class="sec-num">01</span>为什么值得住一段时间</h3>' +
            '<p class="detail-intro">' + esc(city.intro) + '</p>' +
            handbookCard(city, officialPostsOf(city.id)) +
            '<div class="fit-row">' + fitChips(city) + '</div>' +
            transitChips(city) +
          '</section>' +

          '<section class="detail-sec" id="detail-index">' +
            '<h3><span class="sec-num">02</span>旅居指数 ' + city.stats.index + ' 是怎么来的</h3>' +
            indexBlock(parts, partsShown, city, member) +
            (member ? '' : lockBlock('指数还有 ' + (parts.length - partsShown.length) + ' 项没展开',
              '四项拆开看，才知道这个分数是被什么撑起来的。')) +
          '</section>' +

          '<section class="detail-sec" id="detail-months">' +
            '<h3><span class="sec-num">03</span>一年里的十二个月</h3>' +
            monthChart(city, monthPick) +
          '</section>' +

          '<section class="detail-sec" id="detail-cost">' +
            '<h3><span class="sec-num">04</span>钱花在哪儿</h3>' +
            costBars(split, city) +
          '</section>' +

          '<section class="detail-sec" id="detail-facts">' +
            '<h3><span class="sec-num">05</span>住下来会遇到的细节</h3>' +
            (member
              ? '<dl class="fact-list">' + city.facts.map(function (f) {
                  return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
                }).join('') + '</dl>'
              : lockBlock('住下来才发现的那些事',
                  '房租区间、能不能办公、看病方不方便、本地人怎么过日子——注册后可看。')) +
          '</section>' +
          '</div>' +

          '<aside class="detail-side">' +
            communitySide(city, posts, postsShown, member) +
            similarBlock(city, member) +
            sourcesBlock(city) +
            (member ? notesBlock(city)
                    : '<div class="side-card"><h4>我的笔记</h4>' +
                      lockBlock('注册后可以写私人笔记',
                        '想住哪一片、几月去、要问谁——都记在这座城市下面，只有自己看得到。') +
                      '</div>') +
          '</aside>' +
          '</div>' +
        '</div>' +
      '</div>';

    overlay.hidden = false;
    document.body.classList.add('no-scroll');
    // 详情打开时把后面画廊里的短片先停下：既省电，也把解码器留给详情页
    cardVideos.forEach(function (it) { if (it && it.el) { try { it.el.pause(); } catch (e) { /* 忽略 */ } } });

    // 整页的动态底：一幅随时辰画的画 + 这张封面的一点点影子
    const auraHost = $('[data-aura-media]', panel);
    if (auraHost) {
      const auraCanvas = document.createElement('canvas');
      auraHost.appendChild(auraCanvas);
      auraScene = S.create(auraCanvas, city.scene, { key: 'aura-' + city.id, speed: 0.75 });
      if (city.video && city.video.poster) {
        const drift = document.createElement('div');
        drift.className = 'aura-drift';
        drift.style.backgroundImage = 'url("' + city.video.poster + '")';
        auraHost.appendChild(drift);
      }
    }

    const heroCanvas = $('.detail-hero canvas', panel);
    if (city.video) {
      // 详情页的大图按原速放，节奏由卡片那边负责
      const dv = $('.detail-hero video', panel);
      detailVideo = attachVideo(dv, { rate: 1 });
    } else if (heroCanvas) {
      detailScene = S.create(heroCanvas, city.scene, { key: 'hero-' + city.id, speed: 1.05 });
    }

    // 目的地小卡片里的画面：有实拍就播视频，没有就用实时绘制
    const miniMedia = $('.mini-card .mini-media', panel);
    if (miniMedia) {
      const mv = $('.mini-video', miniMedia);
      if (mv) miniVideo = attachVideo(mv, { rate: 1.2 });
      const mc = $('.mini-canvas', miniMedia);
      if (mc) miniScene = S.create(mc, city.scene, { key: 'mini-' + city.id, speed: 1.1 });
    }
    bindDetailNav(panel);

    renderPostList($('[data-city-posts]', panel), postsShown, {
      hideCity: true,
      empty: '这座城市还没有旅居笔记，你可以发第一条。'
    });
    setUrlCity(city.id);
    if (!member && posts.length > postsShown.length) {
      const box = $('[data-city-posts]', panel);
      if (box) {
        box.insertAdjacentHTML('beforeend', lockBlock(
          '这里还有 ' + (posts.length - postsShown.length) + ' 条旅居笔记',
          '住过这里的人留下的房租、网速、避坑经验——注册后全部能看。'));
      }
    }
    refreshMeAvatars(panel);
    requestAnimationFrame(function () { panel.scrollTop = 0; });
    panel.focus();
  }

  function statItem(label, value, sub) {
    return '<div class="stat"><dt>' + esc(label) + '</dt>' +
      '<dd class="stat-value">' + esc(value) + '</dd>' +
      (sub ? '<dd class="stat-sub">' + esc(sub) + '</dd>' : '') + '</div>';
  }

  function closeDetail() {
    if (detailScene) { detailScene.destroy(); detailScene = null; }
    if (auraScene) { auraScene.destroy(); auraScene = null; }
    if (detailVideo) { detachVideo(detailVideo); detailVideo = null; }
    if (miniVideo) { detachVideo(miniVideo); miniVideo = null; }
    if (miniScene) { miniScene.destroy(); miniScene = null; }
    if (detailNavObserver) { detailNavObserver.disconnect(); detailNavObserver = null; }
    detailCityId = null;
    detailMonth = null;
    setUrlCity(null);
    $('#detail').hidden = true;
    document.body.classList.remove('no-scroll');
    syncAllVideos();
  }

  /* ---------------- 交流视图 ---------------- */

  function renderTopics() {
    const box = $('[data-topic-list]');
    box.innerHTML = D.TOPICS.map(function (t) {
      const n = t.id === 'all' ? allPosts().length
        : allPosts().filter(function (p) { return p.topic === t.id; }).length;
      return '<button type="button" class="topic' + (state.topic === t.id ? ' is-on' : '') +
        '" data-topic="' + t.id + '" aria-pressed="' + (state.topic === t.id) + '">' +
        '<span>' + esc(t.name) + '</span><i>' + n + '</i></button>';
    }).join('');
  }

  function renderHotCities() {
    const box = $('[data-hot-cities]');
    const counts = {};
    allPosts().forEach(function (p) {
      if (!p.city) return;
      counts[p.city] = (counts[p.city] || 0) + 1 + (p.replies ? p.replies.length : 0);
    });
    const list = Object.keys(counts).map(function (id) {
      return { city: D.cityById(id), n: counts[id] };
    }).filter(function (x) { return x.city; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    box.innerHTML = list.map(function (x, i) {
      return '<button type="button" class="hot" data-goto="' + x.city.id + '">' +
        '<span class="hot-rank">' + (i + 1) + '</span>' +
        '<span class="hot-name">' + esc(x.city.name) + '<em>' + esc(x.city.region) + '</em></span>' +
        '<span class="hot-n">' + x.n + '</span>' +
      '</button>';
    }).join('');
  }

  function feedPosts() {
    let list = allPosts().filter(function (p) {
      if (state.topic !== 'all' && p.topic !== state.topic) return false;
      if (state.feedCity !== 'all' && p.city !== state.feedCity) return false;
      return true;
    });
    if (state.feedSort === 'hot') {
      list.sort(function (a, b) { return likeCount(b) - likeCount(a); });
    } else {
      list.sort(function (a, b) { return b.ts - a.ts; });
    }
    return list;
  }

  function renderFeed() {
    renderTopics();
    renderHotCities();
    const box = $('[data-post-list]');
    const all = feedPosts();
    const view = guestVisible(all);
    renderPostList(box, view.shown, {});
    if (view.hidden > 0) {
      box.insertAdjacentHTML('beforeend', lockBlock(
        '社区里还有 ' + view.hidden + ' 条旅居笔记',
        '找搭子、避坑、房租、网速——都是住过那里的人写的。注册后全部能看，发帖也免费。'));
    }
    refreshMeAvatars(document);
  }

  /* ---------------- 收藏视图 ---------------- */

  function renderSaved() {
    const box = $('[data-saved-cities]');
    const savedPostBox = $('[data-saved-posts]');

    if (!isMember()) {
      box.innerHTML = lockBlock('收藏夹要注册后才能用',
        '把想去的城市存成清单，是这里最省事的用法。注册免费，收藏不限量。');
      if (savedPostBox) savedPostBox.innerHTML = '';
      $('[data-saved-empty]').hidden = true;
      return;
    }

    const ids = store.savedCities.filter(function (id) { return !!D.cityById(id); });
    box.innerHTML = '';
    ids.forEach(function (id) {
      const c = D.cityById(id);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'saved-card';
      el.setAttribute('data-goto', id);
      el.innerHTML = '<strong>' + esc(c.name) + '</strong><span>' + esc(c.region) + '</span>' +
        '<em>月均 ' + money(c.stats.cost) + ' · ' + c.stats.net + ' Mbps · 指数 ' + c.stats.index + '</em>';
      box.appendChild(el);
    });
    $('[data-saved-empty]').hidden = ids.length > 0;

    if (savedPostBox) {
      const list = allPosts().filter(function (p) { return store.savedPosts.indexOf(p.id) >= 0; });
      renderPostList(savedPostBox, list, { empty: '还没有收藏的笔记。在交流页点★就能收进来。' });
    }
  }

  function updateBadges() {
    // 未登录时不显示收藏数：收藏夹本来就要注册才能用
    const savedCount = isMember() ? store.savedCities.length : 0;
    $$('[data-saved-count]').forEach(function (el) { el.textContent = savedCount; });
    const total = allPosts().length;
    $$('[data-live-post-count]').forEach(function (el) {
      el.textContent = total;
      el.hidden = total === 0;
    });
    const c = $('[data-stat-cities]');
    if (c) c.textContent = D.CITIES.length + ' 座';
    const p = $('[data-stat-posts]');
    if (p) p.textContent = total + ' 条';
    const t = $('[data-stat-topics]');
    if (t) t.textContent = (D.TOPICS.length - 1) + ' 个';
    $$('[data-city-count]').forEach(function (el) { el.textContent = D.CITIES.length; });
  }

  function refreshMeAvatars(root) {
    $$('[data-me-avatar]', root).forEach(function (el) {
      el.textContent = store.me.name.slice(0, 1);
      el.style.background = store.me.color;
    });
  }

  /* 首屏头像组：用真实的社区成员，而不是编出来的数字 */
  function renderHeroAvatars() {
    const box = $('[data-hero-avatars]');
    if (!box) return;
    const ids = ['youyou', 'linxiaoman', 'kiwi', 'daxiong', 'shanque', 'mia', 'qingjian', 'ahe'];
    box.innerHTML = '';
    ids.forEach(function (id) {
      const u = user(id);
      const el = document.createElement('span');
      el.className = 'avatar';
      el.style.background = u.color;
      el.textContent = u.name.slice(0, 1);
      box.appendChild(el);
    });
  }

  /* 照片在导航下方时，导航浮在照片上（白字透明底）；滚过去之后回到纸色 */
  function updateHeroMode() {
    const bar = $('.topbar');
    if (bar) document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
    const active = document.querySelector('.view:not([hidden])');
    const photo = active ? active.querySelector('.hero, .page-head') : null;
    let on = false;
    if (photo) {
      const rect = photo.getBoundingClientRect();
      on = rect.top < 70 && rect.bottom > 150;
    }
    document.body.classList.toggle('hero-mode', on);
  }

  /* ---------------- 视图切换 ---------------- */

  function setView(view) {
    state.view = view;
    ['gallery', 'feed', 'saved'].forEach(function (v) {
      $('#view-' + v).hidden = v !== view;
    });
    $$('[data-view]').forEach(function (b) {
      const on = b.getAttribute('data-view') === view;
      b.classList.toggle('is-active', on);
      if (b.hasAttribute('aria-current') || on) b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    if (view === 'feed') renderFeed();
    if (view === 'saved') renderSaved();
    if (view === 'gallery') {
      cardScenes.forEach(function (i) { i.needsDraw = true; });
      syncGalleryColumns();
    }
    // 背景是按时间画的那十二幅，切页签后要重新量一次尺寸再画
    if (window.QiyuDay) window.QiyuDay.refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateHeroMode();
  }

  /* ---------------- 发帖 ---------------- */

  function addPost(cityId, topic, text) {
    if (!text.trim()) return false;
    // 接了后端：发到服务器，然后重新拉一次（所有人都会看到）
    if (window.QiyuSync && window.QiyuSync.on && window.QiyuSync.user()) {
      window.QiyuSync.createPost({ city: cityId, topic: topic, body: text.trim() })
        .then(function () { cloudPull(); })
        .catch(function (err) { toast('没发出去：' + (err.message || '网络问题')); });
      return true;
    }
    store.userPosts.push({
      id: 'u' + Date.now(),
      city: cityId || '',
      topic: topic || 'daily',
      text: text.trim(),
      ts: Date.now()
    });
    store.save();
    updateBadges();
    return true;
  }

  function openComposer(presetCity, presetTopic) {
    const citySel = $('[data-composer-city]');
    citySel.innerHTML = '<option value="">不指定城市</option>' + D.CITIES.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '　' + esc(c.region) + '</option>';
    }).join('');
    if (presetCity) citySel.value = presetCity;
    const topicSel = $('[data-composer-topic]');
    if (!topicSel.options.length) {
      topicSel.innerHTML = D.TOPICS.filter(function (t) { return t.id !== 'all'; }).map(function (t) {
        return '<option value="' + t.id + '">' + esc(t.name) + '</option>';
      }).join('');
    }
    if (presetTopic) topicSel.value = presetTopic;
    $('#composer').hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(function () { $('[data-composer-text]').focus(); }, 30);
  }

  function closeComposer() {
    $('#composer').hidden = true;
    document.body.classList.remove('no-scroll');
  }

  /* ---------------- 事件 ---------------- */

  function bind() {
    window.addEventListener('scroll', updateHeroMode, { passive: true });
    window.addEventListener('resize', updateHeroMode);
    let resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncGalleryColumns, 180);
    });

    // 偏好滑杆：拖动即时重算这一页的指数
    document.addEventListener('input', function (ev) {
      const t = ev.target;
      if (!t || !t.matches || !t.matches('[data-pref]')) return;
      const key = t.getAttribute('data-pref');
      if (!store.prefs) {
        store.prefs = {
          climate: BASE_WEIGHTS.climate,
          cost: BASE_WEIGHTS.cost,
          net: BASE_WEIGHTS.net,
          window: BASE_WEIGHTS.window
        };
      }
      store.prefs[key] = Number(t.value);
      if (window.QiyuSync && window.QiyuSync.on && window.QiyuSync.user()) {
        window.QiyuSync.savePrefs(store.prefs).catch(function () { /* 本地已保存 */ });
      }
      store.save();
      const valEl = $('[data-pref-val="' + key + '"]');
      if (valEl) valEl.textContent = t.value;
      const panel = $('[data-detail-panel]');
      if (panel && detailCityId) refreshIndexBlock(panel, D.cityById(detailCityId));
    });

    document.addEventListener('click', function (ev) {
      const t = ev.target;

      // 账号相关：先处理弹层自己的按钮，再拦需要登录的动作
      if (t.closest('[data-open-auth]')) { openAuth(); return; }
      if (t.closest('[data-close-auth]')) { closeAuth(); return; }
      const authTab = t.closest('[data-auth-mode]');
      if (authTab) {
        authMode = authTab.getAttribute('data-auth-mode');
        applyAuthMode();
        return;
      }
      if (t.closest('[data-signout]')) { signOut(); return; }
      if (!isMember()) {
        const gated = t.closest('[data-star]') || t.closest('[data-open-composer]') ||
          t.closest('[data-open-composer-city]') || t.closest('[data-like]') ||
          t.closest('[data-save-post]') || t.closest('[data-reply-toggle]') ||
          t.closest('[data-reply-send]') || t.closest('[data-city-post]') ||
          t.closest('[data-quick-input]') || t.closest('[data-quick-post]') ||
          t.closest('[data-compare]') || t.closest('[data-join]') || t.closest('[data-signup]');
        if (gated) {
          openAuth('登录后就能收藏、发帖、点赞和回复——注册免费，发帖也免费。');
          return;
        }
      }

      // 详情页里的对比、分享、月份切换、私人笔记
      const cmpBtn = t.closest('[data-compare]');
      if (cmpBtn) {
        const id = cmpBtn.getAttribute('data-compare');
        const i = store.compare.indexOf(id);
        if (i >= 0) { store.compare.splice(i, 1); toast('已移出对比'); }
        else if (store.compare.length >= 3) { toast('最多同时对比 3 座城市'); return; }
        else { store.compare.push(id); toast('已加入对比，选好 2–3 座点「看对比」'); }
        store.save();
        syncCompareButtons();
        const cbox = $('#compare');
        if (cbox && !cbox.hidden) openCompare();
        return;
      }
      if (t.closest('[data-compare-open]')) { openCompare(); return; }
      if (t.closest('[data-close-compare]')) { closeCompare(); return; }
      if (t.closest('[data-compare-clear]')) {
        store.compare = [];
        store.save();
        syncCompareButtons();
        closeCompare();
        toast('对比已清空');
        return;
      }
      const shareBtn = t.closest('[data-share]');
      if (shareBtn) { shareCity(shareBtn.getAttribute('data-share')); return; }
      // 右栏三个标签：交流 / 搭子 / 活动
      const ctab = t.closest('[data-ctab]');
      if (ctab) {
        const key = ctab.getAttribute('data-ctab');
        const card = ctab.closest('.community-card');
        if (card) {
          $$('.ctab', card).forEach(function (b) { b.classList.toggle('is-on', b === ctab); });
          $$('[data-ctab-panel]', card).forEach(function (pn) {
            pn.hidden = pn.getAttribute('data-ctab-panel') !== key;
          });
        }
        return;
      }
      // 举手（搭子）/ 报名（活动）
      const joinBtn = t.closest('[data-join]') || t.closest('[data-signup]');
      if (joinBtn) {
        const isJoin = joinBtn.hasAttribute('data-join');
        const id = joinBtn.getAttribute(isJoin ? 'data-join' : 'data-signup');
        const post = allPosts().filter(function (p) { return p.id === id; })[0];
        if (!post) return;
        const verbText = isJoin ? '我也想一起，算我一个。' : '我报名。';
        if (post.remoteId && window.QiyuSync && window.QiyuSync.on) {
          window.QiyuSync.createReply(post.remoteId, verbText)
            .then(function () { toast(isJoin ? '已举手，对方会在帖子里看到你' : '已报名，组织者会在帖子里看到你'); cloudPull(); })
            .catch(function (err) { toast('没成功：' + (err.message || '网络问题')); });
          return;
        }
        if (!store.userReplies[id]) store.userReplies[id] = [];
        store.userReplies[id].push({ text: verbText, ts: Date.now() });
        store.save();
        const n = repliesOf(post).length;
        joinBtn.classList.add('is-on');
        joinBtn.textContent = isJoin ? '已举手 ✓' : '已报名 ✓';
        const foot = joinBtn.closest('.mini-foot');
        const countEl = foot ? $('.mini-count', foot) : null;
        if (countEl) countEl.textContent = n + ' 人' + (isJoin ? '举手' : '报名');
        toast(isJoin ? '已举手，对方会在帖子里看到你' : '已报名，组织者会在帖子里看到你');
        rerenderPost(id, post);
        return;
      }
      // 从搭子/活动标签直接发帖
      const cityCompose = t.closest('[data-city-compose]');
      if (cityCompose) {
        openComposer(cityCompose.getAttribute('data-city-compose'),
          cityCompose.getAttribute('data-compose-topic'));
        return;
      }
      const jump = t.closest('[data-jump]');
      if (jump) {
        const target = $('#' + jump.getAttribute('data-jump'));
        if (target) {
          const panel = $('[data-detail-panel]');
          if (panel) panel.scrollTo({ top: Math.max(0, target.offsetTop - 66), behavior: 'smooth' });
          else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      // 偏好权重：重置 / 按偏好排画廊
      if (t.closest('[data-pref-reset]')) {
        store.prefs = null;
        store.save();
        const box = $('[data-pref-box]');
        if (box) {
          $$('[data-pref]', box).forEach(function (inp) {
            const key = inp.getAttribute('data-pref');
            inp.value = BASE_WEIGHTS[key];
            const v = $('[data-pref-val="' + key + '"]', box);
            if (v) v.textContent = BASE_WEIGHTS[key];
          });
        }
        const panel0 = $('[data-detail-panel]');
        if (panel0 && detailCityId) refreshIndexBlock(panel0, D.cityById(detailCityId));
        toast('已恢复默认权重');
        return;
      }
      if (t.closest('[data-pref-sort]')) {
        state.sort = 'mine';
        const sel = $('[data-sort]');
        if (sel) sel.value = 'mine';
        closeDetail();
        setView('gallery');
        const anchor = $('[data-gallery-anchor]');
        if (anchor) {
          const top = anchor.getBoundingClientRect().top + window.scrollY - 76;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
        toast('画廊已按你的偏好重排');
        return;
      }
      const mcell = t.closest('[data-month]');
      if (mcell) {
        detailMonth = Number(mcell.getAttribute('data-month'));
        const panel = $('[data-detail-panel]');
        const host = panel ? $('#detail-months', panel) : null;
        const city2 = detailCityId ? D.cityById(detailCityId) : null;
        if (host && city2) {
          const chart = host.querySelector('.month-chart');
          if (chart) chart.outerHTML = monthChart(city2, detailMonth);
        }
        return;
      }
      const noteSave = t.closest('[data-note-save]');
      if (noteSave) {
        const id = noteSave.getAttribute('data-note-save');
        const input = $('[data-note-input="' + id + '"]');
        store.notes[id] = input ? input.value : '';
        if (window.QiyuSync && window.QiyuSync.on && window.QiyuSync.user()) {
          window.QiyuSync.saveNote(id, store.notes[id]).catch(function () { /* 本地已保存 */ });
        }
        store.save();
        toast('笔记已保存，只有你能看到');
        return;
      }

      const viewBtn = t.closest('[data-view]');
      if (viewBtn) { setView(viewBtn.getAttribute('data-view')); return; }

      const chip = t.closest('[data-cat]');
      if (chip) {
        state.cat = chip.getAttribute('data-cat');
        renderCatChips();
        renderGallery();
        return;
      }

      const qf = t.closest('[data-qf]');
      if (qf) {
        const key = qf.getAttribute('data-qf');
        const val = qf.getAttribute('data-qf-val');
        if (typeof state[key] === 'boolean') {
          state[key] = !state[key];
        } else if (state[key] === val) {
          // 再点一次同一个档位 = 取消，回到不限
          state[key] = 'all';
        } else {
          state[key] = val;
        }
        renderGallery();
        return;
      }

      if (t.closest('[data-qf-reset]')) {
        resetQuickFilters();
        renderGallery();
        return;
      }

      // 触屏：点卡片以外的地方，把展开的数据层收起来
      if (!t.closest('.card')) closeOpenCards(null);

      const star = t.closest('[data-star]');
      if (star) {
        const id = star.getAttribute('data-star');
        const city = D.cityById(id);
        const idx = store.savedCities.indexOf(id);
        if (idx >= 0) {
          store.savedCities.splice(idx, 1);
          toast('已取消收藏 ' + city.name);
        } else {
          store.savedCities.push(id);
          toast('已把 ' + city.name + ' 加入旅居清单');
        }
        if (window.QiyuSync && window.QiyuSync.on && window.QiyuSync.user()) {
          window.QiyuSync.saveCity(id, idx < 0).catch(function () { /* 同步失败不影响本地 */ });
        }
        store.save();
        syncStars(id);
        updateBadges();
        if (state.view === 'saved') renderSaved();
        return;
      }

      const goto = t.closest('[data-goto]');
      if (goto) { openDetail(goto.getAttribute('data-goto')); return; }

      // 城市页 → 编辑部手册：跳到交流区，并按这座城市（可带话题）筛选
      const hbBtn = t.closest('[data-handbook]');
      if (hbBtn) {
        state.feedCity = hbBtn.getAttribute('data-handbook');
        state.topic = hbBtn.getAttribute('data-topic') || 'all';
        closeDetail();
        setView('feed');
        const citySel = $('[data-feed-city]');
        if (citySel) citySel.value = state.feedCity;
        return;
      }

      const scrollBtn = t.closest('[data-scroll-gallery]');
      if (scrollBtn) {
        const anchor = $('[data-gallery-anchor]');
        if (anchor) {
          const top = anchor.getBoundingClientRect().top + window.scrollY - 76;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
        return;
      }

      const closeD = t.closest('[data-close-detail]');
      if (closeD) { closeDetail(); return; }

      const openC = t.closest('[data-open-composer]');
      if (openC) { openComposer(null); return; }
      const openCC = t.closest('[data-open-composer-city]');
      if (openCC) { closeDetail(); openComposer(openCC.getAttribute('data-open-composer-city')); return; }
      const closeC = t.closest('[data-close-composer]');
      if (closeC) { closeComposer(); return; }

      const topic = t.closest('[data-topic]');
      if (topic) {
        state.topic = topic.getAttribute('data-topic');
        renderTopics();
        renderPostList($('[data-post-list]'), feedPosts(), {});
        return;
      }

      const topicJump = t.closest('[data-topic-jump]');
      if (topicJump) {
        state.topic = topicJump.getAttribute('data-topic-jump');
        setView('feed');
        return;
      }

      const sponsor = t.closest('[data-sponsor]');
      if (sponsor) {
        toast('合作位占位：把 data.js 里的 SPONSOR 换成真实投放内容即可');
        return;
      }

      const like = t.closest('[data-like]');
      if (like) {
        const id = like.getAttribute('data-like');
        const i = store.likedPosts.indexOf(id);
        if (i >= 0) store.likedPosts.splice(i, 1); else store.likedPosts.push(id);
        const remotePost = store.remotePosts.filter(function (p) { return p.id === id; })[0];
        if (remotePost && remotePost.remoteId && window.QiyuSync && window.QiyuSync.on) {
          const call = i >= 0 ? window.QiyuSync.unlike(remotePost.remoteId) : window.QiyuSync.like(remotePost.remoteId);
          call.then(function () { remotePost.likes = Math.max(0, remotePost.likes + (i >= 0 ? -1 : 1)); })
              .catch(function () { toast('点赞没同步上，稍后再试'); });
        }
        store.save();
        const post = allPosts().filter(function (p) { return p.id === id; })[0];
        like.innerHTML = '<span aria-hidden="true">♥</span> ' + likeCount(post);
        like.classList.toggle('is-on', store.likedPosts.indexOf(id) >= 0);
        like.setAttribute('aria-pressed', store.likedPosts.indexOf(id) >= 0);
        return;
      }

      const saveP = t.closest('[data-save-post]');
      if (saveP) {
        const id = saveP.getAttribute('data-save-post');
        const i = store.savedPosts.indexOf(id);
        if (i >= 0) { store.savedPosts.splice(i, 1); toast('已取消收藏这条笔记'); }
        else { store.savedPosts.push(id); toast('已收藏这条笔记'); }
        store.save();
        const on = store.savedPosts.indexOf(id) >= 0;
        saveP.classList.toggle('is-on', on);
        saveP.setAttribute('aria-pressed', on);
        saveP.innerHTML = '<span aria-hidden="true">★</span> ' + (on ? '已收藏' : '收藏');
        if (state.view === 'saved') renderSaved();
        return;
      }

      const rt = t.closest('[data-reply-toggle]');
      if (rt) {
        const postElm = rt.closest('.post');
        const box = $('.replies', postElm);
        const form = $('.reply-form', postElm);
        box.hidden = !box.hidden;
        form.hidden = box.hidden;
        if (!box.hidden) { const inp = $('input', form); if (inp) inp.focus(); }
        return;
      }

      const send = t.closest('[data-reply-send]');
      if (send) {
        const id = send.getAttribute('data-reply-send');
        const form = send.closest('.reply-form');
        const input = $('input', form);
        const text = (input.value || '').trim();
        if (!text) { input.focus(); return; }
        const remoteTarget = store.remotePosts.filter(function (p) { return p.id === id; })[0];
        if (remoteTarget && remoteTarget.remoteId && window.QiyuSync && window.QiyuSync.on) {
          window.QiyuSync.createReply(remoteTarget.remoteId, text)
            .then(function () { toast('已回复'); cloudPull(); })
            .catch(function (err) { toast('没回上：' + (err.message || '网络问题')); });
          input.value = '';
          return;
        }
        if (!store.userReplies[id]) store.userReplies[id] = [];
        store.userReplies[id].push({ text: text, ts: Date.now() });
        store.save();
        toast('已回复');
        const post = allPosts().filter(function (p) { return p.id === id; })[0];
        rerenderPost(id, post);
        return;
      }

      const quick = t.closest('[data-quick-post]');
      if (quick) { submitQuick(); return; }

      const cityPost = t.closest('[data-city-post]');
      if (cityPost) {
        const id = cityPost.getAttribute('data-city-post');
        const input = $('[data-city-input="' + id + '"]');
        const text = (input.value || '').trim();
        if (!text) { input.focus(); return; }
        const topic = state.topic && state.topic !== 'all' ? state.topic : 'daily';
        addPost(id, topic, text);
        input.value = '';
        toast('已发布到 ' + D.cityById(id).name);
        openDetail(id);
        return;
      }

      const mt = t.closest('[data-toggle-motion]');
      if (mt) {
        store.motion = !store.motion;
        store.save();
        S.setMotion(store.motion);
        syncAllVideos();
        syncHeroVideo();
        syncMotionBtn();
        toast(store.motion ? '画面动效已开启' : '已暂停画面动效（省电模式）');
        return;
      }

      const backdrop = t.closest('.overlay-backdrop');
      if (backdrop) {
        if (backdrop.parentElement.id === 'detail') closeDetail();
        else closeComposer();
        return;
      }
    });

    document.addEventListener('input', function (ev) {
      const t = ev.target;
      if (t.matches('[data-search]')) {
        state.q = t.value;
        clearTimeout(bind._s);
        bind._s = setTimeout(renderGallery, 120);
      }
    });

    document.addEventListener('visibilitychange', function () {
      syncAllVideos();
      syncHeroVideo();
    });

    document.addEventListener('change', function (ev) {
      const t = ev.target;
      if (t.matches('[data-sort]')) { state.sort = t.value; renderGallery(); }
      if (t.matches('[data-province]')) { state.province = t.value; renderGallery(); }
      if (t.matches('[data-qf-spot]')) { state.spot = t.value; renderGallery(); }
      if (t.matches('[data-feed-city]')) {
        state.feedCity = t.value;
        renderPostList($('[data-post-list]'), feedPosts(), {});
      }
      if (t.matches('[data-feed-sort]')) {
        state.feedSort = t.value;
        renderPostList($('[data-post-list]'), feedPosts(), {});
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (!$('#auth').hidden) closeAuth();
        else if (!$('#composer').hidden) closeComposer();
        else if (!$('#detail').hidden) closeDetail();
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        const t = ev.target;
        if (t.matches('[data-quick-input]')) { ev.preventDefault(); submitQuick(); }
        if (t.matches('[data-city-input]')) {
          ev.preventDefault();
          const btn = $('[data-city-post="' + t.getAttribute('data-city-input') + '"]');
          if (btn) btn.click();
        }
        if (t.matches('[data-composer-text]')) {
          ev.preventDefault();
          const f = $('[data-composer-form]');
          if (f) f.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    });

    $('[data-auth-form]').addEventListener('submit', submitAuth);

    $('[data-composer-form]').addEventListener('submit', function (ev) {
      ev.preventDefault();
      const city = $('[data-composer-city]').value;
      const topic = $('[data-composer-topic]').value;
      const text = $('[data-composer-text]').value;
      if (!text.trim()) return;
      addPost(city, topic, text);
      $('[data-composer-text]').value = '';
      closeComposer();
      toast('发布成功，谢谢你的分享');
      if (state.view === 'feed') renderFeed();
      if (!city && state.view === 'gallery') setView('feed');
    });
  }

  function submitQuick() {
    const input = $('[data-quick-input]');
    const text = (input.value || '').trim();
    if (!text) { input.focus(); return; }
    const topic = state.topic && state.topic !== 'all' ? state.topic : 'daily';
    const citySel = $('[data-feed-city]');
    const city = citySel && citySel.value !== 'all' ? citySel.value : '';
    addPost(city, topic, text);
    input.value = '';
    toast('发布成功');
    renderFeed();
  }

  function syncMotionBtn() {
    $$('[data-toggle-motion]').forEach(function (b) {
      b.setAttribute('aria-pressed', store.motion);
      b.classList.toggle('is-off', !store.motion);
      const label = $('[data-motion-label]', b);
      if (label) label.textContent = store.motion ? '画面动效 ON' : '画面动效 OFF';
      const short = $('[data-motion-label-short]', b);
      if (short) short.textContent = store.motion ? '动效 ON' : '动效 OFF';
    });
  }

  function syncStars(cityId) {
    const on = store.savedCities.indexOf(cityId) >= 0;
    $$('[data-star="' + cityId + '"]').forEach(function (b) {
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on);
      if (b.classList.contains('primary-btn')) {
        b.textContent = on ? '★ 已在收藏' : '☆ 收藏这座城市';
      }
    });
  }

  function rerenderPost(postId, post) {
    const hosts = $$('.post-list');
    hosts.forEach(function (host) {
      const existing = $$('.post', host).filter(function (el) {
        const btn = $('[data-like]', el);
        return btn && btn.getAttribute('data-like') === postId;
      });
      existing.forEach(function (el) {
        const isCityView = !!el.closest('.detail-community');
        el.parentNode.replaceChild(postEl(post, { hideCity: isCityView }), el);
      });
    });
  }

  /* ---------------- 整页大背景 / 首屏的城市 ---------------- */

  function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const n = parseInt(full, 16);
    if (isNaN(n)) return [247, 243, 236];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* 把当前时辰的天色按比例混进纸色：整页背景跟着天色偏一点 */
  function paperMix(hex, amount, alpha) {
    const c = hexToRgb(hex);
    const paper = [247, 243, 236];
    const out = c.map(function (v, i) { return Math.round(v * amount + paper[i] * (1 - amount)); });
    return 'rgba(' + out.join(', ') + ', ' + (alpha === undefined ? 0.95 : alpha) + ')';
  }

  function applyPageAmbient(phase) {
    if (!phase || !phase.palette) return;
    const sky = phase.palette.sky || [];
    if (!sky.length) return;
    const top = sky[0][1];
    const bottom = sky[sky.length - 1][1];
    const root = document.documentElement;
    // 上深下浅：整页都带着当前天色；纱要够薄，底下那幅画才看得见，又不能糊掉长文
    root.style.setProperty('--wash-1', paperMix(top, 0.34, 1));
    root.style.setProperty('--wash-2', paperMix(top, 0.24, 1));
    root.style.setProperty('--wash-3', paperMix(bottom, 0.18, 1));
  }

  /* 首屏背景：每天两座城市，从有实拍短片的城市里轮着来 */
  const HERO_SLOT_HOUR = 12;
  let heroTimer = null;

  function heroToday(date) {
    const list = D.CITIES.filter(function (c) { return !!c.video; });
    if (!list.length) return null;
    const d = date || new Date();
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayIndex = Math.round(midnight / 86400000);
    const n = list.length;
    const firstIdx = ((dayIndex * 2) % n + n) % n;
    const first = list[firstIdx];
    const second = list[(firstIdx + 1) % n];
    const tomorrowFirst = list[(((dayIndex + 1) * 2) % n + n) % n];
    const slot = d.getHours() < HERO_SLOT_HOUR ? 0 : 1;
    return {
      slot: slot,
      current: slot === 0 ? first : second,
      next: slot === 0 ? second : tomorrowFirst,
      nextLabel: slot === 0 ? (HERO_SLOT_HOUR + ':00') : '明天 00:00'
    };
  }

  function setText(sel, text) {
    const el = $(sel);
    if (el) el.textContent = text;
  }

  function syncHeroVideo() {
    const video = $('[data-hero-video]');
    if (!video || !video.src) return;
    if (store.motion && !document.hidden) {
      const p = video.play();
      if (p && p.catch) p.catch(function () { /* 自动播放被拦就先用封面顶着 */ });
    } else {
      try { video.pause(); } catch (e) { /* 忽略 */ }
    }
  }

  function mountHeroCity(force) {
    const info = heroToday();
    if (!info) return;
    const video = $('[data-hero-video]');
    if (!video) return;
    const key = info.current.id + '#' + info.slot;
    if (!force && video.__heroKey === key) return;
    video.__heroKey = key;

    const v = info.current.video || {};
    const poster = $('[data-hero-poster]');
    if (v.poster) {
      video.poster = v.poster;
      if (poster) poster.src = v.poster;
    }
    const hero = $('.hero');
    if (hero) hero.style.setProperty('--hero-focus', v.focus || 'center');
    if (poster) poster.style.objectPosition = v.focus || 'center';
    video.src = v.src;
    video.classList.remove('is-ready');
    if (!video.__readyBound) {
      video.__readyBound = true;
      video.addEventListener('canplay', function () { video.classList.add('is-ready'); });
    }
    try { video.load(); } catch (e) { /* 忽略 */ }

    setText('[data-hero-city]', info.current.name);
    setText('[data-hero-slot]', info.slot === 0 ? '1' : '2');
    setText('[data-hero-next]', info.nextLabel + ' 换成 ' + info.next.name);
    setText('[data-hero-open-label]', '看' + info.current.name + '的实拍短片');
    const open = $('[data-hero-open]');
    if (open) open.setAttribute('data-goto', info.current.id);

    setText('[data-next-title]', '下一幅 · ' + info.next.name);
    setText('[data-next-note]', info.nextLabel + ' 换成它');
    const np = $('[data-next-poster]');
    if (np && info.next.video && info.next.video.poster) np.src = info.next.video.poster;
    const nopen = $('[data-next-open]');
    if (nopen) {
      nopen.setAttribute('data-goto', info.next.id);
      nopen.setAttribute('aria-label', '打开' + info.next.name + '的实拍短片');
    }
    syncHeroVideo();
  }

  function startHeroTimer() {
    if (heroTimer) clearInterval(heroTimer);
    // 每 30 秒瞄一眼：跨过 12:00 就换下一座城市
    heroTimer = setInterval(function () { mountHeroCity(false); }, 30000);
  }

  /* ---------------- 城市对比 ---------------- */

  const COMPARE_ROWS = [
    ['旅居指数', function (c) { return String(c.stats.index); }],
    ['月均成本', function (c) { return money(c.stats.cost); }],
    ['实测网速', function (c) { return c.stats.net + ' Mbps'; }],
    ['海拔', function (c) { return c.stats.altitude + ' m'; }],
    ['全年最舒服', function (c) { return bestComfort(c) + ' / 100'; }],
    ['推荐月份', function (c) { return bestMonthText(c); }],
    ['人流', function (c) { return c.stats.crowd; }],
    ['气候', function (c) { return factOf(c, '气候'); }],
    ['适合的人', function (c) { return factOf(c, '适合的人'); }],
    ['要注意', function (c) { return factOf(c, '要注意'); }]
  ];

  function compareTable(cities) {
    const head = '<tr><th></th>' + cities.map(function (c) {
      return '<th><b>' + esc(c.name) + '</b><span>' + esc(c.region) + '</span>' +
        '<button type="button" class="link-btn" data-compare="' + c.id + '">移出对比</button></th>';
    }).join('') + '</tr>';
    const body = COMPARE_ROWS.map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th>' + cities.map(function (c) {
        return '<td>' + esc(r[1](c)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="compare-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function syncCompareButtons() {
    const n = store.compare.length;
    $$('[data-compare]').forEach(function (b) {
      const on = store.compare.indexOf(b.getAttribute('data-compare')) >= 0;
      b.classList.toggle('is-on', on);
      b.textContent = on ? '⇄ 已在对比' : '⇄ 加入对比';
    });
    $$('[data-compare-open]').forEach(function (b) {
      b.hidden = n === 0;
      b.textContent = '看对比（' + n + '）';
    });
  }

  function openCompare() {
    const cities = store.compare.map(function (id) { return D.cityById(id); }).filter(Boolean);
    if (cities.length < 2) { toast('至少选两座城市才能对比'); return; }
    let box = $('#compare');
    if (!box) {
      box = document.createElement('div');
      box.id = 'compare';
      box.className = 'overlay';
      box.hidden = true;
      box.innerHTML =
        '<div class="overlay-backdrop" data-close-compare></div>' +
        '<div class="modal modal-compare" role="dialog" aria-modal="true" aria-label="城市对比">' +
          '<button type="button" class="close-btn" data-close-compare aria-label="关闭">×</button>' +
          '<h2>把这几座城市放在一起看</h2>' +
          '<p class="modal-sub">最多同时对比 3 座，数据口径与城市页一致。</p>' +
          '<div class="compare-scroll" data-compare-body></div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="ghost-btn" data-compare-clear>清空对比</button>' +
            '<button type="button" class="primary-btn" data-close-compare>看完了</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(box);
    }
    $('[data-compare-body]', box).innerHTML = compareTable(cities);
    box.hidden = false;
    document.body.classList.add('no-scroll');
  }

  function closeCompare() {
    const box = $('#compare');
    if (box) box.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  /* 打开某座城市时把它写进地址栏，方便直接把链接发给别人 */
  function shareCity(id) {
    const city = D.cityById(id);
    if (!city) return;
    const base = (location.protocol === 'http:' || location.protocol === 'https:')
      ? location.origin + location.pathname
      : 'index.html';
    const url = base + '?city=' + id;
    const done = function () { toast('链接已复制，发给朋友就能直接打开' + city.name); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { toast(url); });
    } else {
      toast(url);
    }
  }

  function setUrlCity(id) {
    try {
      const url = new URL(location.href);
      if (id) url.searchParams.set('city', id); else url.searchParams.delete('city');
      history.replaceState(null, '', url.toString());
    } catch (e) { /* file:// 下可能不允许改地址，忽略 */ }
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    store.load();
    // 系统开了「减弱动态效果」就别自动播视频了
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      store.motion = false;
    }
    renderCatChips();
    renderProvinceOptions();
    renderMarquee();
    renderAccount();
    renderGallery();
    // 背景随时辰换：一天十二幅手绘画
    if (window.QiyuDay) {
      window.QiyuDay.init();
      // 整页大背景的纸色也跟着时辰走
      applyPageAmbient(window.QiyuDay.current());
      window.QiyuDay.onChange(function (phase) { applyPageAmbient(phase); });
    }
    // 首屏的城市背景：一天两座城市，用画廊里的实拍短片
    mountHeroCity(true);
    startHeroTimer();
    bind();
    renderHeroAvatars();
    updateHeroMode();
    refreshMeAvatars(document);
    S.setMotion(store.motion);
    syncMotionBtn();
    updateBadges();
    syncCompareButtons();

    // 接了后端：先恢复登录态，再把云端数据拉下来合并
    if (window.QiyuSync && window.QiyuSync.on) {
      window.QiyuSync.restore().then(function (s) {
        if (s && s.user) {
          const meta = s.user.user_metadata || {};
          window.QiyuApp.setAccount({
            phone: s.user.email, email: s.user.email, color: '#c8452e',
            name: meta.name || '我', ts: Date.now()
          });
        }
        return window.QiyuSync.pull();
      }).catch(function () { /* 断网或配置有误，就先用本地缓存照常显示 */ });
    }

    // 直接打开某座城市：index.html?city=dali
    try {
      const cityParam = new URLSearchParams(location.search).get('city');
      if (cityParam && D.cityById(cityParam)) openDetail(cityParam);
    } catch (e) { /* 忽略 */ }

    const feedCity = $('[data-feed-city]');
    if (feedCity) {
      feedCity.innerHTML = '<option value="all">全部城市</option>' + D.CITIES.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
      }).join('');
    }
    const savedPostsHost = document.createElement('div');
    savedPostsHost.className = 'post-list';
    savedPostsHost.setAttribute('data-saved-posts', '');
    const savedWrap = document.createElement('div');
    savedWrap.className = 'saved-posts-wrap';
    savedWrap.innerHTML = '<h3>收藏的旅居笔记</h3>';
    savedWrap.appendChild(savedPostsHost);
    const savedWrapHost = $('#view-saved .wrap');
    if (savedWrapHost) savedWrapHost.appendChild(savedWrap);
  }

  /* 给云同步层（sync.js）用的接口：它只通过这里读写数据 */
  window.QiyuApp = {
    store: store,
    ingest: ingestRemote,
    setAccount: function (acct) {
      store.account = acct;
      store.me = { name: acct.name || '我', color: acct.color || '#c8452e' };
      store.save();
      renderAccount();
      refreshAfterAccount();
    },
    openDetail: openDetail,
    toast: toast
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
