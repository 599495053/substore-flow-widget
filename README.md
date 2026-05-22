# Egern Sub-Store 套餐流量小组件

读取 Sub-Store 已添加的订阅，不需要在小组件里重复填写机场订阅链接。

## 功能

- 从 Sub-Store `/api/subs` 获取订阅列表。
- 从 `/api/sub/flow/:name` 获取套餐流量信息。
- 显示：剩余流量、总流量、剩余比例、下次重置时间、套餐到期/剩余时间。
- 无到期时间的订阅自动识别为「长期使用」。
- 支持多个订阅名，主屏中组件默认显示 3 个，大组件显示 6 个，小组件/锁屏显示 1 个。
- 支持缓存：请求失败时显示上一次成功数据。

## 文件

- `substore-flow-widget.js`：Egern generic 小组件脚本（配置说明见文件头部注释）。
- `substore-storage-probe-widget.js`：实验性存储探测脚本，用来测试能否直接读取 Egern 里 Sub-Store 的本地存储。
- `egern-config-snippet.yaml`：可复制到 Egern 配置的示例片段。

## Egern 设置方法

### 方式一：UI 手动添加（推荐）

1. Egern → 工具 → 脚本 → 右上角 `+`。
2. 名称：`substore-flow-widget`
3. 类型：`generic`
4. 文件位置：本地，文件名：`substore-flow-widget.js`
5. 编辑文件，把 `substore-flow-widget.js` 的内容复制进去并保存。
6. 在脚本 Env 里配置：
   - `SUB_STORE_BASE_URL`：默认 `http://sub.store`。自建后端填完整地址。
   - `SUB_NAMES`：订阅名称，多个用英文逗号分隔；留空则显示前几个订阅。
   - `RESET_DAY`：每月重置日，例如 `1`。
   - 其余配置见脚本文件头部注释。
7. Egern → 分析 → 左上角进入小组件画廊 → `+`。
8. 名称：`Sub-Store 套餐`
9. 脚本名称：选择 `substore-flow-widget`。
10. iOS 主屏幕长按 → 添加 Egern 小组件 → 编辑小组件选择 `Sub-Store 套餐`。

### 方式二：配置片段

把 `egern-config-snippet.yaml` 里的 `scriptings` 和 `widgets` 合并进你的 Egern 配置。

## 环境变量

详见 `substore-flow-widget.js` 文件头部注释。核心变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SUB_NAMES` | 空 | 订阅名称，逗号分隔；留空自动识别 |
| `SUB_STORE_BASE_URL` | `http://sub.store` | Sub-Store 后端地址 |
| `RESET_DAY` | 空 | 每月重置日 |
| `HIDE_ERRORS` | `false` | 隐藏无法获取流量的订阅 |
| `REFRESH_MINUTES` | `30` | 刷新间隔，最小 5 分钟 |
| `MAX_ITEMS` | 按尺寸自动 | 最多显示多少个订阅 |

## 关于重置时间

优先顺序：

1. Sub-Store `/api/sub/flow/:name` 返回的 `remainingDays`。
2. 环境变量 `RESET_RULES`、`RESET_DAY`、`START_DATE + CYCLE_DAYS`。
3. 订阅 URL 片段参数里的 `resetDay`、`startDate + cycleDays`。
4. 都没有则显示空。

详情和示例见 `substore-flow-widget.js` 头部注释。

## 注意

`sub.store` 是 Sub-Store 模块常用的本地域名入口。请确保你的 Egern Sub-Store 模块已启用。若使用自建 Sub-Store 后端，建议直接把 `SUB_STORE_BASE_URL` 填成自建后端地址。
