export default async function(ctx) {
  const rows = [];
  const keys = [
    'subs',
    'sub-store',
    'Sub-Store',
    'substore',
    'SubStore',
    'subscriptions',
    '#subs',
    '#sub-store',
  ];

  for (const key of keys) {
    rows.push(inspectKey(ctx, key));
  }

  const found = rows.filter((r) => r.hit);
  const lines = found.length
    ? found.map((r) => `${r.key}: ${r.summary}`)
    : ['没有在常见 key 里读到 Sub-Store 订阅。'];

  return {
    type: 'widget',
    refreshAfter: new Date(Date.now() + 10 * 60000).toISOString(),
    padding: 14,
    gap: 8,
    backgroundGradient: {
      type: 'linear',
      colors: ['#111827', '#1e293b'],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    children: [
      row('sf-symbol:externaldrive.fill', 'Sub-Store 存储探测', '#60A5FA'),
      text(lines.join('\n'), 'caption1', 'regular', found.length ? '#BBF7D0' : '#FCA5A5', 6),
      text('如果这里能看到 subs，主小组件就可以免 API 读取。', 'caption2', 'regular', '#94A3B8', 2),
    ],
  };
}

function inspectKey(ctx, key) {
  const out = { key, hit: false, summary: '' };
  const storage = ctx.storage || {};
  const values = [];
  try { if (storage.getJSON) values.push(storage.getJSON(key)); } catch (e) { values.push('getJSON error: ' + short(e)); }
  try { if (storage.get) values.push(parseMaybeJSON(storage.get(key))); } catch (e) { values.push('get error: ' + short(e)); }

  for (const value of values) {
    const summary = summarize(value);
    if (summary) {
      out.hit = true;
      out.summary = summary;
      return out;
    }
  }
  return out;
}

function summarize(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 80);
  if (Array.isArray(value)) return `数组 ${value.length} 项` + names(value);
  if (typeof value === 'object') {
    if (Array.isArray(value.subs)) return `对象.subs ${value.subs.length} 项` + names(value.subs);
    if (value.data) return '对象.data → ' + summarize(value.data);
    const vals = Object.values(value);
    const subLike = vals.filter((x) => x && typeof x === 'object' && x.name);
    if (subLike.length) return `对象内订阅 ${subLike.length} 项` + names(subLike);
    return '对象 keys: ' + Object.keys(value).slice(0, 8).join(', ');
  }
  return String(value).slice(0, 80);
}

function names(arr) {
  const list = arr.filter((x) => x && x.name).slice(0, 4).map((x) => x.name);
  return list.length ? '：' + list.join(', ') : '';
}

function parseMaybeJSON(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return value; }
}

function row(icon, title, color) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children: [
      { type: 'image', src: icon, color, width: 16, height: 16 },
      text(title, 'headline', 'bold', '#FFFFFF', 1),
    ],
  };
}

function text(value, size, weight, color, maxLines) {
  return {
    type: 'text',
    text: String(value || ''),
    font: { size, weight },
    textColor: color,
    maxLines: maxLines || 1,
    minScale: 0.6,
  };
}

function short(e) {
  return e && e.message ? e.message : String(e || 'error');
}
