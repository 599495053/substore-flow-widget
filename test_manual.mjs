import widget from './substore-flow-widget.js';

// 测试1：有到期时间的订阅
const ctx1 = {
  widgetFamily: 'systemSmall',
  env: {
    SUB_URLS: '守候2=https://example.com/sub?token=demo',
    RESET_DAY: '1'
  },
  storage: { getJSON(){return null}, setJSON(){} },
  http: {
    head: async () => ({
      status: 200,
      headers: {
        'subscription-userinfo': 'upload=1199553435; download=46498930286; total=161061273600; expire=1783141610'
      },
      text: async () => ''
    }),
    get: async () => ({ status: 500, headers: {}, text: async () => 'not used' })
  }
};

// 测试2：长期使用（无到期时间）
const ctx2 = {
  widgetFamily: 'systemSmall',
  env: {
    SUB_URLS: '长期套餐=https://example.com/sub?token=demo2',
  },
  storage: { getJSON(){return null}, setJSON(){} },
  http: {
    head: async () => ({
      status: 200,
      headers: {
        'subscription-userinfo': 'upload=1073741824; download=10737418240; total=107374182400'
      },
      text: async () => ''
    }),
    get: async () => ({ status: 500, headers: {}, text: async () => 'not used' })
  }
};

console.log('=== 有到期时间 ===');
const out1 = await widget(ctx1);
console.log(JSON.stringify(out1, null, 2).slice(0, 2000));

console.log('\n=== 长期使用（无到期）===');
const out2 = await widget(ctx2);
console.log(JSON.stringify(out2, null, 2).slice(0, 2000));
