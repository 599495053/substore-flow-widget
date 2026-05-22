// ============================================
// Sub-Store 套餐流量小组件 for Egern v3
// ============================================
// Env 配置：
//   SUB_NAMES=机场A,机场B       订阅名，逗号分隔；留空自动识别全部
//   SUB_STORE_BASE_URL=         Sub-Store 地址，默认 http://sub.store
//   RESET_DAY=1                 每月流量重置日（如每月1号填 1）
//   HIDE_ERRORS=true            隐藏本地节点等无法获取流量的订阅
//   SUB_URLS=                   手动填入订阅直链，逗号分隔（格式：名称=URL）

const DEF_BASE = 'http://sub.store';

export default async function (ctx) {
  const cfg = parseConfig(ctx);
  const cache = readCache(ctx);

  try {
    const items = await fetchAll(ctx, cfg);
    const visible = cfg.hideErrors ? items.filter((i) => !i.error) : items;
    const shown = visible.length ? visible : items;
    if (!shown.length) {
      if (cache && cache.items && cache.items.length) return render(cfg, cache, true, '无订阅数据');
      return errorView(cfg, '未找到订阅', '请配置 SUB_NAMES 或 SUB_URLS');
    }
    const payload = { at: Date.now(), items: shown.slice(0, cfg.maxItems) };
    writeCache(ctx, payload);
    return render(cfg, payload, false);
  } catch (e) {
    if (cache && cache.items && cache.items.length) return render(cfg, cache, true, shortMsg(e));
    return errorView(cfg, '请求失败', shortMsg(e));
  }
}

// ============================================
// 数据获取
// ============================================

async function fetchAll(ctx, cfg) {
  const subs = await fetchSubs(ctx, cfg);
  const picked = pickSubs(subs, cfg);
  return Promise.all(picked.map((s) => fetchOne(ctx, cfg, s)));
}

// 获取订阅列表
async function fetchSubs(ctx, cfg) {
  // 优先用 SUB_URLS 手动指定
  if (cfg.urls.length) return cfg.urls;
  try {
    const json = await apiGet(ctx, cfg.baseUrl + '/api/subs');
    const data = json && json.data !== undefined ? json.data : json;
    const arr = Array.isArray(data) ? data : (data && typeof data === 'object' ? Object.values(data) : []);
    return arr.filter((x) => x && x.name);
  } catch (e) {
    throw new Error('无法连接 Sub-Store (' + cfg.baseUrl + ')');
  }
}

function pickSubs(subs, cfg) {
  if (!cfg.names.length) return subs.filter((s) => s && s.name);
  return cfg.names.map((n) => {
    const found = subs.find((s) => s && s.name === n);
    return found || { name: n, missing: true };
  });
}

// 获取单个订阅的流量
async function fetchOne(ctx, cfg, sub) {
  const name = sub.name || '未知';
  if (sub.missing) return { name, error: '未找到' };

  // 有手动 URL → 直接读 header
  if (sub.url && /^https?:\/\//i.test(sub.url.trim())) {
    const flow = await fetchFromUrl(ctx, sub.url.trim());
    if (flow) return buildItem(sub, flow);
  }

  // Sub-Store API
  const flow = await fetchFromApi(ctx, cfg.baseUrl, name);
  if (flow) return buildItem(sub, flow);

  // 存储缓存
  const stored = readFlow(ctx, name);
  if (stored) return buildItem(sub, stored);

  return { name, error: '获取失败' };
}

// 从订阅 URL 直接读取 subscription-userinfo header
async function fetchFromUrl(ctx, url) {
  try {
    const resp = await apiGet(ctx, url, { accept: '*/*' });
    const info = resp._hdr('subscription-userinfo');
    if (info) return parseInfoHeader(info);
  } catch (_) {}
  return null;
}

// 从 Sub-Store API 获取流量
async function fetchFromApi(ctx, base, name) {
  try {
    const json = await apiGet(ctx, base + '/api/sub/flow/' + encodeURIComponent(name));
    // 尝试多层 data 剥离
    const candidates = [json];
    if (json && json.data !== undefined) candidates.push(json.data);
    if (json && json.data && json.data.data !== undefined) candidates.push(json.data.data);
    for (const raw of candidates) {
      const flow = parseFlowObj(raw);
      if (flow && flow.total > 0) return flow;
    }
  } catch (_) {}
  return null;
}

// ============================================
// 渲染
// ============================================

function render(cfg, payload, stale, staleMsg) {
  const fam = cfg.family;
  const items = payload.items || [];

  if (fam === 'accessoryInline') return rInline(items[0], stale);
  if (fam === 'accessoryCircular') return rCircular(items[0], stale, cfg);
  if (fam === 'accessoryRectangular') return rRect(items[0], stale, cfg);

  const max = fam === 'systemSmall' ? 1 : fam === 'systemLarge' || fam === 'systemExtraLarge' ? 6 : 2;
  const shown = items.slice(0, max);

  if (fam === 'systemSmall') return rSmall(cfg, shown, payload, stale, staleMsg);
  return rMedium(cfg, shown, payload, stale, staleMsg);
}

// ---- 小号 ----
function rSmall(cfg, items, payload, stale, staleMsg) {
  const it = items[0];
  if (!it || it.error) return errorView(cfg, it ? it.name : '订阅', it ? it.error : '无数据');

  return root(cfg, stale, [
    hdr(cfg, stale),
    col({
      gap: 5, padding: [10, 12],
      bg: '#FFFFFF12', radius: 12,
      children: [
        t(it.name, 'subheadline', 'bold', '#FFF'),
        t(fmt(it.remain) + ' / ' + fmt(it.total), 'title3', 'bold', pctC(it.pct)),
        bar(it.ratio, it.pct),
        t(expLabel(it), 'caption1', 'regular', '#CBD5E1'),
      ],
    }),
    foot(cfg, payload, stale, staleMsg),
  ]);
}

// ---- 中号 / 大号 ----
function rMedium(cfg, items, payload, stale, staleMsg) {
  const kids = [hdr(cfg, stale)];

  // 合计行
  if (items.length > 1) {
    const ok = items.filter((i) => !i.error);
    if (ok.length) {
      const r = ok.reduce((s, i) => s + i.remain, 0);
      const tot = ok.reduce((s, i) => s + i.total, 0);
      const p = tot > 0 ? Math.round((r / tot) * 100) : 0;
      kids.push(row({
        gap: 8, padding: [7, 10],
        bg: '#0EA5E918', radius: 10,
        children: [
          img('sf-symbol:sum', '#BAE6FD', 14),
          t('合计', 'caption1', 'semibold', '#E0F2FE'),
          sp(),
          t(fmt(r) + ' / ' + fmt(tot) + '  ' + p + '%', 'caption1', 'bold', pctC(p)),
        ],
      }));
    }
  }

  items.forEach((it, i) => {
    if (i > 0) kids.push({ type: 'stack', width: '100%', height: 1, backgroundColor: '#FFFFFF10' });
    kids.push(subRow(it));
  });
  kids.push(foot(cfg, payload, stale, staleMsg));

  return root(cfg, stale, kids);
}

function subRow(it) {
  if (it.error) {
    return col({
      gap: 2, padding: [7, 4],
      children: [
        t(it.name, 'subheadline', 'semibold', '#FFF'),
        t(it.error, 'caption2', 'regular', '#FCA5A5'),
      ],
    });
  }
  return col({
    gap: 4, padding: [7, 4],
    children: [
      row({ children: [t(it.name, 'subheadline', 'semibold', '#FFF', 1), sp(), t(it.pct + '%', 'headline', 'bold', pctC(it.pct))] }),
      bar(it.ratio, it.pct),
      row({ children: [t('已用 ' + fmt(it.used) + ' / ' + fmt(it.total), 'caption2', 'regular', '#94A3B8'), sp(), t(expLabel(it), 'caption2', 'regular', '#CBD5E1')] }),
    ],
  });
}

// ---- 锁屏 ----
function rInline(it, stale) {
  if (!it || it.error) return t('Sub-Store', 'caption1', 'semibold', '#94A3B8');
  return t(it.name + ' ' + it.pct + '%', 'caption1', 'semibold', stale ? '#FDE68A' : '#FFF');
}

function rCircular(it, stale, cfg) {
  const p = it && !it.error ? it.pct + '%' : '--';
  return w(cfg, { padding: 4, gap: 2, bg: 'rgba(0,0,0,0)', children: [
    img('sf-symbol:chart.pie.fill', stale ? '#F59E0B' : (it ? pctC(it.pct) : '#94A3B8'), 18),
    t(p, 'headline', 'bold', '#FFF', 1, 'center'),
  ] });
}

function rRect(it, stale, cfg) {
  if (!it || it.error) return errorView(cfg, it ? it.name : '订阅', it ? it.error : '无数据');
  return w(cfg, { padding: 8, gap: 3, children: [
    t(it.name, 'caption1', 'semibold', '#FFF'),
    t(fmt(it.remain) + ' / ' + fmt(it.total), 'headline', 'bold', pctC(it.pct)),
    t(expLabel(it), 'caption2', 'regular', '#CBD5E1'),
  ] }, stale);
}

// ---- UI 基础 ----

function root(cfg, stale, children) {
  return w(cfg, { padding: 14, gap: 8, children }, stale);
}

function w(cfg, o, stale) {
  const out = {
    type: 'widget', url: cfg.openUrl,
    refreshAfter: new Date(Date.now() + cfg.refreshMin * 60000).toISOString(),
    padding: o.padding || 14, gap: o.gap || 8,
    children: o.children || [],
  };
  if (o.bg) out.backgroundColor = o.bg;
  else out.backgroundGradient = grad(stale);
  return out;
}

function hdr(cfg, stale) {
  return row({
    gap: 6,
    children: [
      img(stale ? 'sf-symbol:exclamationmark.triangle.fill' : 'sf-symbol:chart.bar.xaxis', stale ? '#F59E0B' : '#60A5FA', 16),
      t(stale ? '套餐 · 缓存' : 'Sub-Store 套餐', 'caption1', 'semibold', '#E5E7EB'),
      sp(),
      t(clock(), 'caption2', 'regular', '#94A3B8'),
    ],
  });
}

function bar(ratio, pct) {
  if (!isNum(ratio)) return row({ gap: 6, children: [img('sf-symbol:infinity', '#34D399', 12), t('无限', 'caption2', 'semibold', '#34D399')] });
  const w = 120, f = Math.max(2, Math.round(w * Math.min(1, Math.max(0, ratio))));
  return row({
    gap: 7,
    children: [
      { type: 'stack', direction: 'row', width: w, height: 6, backgroundColor: '#FFFFFF18', borderRadius: 3,
        children: [{ type: 'stack', width: f, height: 6, backgroundColor: pctC(pct), borderRadius: 3 }, sp()] },
      t(pct + '%', 'caption2', 'semibold', '#CBD5E1'),
    ],
  });
}

function foot(cfg, payload, stale, staleMsg) {
  return t(stale ? '缓存 · ' + (staleMsg || '请求失败') : cfg.baseUrl, 'caption2', 'regular', stale ? '#FDE68A' : '#64748B');
}

function errorView(cfg, title, msg) {
  return {
    type: 'widget', url: cfg.openUrl,
    refreshAfter: new Date(Date.now() + cfg.refreshMin * 60000).toISOString(),
    padding: 14, gap: 8,
    backgroundGradient: { type: 'linear', colors: ['#3f1d1d', '#1f2937'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    children: [
      row({ gap: 6, children: [img('sf-symbol:exclamationmark.triangle.fill', '#FCA5A5', 16), t(title, 'headline', 'bold', '#FFF')] }),
      t(msg, 'caption1', 'regular', '#FCA5A5', 5),
    ],
  };
}

// ============================================
// 显示逻辑
// ============================================

function expLabel(it) {
  if (it.longTerm) return '长期有效';
  if (it.expDate && !isNaN(it.expDate.getTime())) {
    const d = Math.ceil((it.expDate.getTime() - Date.now()) / 86400000);
    if (d <= 0) return '已到期';
    return md(it.expDate) + ' · ' + d + '天后到期';
  }
  return '到期未知';
}

function pctC(p) { return p <= 10 ? '#F87171' : p <= 25 ? '#FBBF24' : '#34D399'; }
function grad(stale) {
  return { type: 'linear', colors: stale ? ['#2b1b0f', '#1f2937'] : ['#0f172a', '#111827', '#1e293b'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } };
}

// ============================================
// 流量解析
// ============================================

function parseFlowObj(d) {
  if (!d || typeof d !== 'object') return null;
  const u = (d.usage && typeof d.usage === 'object') ? d.usage : {};
  const total = num(d.total);
  if (!(total > 0)) return null;
  return {
    total,
    upload: num(u.upload ?? d.upload),
    download: num(u.download ?? d.download),
    expires: num(d.expires ?? d.expire),
    remainingDays: num(d.remainingDays ?? d.reset_day),
    planName: String(d.planName || d.plan_name || ''),
  };
}

function parseInfoHeader(s) {
  const str = String(s || '');
  const val = (k) => { const m = str.match(new RegExp(k + '=([-+]?[0-9]*\\.?[0-9]+)')); return m ? Number(m[1]) : NaN; };
  const total = num(val('total'));
  if (!(total > 0)) return null;
  return {
    total,
    upload: num(val('upload')),
    download: num(val('download')),
    expires: num(val('expire')),
    remainingDays: 0,
    planName: '',
  };
}

function buildItem(sub, flow) {
  const used = (flow.upload || 0) + (flow.download || 0);
  const remain = Math.max(0, flow.total - used);
  const ratio = Math.min(1, used / flow.total);
  const pct = Math.round((1 - ratio) * 100);
  const exp = num(flow.expires);
  const longTerm = !exp || exp <= 0;

  return {
    name: sub.name || '订阅',
    planName: flow.planName || '',
    total: flow.total, used, remain, ratio, pct,
    longTerm,
    expDate: longTerm ? null : new Date(exp * 1000),
  };
}

// ============================================
// 配置
// ============================================

function parseConfig(ctx) {
  const env = (ctx && ctx.env) || {};
  const fam = (ctx && ctx.widgetFamily) || 'systemMedium';
  const maxMap = { accessoryInline: 1, accessoryCircular: 1, accessoryRectangular: 1, systemSmall: 1, systemMedium: 2, systemLarge: 6, systemExtraLarge: 8 };

  // SUB_URLS: "名称1=https://url1,名称2=https://url2"
  const urls = split(env.SUB_URLS || '').map((s) => {
    const eq = s.indexOf('=');
    if (eq < 0) return null;
    return { name: s.slice(0, eq).trim(), url: s.slice(eq + 1).trim() };
  }).filter(Boolean);

  return {
    family: fam,
    names: split(env.SUB_NAMES || env.SUB_NAME || ''),
    baseUrl: trimSlash(env.SUB_STORE_BASE_URL || DEF_BASE),
    maxItems: clamp(env.MAX_ITEMS, maxMap[fam] || 2, 1, 12),
    refreshMin: clamp(env.REFRESH_MINUTES, 30, 5, 1440),
    hideErrors: toBool(env.HIDE_ERRORS, false),
    resetDay: env.RESET_DAY || '',
    openUrl: env.OPEN_URL || 'https://sub-store.vercel.app',
    urls,
  };
}

// ============================================
// HTTP
// ============================================

async function apiGet(ctx, url, extraHeaders) {
  const resp = await ctx.http.get(url, {
    headers: Object.assign({ Accept: 'application/json', 'User-Agent': 'Egern-SubStore-Widget/3.0' }, extraHeaders || {}),
    timeout: 8000, redirect: 'follow',
  });
  const status = resp.status;
  const text = await resp.text();
  // 保存 headers 引用供后续读取 subscription-userinfo
  const _hdr = (name) => {
    try { if (resp.headers && typeof resp.headers.get === 'function') return resp.headers.get(name) || ''; } catch (_) {}
    try {
      const low = name.toLowerCase();
      for (const k of Object.keys(resp.headers || {})) {
        if (k.toLowerCase() === low) { const v = resp.headers[k]; return Array.isArray(v) ? v.join(', ') : String(v || ''); }
      }
    } catch (_) {}
    return '';
  };
  if (status < 200 || status >= 300) throw new Error('HTTP ' + status);
  try { const j = JSON.parse(text); j._hdr = _hdr; return j; } catch (_) { throw new Error('非 JSON 响应'); }
}

// ============================================
// 存储
// ============================================

function readFlow(ctx, name) {
  const st = ctx && ctx.storage; if (!st) return null;
  for (const k of ['flow:' + name, 'flow_' + name]) {
    for (const fn of ['getJSON', 'get']) {
      try {
        if (typeof st[fn] !== 'function') continue;
        const v = fn === 'get' ? tryP(st[fn](k)) : st[fn](k);
        const f = parseFlowObj(v);
        if (f && f.total > 0) return f;
      } catch (_) {}
    }
  }
  return null;
}

function readCache(ctx) { try { const s = ctx && ctx.storage; return s && s.getJSON ? s.getJSON('ssf-cache') : null; } catch (_) { return null; } }
function writeCache(ctx, p) { try { const s = ctx && ctx.storage; if (s && s.setJSON) s.setJSON('ssf-cache', p); } catch (_) {} }
function tryP(s) { if (!s || typeof s !== 'string') return s; try { return JSON.parse(s); } catch (_) { return s; } }

// ============================================
// 工具函数
// ============================================

function t(v, sz, wt, cl, ml, al) {
  const n = { type: 'text', text: v == null ? '' : String(v), font: { size: sz || 'body', weight: wt || 'regular' }, textColor: cl || '#FFF', maxLines: ml || 1, minScale: 0.6 };
  if (al) n.textAlign = al;
  return n;
}
function img(s, c, z) { return { type: 'image', src: s, color: c, width: z || 16, height: z || 16 }; }
function sp() { return { type: 'spacer' }; }
function col(o) { return Object.assign({ type: 'stack', direction: 'column', width: '100%' }, o); }
function row(o) { return Object.assign({ type: 'stack', direction: 'row', alignItems: 'center' }, o); }

function fmt(b) {
  if (!isNum(b) || b < 0) return '--';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(b >= 100 ? 0 : b >= 10 ? 1 : 2) + ' ' + u[i];
}

function num(v) { const n = Number(v); return isNum(n) ? n : 0; }
function isNum(n) { return typeof n === 'number' && isFinite(n); }
function toBool(v, d) { if (v == null || v === '') return !!d; return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase()); }
function clamp(v, d, mn, mx) { const n = parseInt(v, 10); return Math.min(mx, Math.max(mn, isNum(n) ? n : d)); }
function trimSlash(s) { return String(s || '').trim().replace(/\/+$/, ''); }
function split(s) { return String(s || '').trim().split(/[\n,|]+/).map((x) => x.trim()).filter(Boolean); }
function clock() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function md(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); }
function shortMsg(e) {
  const m = e && e.message ? e.message : String(e || '');
  if (/HTTP 401|HTTP 403/.test(m)) return '接口拒绝访问';
  if (/HTTP 404/.test(m)) return '接口不存在(404)';
  if (/timeout/i.test(m)) return '请求超时';
  if (/JSON|非 JSON/.test(m)) return '返回非JSON，请检查地址';
  if (/连接/.test(m)) return m;
  return m.slice(0, 60);
}
