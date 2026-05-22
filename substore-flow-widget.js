// ============================================
// Sub-Store 套餐流量小组件 for Egern
// ============================================
// Env 配置：
//   SUB_NAMES=机场A,机场B       订阅名，逗号分隔；留空自动识别
//   SUB_STORE_BASE_URL=         后端地址，默认 http://sub.store
//   RESET_DAY=1                 每月重置日
//   HIDE_ERRORS=true            隐藏本地节点等无法获取流量的订阅
//   REFRESH_MINUTES=30          刷新间隔
//   MAX_ITEMS=                  最大显示数，按尺寸自动
//   OPEN_URL=                   点击跳转地址

export default async function (ctx) {
  const cfg = parseConfig(ctx);
  const cache = readCache(ctx);

  try {
    const subs = await fetchSubs(ctx, cfg);
    const filtered = pickSubs(subs, cfg);
    if (!filtered.length) {
      return errorView(cfg, '未找到订阅', '本地无订阅数据，请确认 Sub-Store 已启用或填写 SUB_NAMES');
    }

    const items = await Promise.all(
      filtered.slice(0, cfg.maxItems).map((s) => fetchFlow(ctx, cfg, s))
    );

    const visible = cfg.hideErrors ? items.filter((i) => !i.error) : items;
    if (!visible.length) {
      // 所有订阅都失败时，显示每个订阅的错误
      if (cache && cache.items && cache.items.length) return render(cfg, cache, true, '部分订阅获取失败');
      return errorView(cfg, '流量获取失败', items.map((i) => i.name + ': ' + i.error).join('\n').slice(0, 120));
    }

    const payload = { at: Date.now(), items: visible };
    writeCache(ctx, payload);
    return render(cfg, payload, false);
  } catch (e) {
    if (cache && cache.items && cache.items.length) {
      return render(cfg, cache, true, shortMsg(e));
    }
    return errorView(cfg, '连接失败', shortMsg(e));
  }
}

// ============================================
// 配置
// ============================================

function parseConfig(ctx) {
  const env = (ctx && ctx.env) || {};
  const fam = (ctx && ctx.widgetFamily) || 'systemMedium';
  const maxMap = { accessoryInline: 1, accessoryCircular: 1, accessoryRectangular: 1, systemSmall: 1, systemMedium: 2, systemLarge: 6, systemExtraLarge: 8 };
  return {
    family: fam,
    names: splitList(env.SUB_NAMES || env.SUB_NAME || ''),
    baseUrl: trimSlash(env.SUB_STORE_BASE_URL || 'http://sub.store'),
    maxItems: intClamp(env.MAX_ITEMS, maxMap[fam] || 2, 1, 12),
    refreshMin: intClamp(env.REFRESH_MINUTES, 30, 5, 1440),
    hideErrors: toBool(env.HIDE_ERRORS, false),
    resetDay: env.RESET_DAY || '',
    openUrl: env.OPEN_URL || 'https://sub-store.vercel.app',
  };
}

// ============================================
// 数据获取
// ============================================

async function fetchSubs(ctx, cfg) {
  const stored = readStoredSubs(ctx);
  if (stored.length) return stored;
  try {
    const json = await httpGet(ctx, cfg.baseUrl + '/api/subs');
    const data = json && json.data !== undefined ? json.data : json;
    if (Array.isArray(data)) return data.filter(Boolean);
    if (data && typeof data === 'object') return Object.values(data).filter(Boolean);
  } catch (e) {
    throw new Error('无法连接 ' + cfg.baseUrl + '，请确认 Sub-Store 已启用');
  }
  throw new Error('订阅列表为空或格式异常');
}

function pickSubs(subs, cfg) {
  const list = Array.isArray(subs) ? subs : [];
  if (!cfg.names.length) return list.filter((s) => s && s.name);
  return cfg.names.map((n) => {
    const found = list.find((s) => s && s.name === n);
    return found || { name: n, missing: true };
  });
}

async function fetchFlow(ctx, cfg, sub) {
  const name = sub.name || '未知';
  if (sub.missing) return { name, error: '订阅不存在' };

  // 本地存储缓存的流量
  const stored = readStoredFlow(ctx, name);
  if (stored && stored.total > 0) return buildItem(sub, stored);

  // API 获取
  try {
    const json = await httpGet(ctx, cfg.baseUrl + '/api/sub/flow/' + encodeURIComponent(name));
    const raw = json && json.data !== undefined ? json.data : json;
    const flow = parseFlow(raw);
    if (flow.total > 0) return buildItem(sub, flow);
  } catch (_) {}

  // 直连订阅 URL
  try {
    const url = sub.url || sub.subUserinfo || '';
    const httpUrl = url.split('\n').map((s) => s.trim()).find((s) => /^https?:\/\//i.test(s));
    if (httpUrl) {
      const resp = await httpHead(ctx, httpUrl);
      const info = getHeader(resp.headers, 'subscription-userinfo');
      if (info) {
        const flow = parseFlowString(info);
        if (flow.total > 0) return buildItem(sub, flow);
      }
    }
  } catch (_) {}

  return { name, error: '无法获取流量' };
}

function buildItem(sub, flow) {
  const total = toNum(flow.total);
  const upload = toNum(flow.upload) || 0;
  const download = toNum(flow.download) || 0;
  const used = upload + download;
  const remain = total > 0 ? Math.max(0, total - used) : 0;
  const ratio = total > 0 ? Math.min(1, used / total) : 0;
  const remainPct = total > 0 ? Math.round((1 - ratio) * 100) : 100;
  const expires = toNum(flow.expires);
  const longTerm = !expires || expires <= 0;
  const expireDate = !longTerm ? new Date(expires * 1000) : null;
  const remainingDays = toNum(flow.remainingDays);

  return {
    name: sub.name || '订阅',
    planName: flow.planName || '',
    total, used, remain, ratio, remainPct,
    longTerm,
    expireDate,
    remainingDays,
    resetAt: calcReset(sub.url || '', remainingDays, sub.name, {}),
  };
}

// ============================================
// 渲染
// ============================================

function render(cfg, payload, stale, staleMsg) {
  const fam = cfg.family;
  const items = payload.items || [];

  if (fam === 'accessoryInline') return renderInline(items[0], stale);
  if (fam === 'accessoryCircular') return renderCircular(items[0], stale, cfg);
  if (fam === 'accessoryRectangular') return renderRect(items[0], stale, cfg);

  const max = fam === 'systemSmall' ? 1 : fam === 'systemLarge' || fam === 'systemExtraLarge' ? 6 : 2;
  const shown = items.slice(0, max);

  if (fam === 'systemSmall') return renderSmall(cfg, shown, payload, stale, staleMsg);
  return renderMediumLarge(cfg, shown, payload, stale, staleMsg);
}

// ---- 小号组件 ----

function renderSmall(cfg, items, payload, stale, staleMsg) {
  const item = items[0];
  if (!item || item.error) return errorView(cfg, item ? item.name : '订阅', item ? item.error : '无数据');

  const cardChildren = [];

  // 名称
  cardChildren.push(txt(displayName(item), 'subheadline', 'semibold', '#FFF'));

  // 流量数字
  cardChildren.push(txt(formatBytes(item.remain) + ' / ' + formatBytes(item.total), 'title3', 'bold', pctColor(item.remainPct)));

  // 进度条 + 百分比
  cardChildren.push(barRow(item.ratio, item.remainPct));

  // 到期信息
  cardChildren.push(txt(expireLabel(item), 'caption1', 'regular', '#CBD5E1'));

  return widgetRoot(cfg, stale, [
    headerRow(cfg, stale),
    {
      type: 'stack', direction: 'column', width: '100%',
      gap: 5, padding: [10, 12],
      backgroundColor: '#FFFFFF12', borderRadius: 12,
      children: cardChildren,
    },
    footerLine(cfg, payload, stale, staleMsg),
  ]);
}

// ---- 中号/大号组件 ----

function renderMediumLarge(cfg, items, payload, stale, staleMsg) {
  const children = [headerRow(cfg, stale)];

  // 多个订阅时显示合计
  if (items.length > 1) {
    const validItems = items.filter((i) => !i.error && i.total > 0);
    if (validItems.length) {
      const tRemain = validItems.reduce((s, i) => s + i.remain, 0);
      const tTotal = validItems.reduce((s, i) => s + i.total, 0);
      const tPct = tTotal > 0 ? Math.round((tRemain / tTotal) * 100) : 0;
      children.push({
        type: 'stack', direction: 'row', alignItems: 'center',
        gap: 8, padding: [7, 10],
        backgroundColor: '#0EA5E918', borderRadius: 10,
        children: [
          icon('sf-symbol:sum', '#BAE6FD', 14),
          txt('合计', 'caption1', 'semibold', '#E0F2FE'),
          { type: 'spacer' },
          txt(formatBytes(tRemain) + ' / ' + formatBytes(tTotal) + '  ' + tPct + '%', 'caption1', 'bold', pctColor(tPct)),
        ],
      });
    }
  }

  // 每个订阅一行
  items.forEach((item, idx) => {
    if (idx > 0) {
      children.push({ type: 'stack', width: '100%', height: 1, backgroundColor: '#FFFFFF10' });
    }
    children.push(subRow(item));
  });

  children.push(footerLine(cfg, payload, stale, staleMsg));

  return widgetRoot(cfg, stale, children);
}

function subRow(item) {
  if (item.error) {
    return {
      type: 'stack', direction: 'column', width: '100%',
      gap: 2, padding: [7, 4],
      children: [
        txt(item.name, 'subheadline', 'semibold', '#FFFFFF'),
        txt(item.error, 'caption2', 'regular', '#FCA5A5'),
      ],
    };
  }

  return {
    type: 'stack', direction: 'column', width: '100%',
    gap: 4, padding: [7, 4],
    children: [
      // 第一行：名称 + 剩余百分比
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          txt(displayName(item), 'subheadline', 'semibold', '#FFFFFF', 1),
          { type: 'spacer' },
          txt(item.remainPct + '%', 'headline', 'bold', pctColor(item.remainPct)),
        ],
      },
      // 第二行：进度条
      barRow(item.ratio, item.remainPct),
      // 第三行：已用/总量 + 到期
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          txt('已用 ' + formatBytes(item.used) + ' / ' + formatBytes(item.total), 'caption2', 'regular', '#94A3B8'),
          { type: 'spacer' },
          txt(expireLabel(item), 'caption2', 'regular', '#CBD5E1'),
        ],
      },
    ],
  };
}

// ---- 锁屏组件 ----

function renderInline(item, stale) {
  if (!item || item.error) return txt('Sub-Store', 'caption1', 'semibold', '#94A3B8');
  return txt(displayName(item) + ' ' + item.remainPct + '%', 'caption1', 'semibold', stale ? '#FDE68A' : '#FFF');
}

function renderCircular(item, stale, cfg) {
  const pct = item && !item.error ? item.remainPct + '%' : '--';
  return {
    type: 'widget', url: cfg.openUrl,
    refreshAfter: refreshISO(cfg.refreshMin),
    padding: 4, gap: 2,
    backgroundColor: 'rgba(0,0,0,0)',
    children: [
      icon('sf-symbol:chart.pie.fill', stale ? '#F59E0B' : (item ? pctColor(item.remainPct) : '#94A3B8'), 18),
      txt(pct, 'headline', 'bold', '#FFF', 1, 'center'),
    ],
  };
}

function renderRect(item, stale, cfg) {
  if (!item || item.error) return errorView(cfg, item ? item.name : '订阅', item ? item.error : '无数据');
  return {
    type: 'widget', url: cfg.openUrl,
    refreshAfter: refreshISO(cfg.refreshMin),
    padding: 8, gap: 3,
    backgroundGradient: grad(stale),
    children: [
      txt(displayName(item), 'caption1', 'semibold', '#FFF'),
      txt(formatBytes(item.remain) + ' / ' + formatBytes(item.total), 'headline', 'bold', pctColor(item.remainPct)),
      txt(expireLabel(item), 'caption2', 'regular', '#CBD5E1'),
    ],
  };
}

// ============================================
// 通用 UI 组件
// ============================================

function widgetRoot(cfg, stale, children) {
  return {
    type: 'widget',
    url: cfg.openUrl,
    refreshAfter: refreshISO(cfg.refreshMin),
    padding: 14, gap: 8,
    backgroundGradient: grad(stale),
    children,
  };
}

function headerRow(cfg, stale) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center',
    gap: 6,
    children: [
      icon(stale ? 'sf-symbol:exclamationmark.triangle.fill' : 'sf-symbol:chart.bar.xaxis', stale ? '#F59E0B' : '#60A5FA', 16),
      txt(stale ? 'Sub-Store 套餐 · 缓存' : 'Sub-Store 套餐', 'caption1', 'semibold', '#E5E7EB'),
      { type: 'spacer' },
      txt(clockStr(), 'caption2', 'regular', '#94A3B8'),
    ],
  };
}

function barRow(ratio, pct) {
  if (!isFin(ratio)) {
    return {
      type: 'stack', direction: 'row', alignItems: 'center',
      gap: 6,
      children: [
        icon('sf-symbol:infinity', '#34D399', 12),
        txt('无限流量', 'caption2', 'semibold', '#34D399'),
      ],
    };
  }
  const w = 120;
  const fill = Math.max(2, Math.round(w * Math.min(1, Math.max(0, ratio))));
  return {
    type: 'stack', direction: 'row', alignItems: 'center',
    gap: 7,
    children: [
      {
        type: 'stack', direction: 'row',
        width: w, height: 6,
        backgroundColor: '#FFFFFF18', borderRadius: 3,
        children: [
          { type: 'stack', width: fill, height: 6, backgroundColor: pctColor(pct), borderRadius: 3 },
          { type: 'spacer' },
        ],
      },
      txt(pct + '%', 'caption2', 'semibold', '#CBD5E1'),
    ],
  };
}

function footerLine(cfg, payload, stale, staleMsg) {
  const src = cfg.baseUrl;
  const msg = stale ? '缓存 · ' + (staleMsg || '请求失败') : src;
  return txt(msg, 'caption2', 'regular', stale ? '#FDE68A' : '#64748B');
}

function errorView(cfg, title, msg) {
  return {
    type: 'widget', url: cfg.openUrl,
    refreshAfter: refreshISO(cfg.refreshMin),
    padding: 14, gap: 8,
    backgroundGradient: { type: 'linear', colors: ['#3f1d1d', '#1f2937'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          icon('sf-symbol:exclamationmark.triangle.fill', '#FCA5A5', 16),
          txt(title, 'headline', 'bold', '#FFF'),
        ],
      },
      txt(msg, 'caption1', 'regular', '#FCA5A5', 5),
    ],
  };
}

// ============================================
// 显示逻辑
// ============================================

function displayName(item) {
  if (item.planName && item.planName !== item.name) return item.planName + ' · ' + item.name;
  return item.planName || item.name || '订阅';
}

function expireLabel(item) {
  if (item.longTerm) return '长期有效';
  if (item.expireDate && !isNaN(item.expireDate.getTime())) {
    const diff = item.expireDate.getTime() - Date.now();
    if (diff <= 0) return '已到期';
    const days = Math.ceil(diff / 86400000);
    return fmtMD(item.expireDate) + ' · ' + days + '天后到期';
  }
  return '到期未知';
}

function pctColor(pct) {
  if (pct <= 10) return '#F87171';
  if (pct <= 25) return '#FBBF24';
  return '#34D399';
}

function grad(stale) {
  return {
    type: 'linear',
    colors: stale ? ['#2b1b0f', '#1f2937'] : ['#0f172a', '#111827', '#1e293b'],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  };
}

// ============================================
// 重置时间
// ============================================

function calcReset(rawUrl, remainingDays, subName, cfg) {
  const now = new Date();
  // URL 片段参数
  const args = parseUrlArgs(rawUrl);
  // 环境变量
  if (cfg.resetDay && !args.resetDay) args.resetDay = cfg.resetDay;

  if (args.resetDay) {
    const day = Math.min(31, Math.max(1, parseInt(args.resetDay, 10) || 1));
    const y = now.getFullYear(), m = now.getMonth();
    const thisDay = Math.min(day, new Date(y, m + 1, 0).getDate());
    if (now.getDate() <= thisDay) return new Date(y, m, thisDay);
    const next = new Date(y, m + 1, 1);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    return next;
  }

  if (isFin(remainingDays) && remainingDays > 0) {
    const d = new Date(now); d.setDate(d.getDate() + Math.floor(remainingDays));
    return d;
  }
  return null;
}

function parseUrlArgs(raw) {
  const s = String(raw || '');
  const idx = s.indexOf('#');
  if (idx < 0) return {};
  const frag = s.slice(idx + 1);
  const out = {};
  for (const p of frag.split('&')) {
    if (!p) continue;
    const eq = p.indexOf('=');
    out[eq < 0 ? p : p.slice(0, eq)] = eq < 0 ? '' : decodeURIComponent(p.slice(eq + 1));
  }
  return out;
}

// ============================================
// 网络请求
// ============================================

async function httpGet(ctx, url) {
  const resp = await ctx.http.get(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Egern-SubStore-Widget' },
    timeout: 8000, redirect: 'follow',
  });
  const text = await resp.text();
  if (resp.status < 200 || resp.status >= 300) throw new Error('HTTP ' + resp.status);
  try { return JSON.parse(text); } catch (_) { throw new Error('非 JSON 响应'); }
}

async function httpHead(ctx, url) {
  return ctx.http.head(url, {
    headers: { 'User-Agent': 'clash.meta/v1.19.23' },
    timeout: 8000, redirect: 'follow',
  });
}

function getHeader(headers, name) {
  if (!headers) return '';
  try { if (typeof headers.get === 'function') return headers.get(name) || ''; } catch (_) {}
  const low = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === low) {
      const v = headers[k];
      return Array.isArray(v) ? v.join(', ') : String(v || '');
    }
  }
  return '';
}

// ============================================
// 本地存储
// ============================================

function readStoredSubs(ctx) {
  const st = ctx && ctx.storage;
  if (!st) return [];
  const keys = ['subs', 'sub-store', 'Sub-Store', 'substore', 'SubStore', 'subscriptions'];
  for (const k of keys) {
    for (const fn of ['getJSON', 'get']) {
      try {
        if (typeof st[fn] !== 'function') continue;
        const val = fn === 'get' ? tryJSON(st[fn](k)) : st[fn](k);
        const arr = extractSubs(val);
        if (arr.length) return arr;
      } catch (_) {}
    }
  }
  return [];
}

function readStoredFlow(ctx, name) {
  const st = ctx && ctx.storage;
  if (!st) return null;
  const keys = ['flow:' + name, 'flow_' + name, 'sub-flow:' + name, 'sub_flow_' + name];
  for (const k of keys) {
    for (const fn of ['getJSON', 'get']) {
      try {
        if (typeof st[fn] !== 'function') continue;
        const val = fn === 'get' ? tryJSON(st[fn](k)) : st[fn](k);
        const flow = parseFlow(val);
        if (flow.total > 0) return flow;
      } catch (_) {}
    }
  }
  return null;
}

function extractSubs(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((x) => x && x.name);
  if (typeof val === 'object') {
    if (Array.isArray(val.subs)) return extractSubs(val.subs);
    if (val.data) return extractSubs(val.data);
    if (val['sub-store']) return extractSubs(val['sub-store']);
    return Object.values(val).filter((x) => x && typeof x === 'object' && x.name);
  }
  return [];
}

function tryJSON(s) {
  if (!s || typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch (_) { return s; }
}

function writeCache(ctx, payload) {
  const st = ctx && ctx.storage;
  if (!st || !st.setJSON) return;
  try { st.setJSON('substore-flow-cache', payload); } catch (_) {}
}

function readCache(ctx) {
  const st = ctx && ctx.storage;
  if (!st || !st.getJSON) return null;
  try { return st.getJSON('substore-flow-cache'); } catch (_) { return null; }
}

// ============================================
// 流量解析
// ============================================

function parseFlow(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  const u = (d.usage && typeof d.usage === 'object') ? d.usage : {};
  return {
    total: toNum(d.total),
    upload: toNum(u.upload ?? d.upload),
    download: toNum(u.download ?? d.download),
    expires: toNum(d.expires ?? d.expire),
    remainingDays: toNum(d.remainingDays ?? d.reset_day),
    planName: String(d.planName || d.plan_name || ''),
  };
}

function parseFlowString(s) {
  const str = String(s || '');
  const num = (k) => {
    const m = str.match(new RegExp(k + '=([-+]?[0-9]*\\.?[0-9]+)'));
    return m ? Number(m[1]) : NaN;
  };
  return parseFlow({ upload: num('upload'), download: num('download'), total: num('total'), expire: num('expire') });
}

// ============================================
// 工具函数
// ============================================

function txt(value, size, weight, color, maxLines, align) {
  const n = {
    type: 'text',
    text: value == null ? '' : String(value),
    font: { size: size || 'body', weight: weight || 'regular' },
    textColor: color || '#FFF',
    maxLines: maxLines || 1,
    minScale: 0.6,
  };
  if (align) n.textAlign = align;
  return n;
}

function icon(src, color, size) {
  return { type: 'image', src, color, width: size || 16, height: size || 16 };
}

function formatBytes(b) {
  if (!isFin(b) || b < 0) return '--';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(b >= 100 ? 0 : b >= 10 ? 1 : 2) + ' ' + u[i];
}

function toNum(v) { const n = Number(v); return isFin(n) ? n : 0; }
function isFin(n) { return typeof n === 'number' && isFinite(n); }
function toBool(v, def) { if (v == null || v === '') return !!def; return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase()); }
function intClamp(v, def, min, max) { const n = parseInt(v, 10); return Math.min(max, Math.max(min, isFin(n) ? n : def)); }
function trimSlash(s) { return String(s || '').trim().replace(/\/+$/, ''); }
function splitList(s) { return String(s || '').trim().split(/[\n,|]+/).map((x) => x.trim()).filter(Boolean); }
function clockStr() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function fmtMD(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); }
function refreshISO(min) { return new Date(Date.now() + min * 60000).toISOString(); }
function shortMsg(e) { const m = e && e.message ? e.message : String(e || ''); if (/HTTP 401|HTTP 403/.test(m)) return '接口拒绝访问'; if (/HTTP 404/.test(m)) return '接口不存在'; if (/timeout/i.test(m)) return '请求超时'; if (/JSON|非 JSON/.test(m)) return '请检查 SUB_STORE_BASE_URL'; return m.slice(0, 60); }
