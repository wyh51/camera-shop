// ==================== Cloudflare Worker：Supabase 代理 ====================
// 修复：允许 Supabase JS 客户端所需的全部请求头

const SUPABASE_URL = 'https://ixyzmvyfclaxvmritrxa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FbpCE5UvEnCmuFcpRXMj5Q_hsFjm_ys';

// 允许的来源（你的 GitHub Pages 地址）
const ALLOWED_ORIGINS = [
  'https://camera-shop.pages.dev',
  'https://wyh51.github.io',
  'http://localhost',        // 本地调试用
  'http://127.0.0.1',
];

// Supabase JS 客户端会发送的所有请求头
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'apikey',
  'X-Client-Info',
  'Accept',
  'Accept-Profile',          // ✅ 修复：Supabase 必须
  'Content-Profile',
  'Prefer',
  'Range',
  'X-Retry-Count',           // ✅ 修复：Supabase 重试机制必须
  'X-Supabase-Api-Version',
].join(', ');

function getCorsHeaders(origin) {
  // 如果来源在白名单里就允许，否则拒绝（安全起见）
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',  // 预检结果缓存 24 小时
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    // ✅ 处理 OPTIONS 预检请求（CORS preflight）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    // 构建转发到 Supabase 的真实 URL
    const url = new URL(request.url);
    const targetUrl = SUPABASE_URL + url.pathname + url.search;

    // 复制原始请求头，并注入 Supabase 认证
    const newHeaders = new Headers(request.headers);
    newHeaders.set('apikey', SUPABASE_ANON_KEY);
    newHeaders.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    // 删除 Host 头，避免 Supabase 校验失败
    newHeaders.delete('Host');

    // 转发请求到 Supabase
    let supabaseResponse;
    try {
      supabaseResponse = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Worker 转发失败: ' + err.message }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
      });
    }

    // 把 Supabase 的响应返回给前端，附加 CORS 头
    const responseHeaders = new Headers(supabaseResponse.headers);
    const corsHeaders = getCorsHeaders(origin);
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }

    return new Response(supabaseResponse.body, {
      status: supabaseResponse.status,
      statusText: supabaseResponse.statusText,
      headers: responseHeaders,
    });
  },
};

//git add .
//git commit -m "修改说明"
//git push

//D：
//cd D:\pycharm\camera-shop\frontend
