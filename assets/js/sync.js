/* ============================================================
   栖旅 · 云同步层（Supabase）

   思路是「本地优先」：
   - 界面照旧读写浏览器里的 store（秒开、断网也能用）
   - 打开页面时把云端数据拉下来合并进 store
   - 每次发帖 / 回复 / 点赞 / 收藏 / 写笔记，都再往云端推一份

   没配置后端（config.js 里 backend = 'local'）时，这一层整体不生效，
   网站行为与以前完全一致。
   ============================================================ */
(function (global) {
  'use strict';

  const CFG = global.QiyuConfig || {};
  const ON = CFG.backend === 'supabase' && !!CFG.supabaseUrl && !!CFG.supabaseAnonKey;
  const BASE = ON ? String(CFG.supabaseUrl).replace(/\/+$/, '') : '';
  const REST = BASE + '/rest/v1';
  const AUTH = BASE + '/auth/v1';
  const KEY = CFG.supabaseAnonKey || '';
  const SESSION_KEY = 'qiyu.session.v1';

  let session = null;

  function loadSession() {
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
    return session;
  }

  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* 隐私模式下写入失败就算了 */ }
  }

  function headers(extra) {
    const h = Object.assign({
      apikey: KEY,
      'Content-Type': 'application/json'
    }, extra || {});
    if (session && session.access_token) h.Authorization = 'Bearer ' + session.access_token;
    return h;
  }

  function apiError(payload, fallback) {
    if (!payload) return new Error(fallback);
    return new Error(payload.message || payload.error_description || payload.msg || payload.hint || fallback);
  }

  async function rest(path, opts) {
    const res = await fetch(REST + path, Object.assign({ headers: headers() }, opts || {}));
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw apiError(data, '请求失败（HTTP ' + res.status + '）');
    return data;
  }

  async function auth(path, body) {
    const res = await fetch(AUTH + path, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw apiError(data, '登录失败（HTTP ' + res.status + '）');
    return data;
  }

  function store(data) {
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: data.user
    });
    return session;
  }

  /* ---------------- 账号 ---------------- */

  async function signUp(email, password, name, home) {
    const data = await auth('/signup', {
      email: email,
      password: password,
      data: { name: name || '', home: home || '' }
    });
    // 关掉「邮箱确认」时这里会直接返回 token；开着的话需要先去邮箱点确认
    if (data.access_token) store(data);
    return data;
  }

  async function signIn(email, password) {
    const data = await auth('/token?grant_type=password', { email: email, password: password });
    store(data);
    return data;
  }

  async function signOut() {
    try { await auth('/logout', {}); } catch (e) { /* 本地登出即可 */ }
    saveSession(null);
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) return null;
    try {
      const data = await auth('/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      store(data);
      return session;
    } catch (e) {
      saveSession(null);
      return null;
    }
  }

  /* ---------------- 拉取 ---------------- */

  async function pull() {
    const app = global.QiyuApp;
    if (!ON || !app) return null;
    const me = session && session.user ? session.user.id : null;

    if (!me) {
      // 游客能看到两类东西：
      //   1. 编辑部的官方手册——这是网站自己的内容，对所有人开放；
      //   2. 最近 3 条用户笔记——用户投稿仍然要注册才能看更多。
      const [official, guestRows] = await Promise.all([
        rest('/rpc/official_posts', { method: 'POST', body: '{}' }).catch(function () { return []; }),
        rest('/rpc/guest_posts', {
          method: 'POST',
          body: JSON.stringify({ max_rows: 3 })
        })
      ]);
      return app.ingest({
        guest: true,
        posts: (official || []).concat(guestRows || []),
        replies: [],
        liked: []
      });
    }

    const [posts, replies, likes, saved, notes, prefs] = await Promise.all([
      rest('/posts_feed?select=*&order=created_at.desc&limit=200'),
      rest('/replies?select=id,post,body,created_at,author,profiles(name,color,home,official)&order=created_at.asc&limit=500'),
      rest('/likes?select=post&user_id=eq.' + me),
      rest('/saved_cities?select=city'),
      rest('/notes?select=city,body'),
      rest('/prefs?select=weights')
    ]);

    return app.ingest({
      me: me,
      posts: posts || [],
      replies: replies || [],
      liked: (likes || []).map(function (r) { return r.post; }),
      saved: (saved || []).map(function (r) { return r.city; }),
      notes: notes || [],
      prefs: (prefs && prefs[0] && prefs[0].weights) || null
    });
  }

  /* ---------------- 推送 ---------------- */

  async function createPost(fields) {
    const me = session && session.user ? session.user.id : null;
    if (!me) throw new Error('还没登录');
    const rows = await rest('/posts?select=*', {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify([{
        author: me,
        city: fields.city || null,
        topic: fields.topic || 'daily',
        body: fields.body
      }])
    });
    return rows && rows[0];
  }

  async function createReply(postRemoteId, body) {
    const me = session && session.user ? session.user.id : null;
    if (!me) throw new Error('还没登录');
    const rows = await rest('/replies?select=*', {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify([{ post: postRemoteId, author: me, body: body }])
    });
    return rows && rows[0];
  }

  async function like(postRemoteId) {
    const me = session && session.user ? session.user.id : null;
    if (!me) throw new Error('还没登录');
    await rest('/likes?on_conflict=post,user_id', {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ post: postRemoteId, user_id: me }])
    });
  }

  async function unlike(postRemoteId) {
    const me = session && session.user ? session.user.id : null;
    if (!me) throw new Error('还没登录');
    await rest('/likes?post=eq.' + postRemoteId + '&user_id=eq.' + me, { method: 'DELETE' });
  }

  async function saveCity(cityId, on) {
    const me = session && session.user ? session.user.id : null;
    if (!me) throw new Error('还没登录');
    if (on) {
      await rest('/saved_cities?on_conflict=user_id,city', {
        method: 'POST',
        headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify([{ user_id: me, city: cityId }])
      });
    } else {
      await rest('/saved_cities?user_id=eq.' + me + '&city=eq.' + encodeURIComponent(cityId), { method: 'DELETE' });
    }
  }

  async function saveNote(cityId, body) {
    const me = session && session.user ? session.user.id : null;
    if (!me) throw new Error('还没登录');
    await rest('/notes?on_conflict=user_id,city', {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ user_id: me, city: cityId, body: body, updated_at: new Date().toISOString() }])
    });
  }

  async function savePrefs(weights) {
    const me = session && session.user ? session.user.id : null;
    if (!me) throw new Error('还没登录');
    await rest('/prefs?on_conflict=user_id', {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ user_id: me, weights: weights, updated_at: new Date().toISOString() }])
    });
  }

  async function restore() {
    if (!ON) return null;
    loadSession();
    if (session && session.expires_at && session.expires_at < Date.now() - 60000) {
      await refreshSession();
    }
    return session;
  }

  global.QiyuSync = {
    on: ON,
    restore: restore,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    pull: pull,
    createPost: createPost,
    createReply: createReply,
    like: like,
    unlike: unlike,
    saveCity: saveCity,
    saveNote: saveNote,
    savePrefs: savePrefs,
    user: function () { return (session && session.user) || null; },
    session: function () { return session; }
  };
})(window);
