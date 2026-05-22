# Sub-Store 套餐流量小组件 for Egern

在 iOS 桌面显示 Sub-Store 订阅的套餐流量使用情况。

## 功能

- 显示每个订阅的已用流量、剩余流量、总流量、使用百分比
- 进度条可视化流量消耗
- 自动识别无到期时间的订阅，显示「长期有效」
- 隐藏本地节点等无法获取流量的订阅
- 支持小号、中号、大号三种主屏尺寸
- 请求失败自动使用缓存数据

## 设置方法

1. Egern → 工具 → 脚本 → `+`
2. 名称：`substore-flow-widget`，类型：`generic`
3. 将 `substore-flow-widget.js` 内容粘贴进去
4. 在 Env 中配置（见下方）
5. Egern → 分析 → 小组件画廊 → `+` → 选择脚本
6. iOS 主屏添加 Egern 小组件

## 环境变量

| 变量 | 说明 |
|---|---|
| `SUB_NAMES` | 订阅名，逗号分隔；留空自动识别全部 |
| `SUB_STORE_BASE_URL` | Sub-Store 后端地址，默认 `http://sub.store` |
| `SUB_URLS` | 手动填入订阅直链，格式：`名称1=https://url1,名称2=https://url2` |
| `RESET_DAY` | 每月流量重置日，如 `1` |
| `HIDE_ERRORS` | 隐藏无法获取流量的订阅 |
| `REFRESH_MINUTES` | 刷新间隔，默认 30 |
| `MAX_ITEMS` | 最大显示数，按尺寸自动 |

### 推荐配置

```
SUB_NAMES=机场A,机场B
RESET_DAY=1
HIDE_ERRORS=true
```

### 如果 Sub-Store API 获取不到流量

可以用 `SUB_URLS` 直接填入订阅链接，绕过 Sub-Store API：

```
SUB_URLS=机场A=https://example.com/sub/abc123,机场B=https://example.com/sub/def456
```

### 重置日高级用法

不同订阅不同重置日：在订阅 URL 后追加 `#resetDay=1`

## 组件尺寸

| 尺寸 | 显示内容 |
|---|---|
| 小号 | 1 个订阅，详细信息 |
| 中号 | 2 个订阅 + 合计 |
| 大号 | 6 个订阅 + 合计 |
