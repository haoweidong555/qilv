/* 栖旅 · 接口转发代理（部署到 Deno Deploy）

   为什么需要它：
   Supabase 的数据接口域名 *.supabase.co 在国内会被重置（TLS 握手就断），
   国内用户根本连不上。这个 30 行的代理部署在 Deno Deploy 上（国内可直连
   <项目名>.deno.dev），由它在云端去连 Supabase，再把结果原样转发回来。

   里面没有任何密码：只转发请求，不存数据。真身是上游的 Supabase。

   部署：https://dash.deno.com/new → Playground → 粘贴本文件 → 项目名填 qilv-api → Deploy
   部署完地址形如：https://qilv-api.deno.dev
*/

const UPSTREAM = "https://jxumliwayvvrettmgaiy.supabase.co";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "content-range, content-length, x-client-info",
  "access-control-max-age": "86400",
};

function handle(req: Request): Promise<Response> | Response {
  const url = new URL(req.url);

  // 预检请求直接放行
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // 根路径给个存活检查，方便确认代理是否正常
  if (url.pathname === "/" || url.pathname === "/health") {
    return new Response(
      JSON.stringify({ ok: true, proxy: "qilv-api", upstream: UPSTREAM, time: new Date().toISOString() }),
      { status: 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, CORS) },
    );
  }

  const target = UPSTREAM + url.pathname + url.search;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.set("x-forwarded-host", url.host);

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
  }

  return fetch(target, init).then((res) => {
    const out = new Headers(res.headers);
    for (const k in CORS) out.set(k, CORS[k]);
    out.delete("content-security-policy");
    return new Response(res.body, { status: res.status, headers: out });
  }).catch((err) => {
    return new Response(
      JSON.stringify({ message: "代理连不上上游：" + String(err && err.message || err) }),
      { status: 502, headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, CORS) },
    );
  });
}

// Deno Deploy 的入口：直接起一个 HTTP 服务
Deno.serve(handle);
