# 正版平台搜索与播放页接口

接口运行在现有播放器 Worker 内，沿用网站密码会话或嵌入会话的 Bearer 凭证。无需新增数据库或第三方目录账号。

## 搜索

`GET /api/player/search?q=海市蜃楼&platform=iqiyi`

- `q`：1–80 字片名。
- `platform`：`all`（默认）、`iqiyi`、`qq`、`youku`、`mgtv`、`bilibili`。
- `source`：可省略；`official` 和兼容旧前端的 `auto` 均只查询官方来源。`360` / `sogou` 已移除。

响应的 `items` 包含 `id`、`title`、`year`、`type`、`episodeCount`、`description`、`platforms`、`links` 和 `sourceUrl`。`links[].url` 是经过域名及内容路径校验的官方视频播放页，`sourceUrl` 标识可追溯的官方搜索来源。不会把搜索页、首页或广告跳转作为播放 URL。

不同年份、平台、类型及专辑 ID 不会因片名相同而合并。例如爱奇艺的《海市蜃楼》2025 年电视剧和 2018 年电影分别返回。

`providers` 列出每个平台的 `status`（`ok` / `partial` / `unavailable`）、结果数和 `searchUrl`。部分平台失败仍保留其他平台的成功结果；全部失败时也会返回明确的状态及 `warning`，不能将其解释为官方没有这部作品。搜索只查询各平台第一页，不承诺覆盖其全部索引。

## 分集

将搜索结果中的 ID 原样传回：

`GET /api/player/detail?id=iqiyi:6244560312265801&platform=iqiyi`

响应包含 `title`、`platforms`、`total`、`episodes`；每集提供 `title`、`url`、`platform`。爱奇艺按官方专辑分页读取，最多 500 个公开播放页；腾讯使用官方完整选集模式；哔哩哔哩读取正版番剧/影视季。官方总集数多于返回数量时会附带 `warning`。`page:` 结果代表单个官方播放页。

## 当前官方来源

- 爱奇艺搜索：`https://search.video.iqiyi.com/o?if=html5&key=片名&pageNum=1&pageSize=20`。PC 参数 `if=pcw` 对实际存在的剧集也可能返回空结果，已改用经实测可用的 HTML5 入口。
- 爱奇艺选集：`https://pcw-api.iqiyi.com/albums/album/avlistinfo?aid=专辑ID&size=100&page=1`。
- 腾讯搜索：`https://pbaccess.video.qq.com/trpc.videosearch.mobile_search.HttpMobileRecall/MbSearchHttp`，POST JSON；只提取腾讯自己的节目卡及腾讯播放页，排除短视频和其他平台外链。
- 腾讯选集：`https://pbaccess.video.qq.com/trpc.videosearch.search_cgi.http/load_playsource_list_info`，采用 `scene=8` 的选集模式。
- 哔哩哔哩：`https://api.bilibili.com/x/web-interface/search/type`，分别查询 `media_bangumi` / `media_ft`；分集为 `/pgc/view/web/season`。不查询普通用户视频。
- 芒果 TV：官方搜索脚本使用的 `https://mobileso.bz.mgtv.com/pc/search/v1`，使用 `q`、`pn=1`、`pc=10`。`forbidden` 不为 0 时作为来源不可用处理。
- 优酷：`https://so.youku.com/search_video/q_片名`。只接受可识别的搜索结果页面；验证页、跳转和空应用壳均作为来源不可用处理。

这些是正版网站公开页面使用的数据入口，并非有稳定性承诺的开放 API；地区、源站访问限制及页面改版可能影响可用性。接口不会规避平台验证；受限的平台提供官网搜索入口。

## 边界与验证

所有上游请求仅使用代码中固定的官方域名；禁止任意 URL 请求和跨域重定向，不转发网站访问密码、Cookie 或 Authorization。每个请求限时 9 秒，响应最多 3 MiB，公开 GET 元数据短时缓存 120 秒。对外响应始终为私有且不缓存。

回归数据为 2026-10-28 从对应官方端点实际响应提取的必要字段，位于 `test/fixtures/catalog/`。覆盖《海市蜃楼》电视剧/同名电影区分、24 个官方分集 URL、平台失败隔离、鉴权和任意地址拒绝。
