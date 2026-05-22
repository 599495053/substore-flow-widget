# Egern Sub-Store 套餐小组件 Env 环境变量说明

配置说明和使用示例已移至 `substore-flow-widget.js` 文件头部注释。以下为补充说明。

## 推荐配置

```text
SUB_NAMES=良心云,守候2
RESET_DAY=1
MAX_ITEMS=2
HIDE_ERRORS=true
REFRESH_MINUTES=30
```

## 核心变量

| 变量 | 是否必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `SUB_NAMES` | 推荐填 | `良心云,守候2` | 要显示的订阅名称，逗号分隔。留空自动识别有流量的订阅。 |
| `SUB_STORE_BASE_URL` | 可选 | `http://192.168.1.10:3000` | Sub-Store 后端地址，默认 `http://sub.store`。 |
| `RESET_DAY` | 推荐填 | `1` | 所有订阅通用的每月重置日。 |
| `HIDE_ERRORS` | 推荐填 | `true` | 隐藏无法获取套餐流量的本地节点源。 |
| `REFRESH_MINUTES` | 可选 | `30` | 小组件刷新间隔，最小 5 分钟。 |
| `MAX_ITEMS` | 可选 | `2` | 最多显示几个订阅。中组件建议 2-3，大组件可 6。 |

## 重置时间配置

### 所有订阅同一天重置

```text
RESET_DAY=1
```

### 不同订阅不同重置日

```text
RESET_RULES={"良心云":{"resetDay":"1"},"守候2":{"resetDay":"10"}}
```

### 周期制套餐

每 30 天重置一次：

```text
RESET_RULES={"守候2":{"startDate":"2026-01-01","cycleDays":"30"}}
```

### URL 参数方式

在订阅 URL 后追加：

```text
https://example.com/sub?token=xxx#resetDay=1
https://example.com/sub?token=xxx#startDate=2026-01-01&cycleDays=30
```

## 订阅来源优先级

1. Egern 本地存储里的 Sub-Store 订阅
2. `SUB_STORE_BASE_URL` 指向的 Sub-Store 后端 API

## 流量信息来源优先级

1. 本地存储缓存流量
2. `/api/sub/flow/:name` API
3. 订阅 URL 响应头里的 `subscription-userinfo`

## 关于长期使用

无到期时间（`expire` 为 0 或不存在）的订阅会自动识别为「长期使用」，不显示重置天数。
