# VideoSearch 搜索与分集接口

搜索与分集统一转接 https://videosearch.webber.qzz.io/ 的 v1 API，原有各平台抓取、解析和分页实现已删除。播放器继续使用同源接口及现有网站/嵌入会话认证。

## 搜索

`GET /api/player/search?q=海市蜃楼&platform=iqiyi`

- `q`：1–80 字片名。
- `platform`：`all`（默认）、`iqiyi`、`qq`、`youku`、`mgtv`、`bilibili`。
- 服务端调用 `/v1/search?q=...&view=series&platforms=...&limit=20`，将 `qq` 映射为 `tencent`、`mgtv` 映射为 `mango`。
- 响应保持播放器使用的 `items`、`providers`、`warning` 格式；同名不同版本分别显示。平台的 empty 状态表示无结果，degraded/stale 表示部分结果，unavailable/unsupported 表示查询受限。
- `source` 参数仅为旧调用方保留 `official`/`auto` 兼容校验，不改变搜索来源。

## 分集

将返回的 `items[].id` 原样传回，不自行构造：

`GET /api/player/detail?id=...&platform=iqiyi`

ID 封装搜索结果的 `detail_url`，包含准确平台、版本和查询参数；服务端验证后跟随该地址。分集不按搜索的 limit 截断。所有平台均通过新服务读取目录，保留完整分集标题、上下篇、加更等名称。分集目录的 partial、complete、warnings 和缺集编号会转换为界面提示。

剧集名与分集名保留 API 全文，以纯文本渲染；搜索卡片和选集按钮自动换行，桌面、紧凑模式和移动端均可滚动查看。

## 请求边界

仅请求固定的 VideoSearch HTTPS 域名和允许的 v1 路径，不跟随重定向。不会向上游转发用户 Cookie、Authorization 或站点密码。请求限时 20 秒，JSON 最大 3 MiB；上游失败返回 502，界面允许重试。上游服务当前公开可用；若未来启用 API_KEY，应在服务端配置，不能把共享密钥写入前端。

官方播放地址仍使用域名和内容路径校验；服务仅发现播放页，媒体解析沿用现有播放器线路。

真实回归样本为 2026-10-29 的《海市蜃楼》作品及 24 集目录，位于 `test/fixtures/catalog/videosearch-*.json`。接口文档：https://videosearch.webber.qzz.io/openapi.json 。
