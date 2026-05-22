import widget from './substore-flow-widget.js';

const flows = {
  '机场A': { status: 'success', data: { total: 107374182400, usage: { upload: 1073741824, download: 21474836480 }, expires: Math.floor(Date.now()/1000)+86400*45, remainingDays: 8, planName: 'Pro 100G' } },
  '机场B': { status: 'success', data: { total: 53687091200, usage: { upload: 0, download: 48318382080 }, expires: Math.floor(Date.now()/1000)+86400*5, remainingDays: 1, planName: '年付 50G' } },
  '长期机场': { status: 'success', data: { total: 107374182400, usage: { upload: 1073741824, download: 10737418240 }, expires: 0, planName: '年付不限时' } },
};

const makeCtx = (family) => ({
  widgetFamily: family,
  env: { SUB_NAMES: '机场A,机场B,长期机场', SUB_STORE_BASE_URL: 'http://sub.store' },
  storage: { getJSON(){return null}, setJSON(){} },
  http: { get: async (url) => {
    let body;
    if (url.endsWith('/api/subs')) body = { data: Object.keys(flows).map(name => ({ name, url: 'https://example.com/sub' })) };
    else {
      const name = decodeURIComponent(url.split('/api/sub/flow/')[1]);
      body = flows[name] || { error: { message: 'not found' } };
    }
    return { status: 200, text: async () => JSON.stringify(body), headers: { get: () => null } };
  } }
});

for (const fam of ['systemSmall', 'systemMedium', 'systemLarge']) {
  console.log(`\n=== ${fam} ===`);
  const out = await widget(makeCtx(fam));
  console.log(JSON.stringify(out, null, 2).slice(0, 2000));
}
