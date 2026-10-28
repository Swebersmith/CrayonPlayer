# Crayon Player

可独立部署，也可嵌入网页的 HTML5 视频播放器。支持 MP4 / HLS、投屏、触屏手势、拖动进度、断点续播、片头片尾和广告分片过滤。

Crayon Player 是独立播放器。影片目录、账户和选集属于宿主网站。独立运行不需要任何指定视频网站的代码、账户、数据库或接口。演示页面另外提供可选的第三方解析线路。`prepareMedia` 是可选的通用接入配置，未配置时可使用静态演示与本地分片过滤；需要投屏过滤时可部署本仓库自带的服务。

## 选择使用方式

- **打开播放器看视频**：运行本地演示，或把 `demo-dist/` 上传到 HTTPS 静态托管。无需数据库。
- **接入自己的网页**：安装 npm 压缩包，或直接引入 `dist/crayon-player.iife.js`；无需额外引入播放器 CSS。
- **让 AirPlay 和 Chromecast 也使用去广告清单**：部署配套服务，并设置 `prepareMedia`。纯静态部署无法向电视提供本地过滤清单。

仓库不包含影片目录、片源订阅、账户数据库或部署凭据。请使用自己有权访问的视频地址。去广告是对已识别 HLS 插播分片的过滤，不处理压进正片画面的广告，也不保证识别所有片源。

## 安装和本地运行

只需现成文件时，可在 [Releases](https://github.com/Swebersmith/CrayonPlayer/releases) 下载 `crayon-player-static-版本.tar.gz`（解压后上传静态网站）、`crayon-player-browser-版本.tar.gz`（嵌入网页的脚本与模块）或 npm `.tgz` 安装包。压缩包附带许可文件，`SHA256SUMS.txt` 可用于核对文件完整性。

需要 Node.js 22 或更新版本、npm。Windows、macOS 和 Linux 使用相同 npm 命令。

```sh
git clone https://github.com/Swebersmith/CrayonPlayer.git
cd CrayonPlayer
npm ci
npm run dev
```

打开终端显示的地址，粘贴 MP4 或 M3U8 地址后点击「载入视频」。默认视频是公开测试流。私有仓库需要 GitHub 访问权限；安装不会把仓库或视频公开。

`npm ci` 按锁文件安装依赖并准备发行文件。修改源码后运行 `npm run check`，检查类型、功能、演示构建和真实 npm 压缩包。打包检查使用系统 `tar` 命令，Windows 10/11、macOS 和常见 Linux 发行版均提供。

## 部署静态演示

```sh
npm run build:demo
npm run preview
```

确认预览正常后，把 **`demo-dist/` 内的全部文件** 上传到静态托管，入口为 `index.html`。构建使用相对资源路径，可放在网站子目录；不要只上传 HTML，也不要双击本地 HTML 代替 HTTP(S) 部署。

此方式提供播放器、手势、设置、记录和设备支持的投屏入口。本地 HLS 使用 Crayon 内的 HLS.js（MSE/MMS）过滤与播放；电视端过滤需要下一节的服务。缺少 MSE/MMS 的浏览器会明确提示不支持，不切换到系统 HLS。演示会显示当前部署模式。

### 配套服务与页面一起部署到 Cloudflare Workers

此方案把页面、签名清单、分片和密钥转发部署到同一 HTTPS 站点，不需要其他视频网站、数据库或 KV/D1。配置在 `wrangler.jsonc`，默认 Worker 名称为 `crayon-player`，首次部署前可改为自己的名称。

**只在 Cloudflare 控制台操作，并让 GitHub 更新自动部署**：按[控制台部署与 GitHub 自动更新教程](docs/cloudflare-github.md)操作。先创建同名 Worker、添加两项运行时 Secret，再到 Settings → Builds 连接本仓库的 `main`。构建命令填 `npm run build:hosted`，部署命令填 `npx wrangler deploy --keep-vars`；Node.js 24 已由 `.node-version` 指定。运行时密钥不能只填在构建变量里。

以下为使用本地命令行部署的方式：

```sh
npx wrangler login
npx wrangler secret put MEDIA_SECRET
npx wrangler secret put VIEWER_PASSWORD
npm run deploy:check
npm run deploy
```

- `MEDIA_SECRET`：签名随机密钥，建议至少 32 字符。可在自己的终端运行 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成，再在 secret 提示中输入。不能放进前端、Git 或 `vars`。
- `VIEWER_PASSWORD`：访问页面和准备接口的口令，建议使用长的随机英文数字口令。打开播放器后，在网页登录页只输入该密码，无需用户名。
- `secret put` 会修改远端 Worker；先确认 Cloudflare 账户和 Worker 名称。后续更新通常只需 `npm ci` 和 `npm run deploy`，不要重设密钥，否则旧投屏链接会失效。
- `deploy:check` 只构建并打包检查，`deploy` 才发布。Workers Builds 默认自动安装依赖，使用构建命令 `npm run build:hosted`、部署命令 `npx wrangler deploy --keep-vars`，并提前配置上述两个运行时 secret；首次配置的完整顺序见控制台教程。
- 此模式自动启用 `prepareMedia: '/api/player/prepare'`。页面和准备接口需要登录；电视读取的媒体链接只验证签名，无需网页口令，默认有效 8 小时。请勿公开转发这些临时链接。
- 登录状态保存在签名的 HttpOnly / Secure Cookie 中，有效 12 小时，过期后重新输入密码。首页提供「退出登录」。沿用已有 `VIEWER_PASSWORD` 和 `MEDIA_SECRET`，无需新增配置；更换访问密码会使已有浏览器登录失效。登录后回到原播放链接，密码不进入 URL 或前端存储。
- 默认的「全部资源」模式会转发视频流量；「仅清单」模式只处理 HLS 清单，视频分片和密钥由播放设备直连片源。平台请求量、带宽策略、CPU 和上游连通性限制仍然适用。不要把准备接口改成匿名开放代理。

本地验证完整部署：在仓库根目录创建未提交的 `.dev.vars`，写入 `MEDIA_SECRET=自己的测试密钥` 和 `VIEWER_PASSWORD=自己的测试口令`，运行 `npm run dev:hosted`。改动 Worker 配置后运行 `npm run worker:types`。本地口令、生成类型和 `.wrangler/` 不进入版本库或 npm 包。

依据：[Workers 静态资源路由](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)、[Wrangler 安装](https://developers.cloudflare.com/workers/wrangler/install-and-update/)、[Secrets 配置](https://developers.cloudflare.com/workers/configuration/secrets/)。

### 获取独立播放入口

完整部署后，在 Cloudflare 的 Domains & Routes 查看自己的 HTTPS 域名。直接打开首页，粘贴视频地址并点击 **生成播放链接**，即可复制编码完整的链接。入口前缀为：

首页右上角的 **接入说明** 提供 App 接口前缀、完整播放链接和 iframe 示例，支持替换视频地址并分别复制；示例自动使用当前部署域名。纯静态部署会保留网站所在子目录。

```text
https://你的播放器域名/parse?url=
```

将 `encodeURIComponent(视频地址)` 拼在后面即可使用。例如：

```js
const playerUrl = new URL('/parse', 'https://player.example');
playerUrl.searchParams.set('url', 'https://media.example/video.m3u8?token=abc&episode=2');
// playerUrl.href 可以独立打开；iframe 接入时需允许 fullscreen / autoplay / picture-in-picture。
```

`/parse` 默认只显示播放器；添加 `&embed=0` 可显示完整页面。首页也支持 `/?url=编码后的视频地址`。纯静态部署使用首页查询参数，首页生成链接时会保留所在子目录。

此入口默认接收媒体地址；视频网站播放页可选择下述第三方线路。首次访问只需在网页输入 `VIEWER_PASSWORD`，不能将密码或 `MEDIA_SECRET` 拼进 URL。登录会保留原播放链接的地址参数。

### 播放器内搜索、选集与解析

搜索、选集、线路和重试都位于 ArtPlayer 自身的播放节点内，元素全屏、网页全屏以及只显示播放器的嵌入模式均可使用。轻触画面或移动鼠标会唤出上方居中的悬浮菜单，2.5 秒无操作后自动隐藏；也可轻触画面顶部边缘或在播放器内按 `M` 唤出，按 `Esc` 收起。顶部入口在观看时不显示文字或按钮背景，仍支持键盘聚焦。点击「选集」可在画面内展开已选影片的分集，当前播放集会高亮；宿主也可用 `library.episodes` 提供官方分集页，或调用 `player.library.openEpisodes()` 打开。未取得分集信息时会提示先搜索影片。

播放器采用统一的石墨灰玻璃面板和薄荷绿强调色。按钮有连贯的悬停与按压反馈，搜索、选集、线路、设置和投屏面板从入口平滑展开并收回；系统启用「减少动态效果」时使用静态切换。打开面板后不会被菜单定时器关闭。点击「搜索」，输入片名检索腾讯视频、爱奇艺、优酷、芒果 TV、哔哩哔哩；选择影片、平台、分集后，将真实官方播放页传给解析器。也可直接粘贴具体播放页网址。搜索结果不保证上游一定支持播放，第三方播放器内部控件的样式由上游提供。

搜索面板会在本地浏览器保留最近 20 个搜索片名，重复搜索自动置顶。点击历史片名可重新搜索，旁边的删除按钮仅删除对应记录；搜索结果页可通过「历史记录」返回列表。播放网址不写入搜索历史。浏览器不允许本地存储时，历史仍可在本次播放器会话内使用。

手机轻触顶部中央区域即可唤出菜单。菜单使用独立的隐藏计时，抬手和底部控制栏的隐藏不会中断按钮点击。菜单、选集和历史删除按钮的操作区至少 44 像素，按压反馈保持点击位置稳定。搜索、选集和线路在手机上展开为播放器自身的可滚动大面板，关闭后恢复视频画面；面板跟随可视区域和横竖屏变化，支持键盘弹出后的滚动操作。打开搜索时不会自动弹键盘，点击输入框后再输入。

- 搜索直接请求爱奇艺、腾讯视频、优酷、芒果 TV、哔哩哔哩各自的官方搜索入口，不再依赖 360 / 搜狗目录。全部平台并行查询，不会因为某个平台已有同名电影就停止补搜电视剧；结果显示年份、类型和集数，并保留不同版本。爱奇艺、腾讯、哔哩哔哩的分集也读取对应官方数据。平台限制访问、超时或返回验证页面时，会明确提示结果可能不全并提供官网搜索入口，不把故障当成没有资源。接口参数和来源见 [正版平台搜索接口](docs/official-search.md)。
- 前四条解析线路接收 HTTP(S) 播放页地址。第五条 M1907 接收名称或播放页，实际参数为 `https://im1907.top/?jx=`。只有 M1907 接受纯片名。
- QL 在完整部署中通过登录保护的 `POST /api/player/resolve` 获取媒体地址，交给 Crayon 播放。适配器从页面配置读取临时 token，调用固定上游的解析请求，不执行其前端授权脚本，也不转发用户登录 Cookie 或凭证。
- TX、SD、AIBox、M1907 的上游网页作为图层嵌入播放器自身节点，切换和搜索入口保留在画面内；这些线路使用上游控件，Crayon 的媒体过滤与投屏功能只作用于自身实际播放的媒体。
- 2026-10-28 验证：真实爱奇艺、优酷、哔哩哔哩、腾讯、芒果播放页均通过 QL 返回 M3U8；爱奇艺完成搜索、平台选择、选集、解析和实际播放的浏览器测试，并验证了全屏内搜索。接口成功与实播分别验证，不保证所有节目、平台和网络均可用。M1907 与 AIBox 的结果仍取决于上游网页和节点状态。

完整部署示例：`/parse?parser=ql&url=编码后的播放页地址`；按名称调用第五条：`/parse?parser=m1907&url=编码后的片名`。支持线路 ID：`native`、`tx`、`sd`、`ql`、`aibox`、`m1907`。配置位于 `src/library-sources.ts`。播放器内部的「播放链接」和网页接入说明均保留所选线路。

SDK 接入同样可以启用播放器内搜索，不依赖本项目演示网页的 DOM：

```ts
const player = createCrayonPlayer({
  container: '#player',
  url: '', // 可先搜索，再选择播放；也可填媒体直链。
  prepareMedia: '/api/player/prepare',
  library: {
    searchEndpoint: '/api/player/search',
    detailEndpoint: '/api/player/detail',
    resolveEndpoint: '/api/player/resolve',
  },
});
player.library?.open();
await player.library?.play('https://www.iqiyi.com/v_19rrjaail0.html', 'ql');
await player.library?.play('西游记', 'm1907');
```

随库导出 `VideoLibraryOptions`、`VideoLibraryController`，服务端入口导出 `handleVideoCatalog`、`searchVideoCatalog`、`videoCatalogDetail`。完整部署自动启用搜索；搜索、分集和解析接口复用原有登录，无需新增密钥或数据库。纯静态部署保留播放器内输入和线路选择，搜索与服务端解析需配套服务；静态 QL 网页仍可能提示域名未授权。

复测：`node scripts/probe-search.mjs 片名` 验证目录来源；`node scripts/probe-parsers.mjs 网址` 验证嵌入；`node scripts/probe-ql.mjs 具体播放页网址` 验证解析。先 `npm run build:hosted`，再 `node scripts/verify-parser-playback.mjs --search` 实测内部搜索、选集、播放和全屏。浏览器脚本需已安装 `playwright-core` 和 Chrome，使用本地临时测试账号；结果保存在忽略的 `.parser-inspection/`。更新线上部署需同时构建页面和发布 Worker，沿用两项原有 secrets。

**跨站 iframe 密码登录**：`/parse?url=...` 或 `embed=1` 可在播放器内直接输入密码。登录优先保存在 `Secure; HttpOnly; SameSite=None; Partitioned` Cookie 中，有效 12 小时；同一宿主网站下换集、刷新和重新创建 iframe 可复用登录。普通首页仍使用原有的 `SameSite=Lax` 登录 Cookie，两个入口的登录互相隔离。

旧版 WebView 等环境不接受 Cookie 时，播放器只将限时嵌入凭证保存在自己源下的 `sessionStorage`，在同一标签页内刷新、换集或重新创建 iframe 时复用。原始密码只经 HTTPS 发送给播放器的认证接口，不写入 localStorage/sessionStorage、URL、日志或跨窗口消息；外层网站无法通过跨源 DOM 读取密码或凭证。不要把播放器部署在不受信任网页的同一源下。若浏览器同时禁止 Cookie 和站点存储，则只能保持当前页面内存中的登录，刷新或重建 iframe 仍需重新输入。

嵌入凭证用于嵌入登录检查、媒体准备、搜索、分集和解析，不能当作首页登录 Cookie 使用；过期或更换 `VIEWER_PASSWORD` 后失效。设置 → 退出登录清除当前嵌入环境的登录状态。宿主无需增加服务端；若设置 iframe sandbox，需要允许 `allow-scripts allow-same-origin`，并保持播放器与宿主跨源。`allow` 需包含所需的 fullscreen / autoplay / picture-in-picture 权限。

嵌入界面及其编译后的 JS/CSS 为公开启动文件，不包含密钥；媒体准备接口仍要求有效登录，认证成功前不会加载视频。无需修改现有两个 Worker secrets。

独立部署 **无需数据库、KV、D1 或视频网站账户**。签名媒体链接无需数据库保存，观看进度使用当前浏览器的 localStorage，不会跨设备自动同步。

## 接入自己的网页

### 安装 npm 压缩包

在播放器仓库运行：

```sh
npm run check
npm pack
```

得到 `swebersmith-crayon-player-0.3.3.tgz`，在自己的前端项目安装该文件：

```sh
npm install /path/to/swebersmith-crayon-player-0.3.3.tgz
```

拥有仓库访问权限时，也可 `npm install github:Swebersmith/CrayonPlayer`，安装会自动构建。不要求该名称已发布到 npm 公共仓库，不能直接假定 `npm install @swebersmith/crayon-player` 可用。

```html
<div id="player" style="width:100%;aspect-ratio:16/9"></div>
```

```ts
import { createCrayonPlayer } from '@swebersmith/crayon-player';

const player = createCrayonPlayer({
  container: '#player',
  url: 'https://media.example/episode.m3u8',
  title: '第一集',
  storageKey: 'series-123:episode-1',
  autoplay: false,
  blockAds: true,
  serverRelay: true, // 中转与去广告独立；关闭中转可在浏览器内过滤 HLS
  relayMode: 'full', // 'full' 转发全部资源；'playlist' 仅中转清单，分片和密钥直连
  enhancements: { network: { prefetchLanes: 2, showNetworkSpeed: false } },
  prepareMedia: '/api/player/prepare', // 部署同源服务后启用；纯静态接入请删掉此项
  skip: { enabled: true, intro: 60, outro: 90 },
  onNext: () => openNextEpisode(),
  onProgress: (sourceTime, sourceDuration) => saveProgress(sourceTime, sourceDuration),
  player: { theme: '#22c55e', volume: 0.7 },
});

// 卸载、换集或换播放器时销毁；下一集使用新的 storageKey 创建实例。
player.destroy();
```

`openNextEpisode`、`saveProgress` 由宿主实现，不需要时删掉相应配置。`outro` 表示距结尾多少秒，不是片尾开始的绝对时间。`storageKey` 必须按影片和集数区分。断点、回调和片头片尾使用原片时间轴，界面显示过滤后的实际时长。

`enhancements.network` 可设置首次使用的预取路数和速率显示开关；`prefetchLanes: 1` 表示关闭预取。浏览器已有用户选择时优先使用已保存的设置，换集仍保留偏好。

在浏览器 DOM 已创建后初始化。在 React / Vue 等框架的挂载回调创建、卸载回调销毁；服务端渲染时不要提前创建实例。ESM、CommonJS 和类型声明均随包提供。

### 直接通过 script 接入

运行 `npm run build`，将 `dist/crayon-player.iife.js`、`LICENSE`、`NOTICE.md` 和 `THIRD_PARTY_LICENSES/` 放入自己的静态资源目录：

```html
<div id="player" style="width:100%;aspect-ratio:16/9"></div>
<script src="/assets/crayon-player.iife.js"></script>
<script>
  const player = CrayonPlayer.createCrayonPlayer({
    container: '#player',
    url: 'https://media.example/episode.m3u8',
    storageKey: 'series-123:episode-1',
    // prepareMedia: '/api/player/prepare',
  });
  window.addEventListener('pagehide', () => player.destroy());
</script>
```

浏览器全局名为 `CrayonPlayer`，无需其他脚本或 CSS。完整示例见 [examples/embed.html](examples/embed.html)。不要把 CommonJS 文件当浏览器脚本引入；直接 ESM 导入使用 `dist/crayon-player.mjs`。

### 接入现有服务端

`prepareMedia` 可填同源接口地址，也可提供异步函数：

```ts
prepareMedia: async (url, blockAds, relayMode = 'full') => {
  const response = await fetch('/my-media/prepare', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, blockAds, relayMode }),
  });
  if (!response.ok) throw new Error('播放清单准备失败');
  return response.json();
}
```

返回 `{ url, type?, filter, expiresAt?, relayMode? }`：`url` 是接收端可访问的 HTTP(S) 地址；`filter` 为 `{ playlist, originalDuration, removed, reason }`，`removed` 为原片时间轴上的 `{ start, end }[]`，`reason` 为 `filtered`、`no-match` 或 `unsupported`。`expiresAt` 为毫秒时间戳。示例服务的 `playlist` 留空，清单由签名 URL 读取。`relayMode` 返回实际使用的 `'full'` 或 `'playlist'`；旧的两参数自定义准备函数仍适用于全部资源模式，支持仅清单模式的自定义服务需要接收第三个参数并返回相应模式。

也可使用 `createMediaPreparer('/api/player/prepare')`，取得有限缓存、过期检测与失败重试的适配器。播放器与投屏共用它，并分别缓存不同中转方式和去广告设置的结果。配置服务时默认开启服务器中转，`serverRelay` 可指定首次使用的默认值，`relayMode` 可指定首次使用的中转方式，默认 `'full'`；浏览器已保存的选择优先。

全部资源模式下，HLS 和 MP4 由服务准备并转发。仅清单模式下，服务器处理 HLS 清单及后续子清单，保留过滤和签名访问；分片、初始化片段和 HTTP 密钥使用片源的绝对地址，MP4 直接返回原地址。HLS 的过滤与否单独由去广告开关决定，电视拿到过滤清单后仍可去广告，但必须能直连片源及密钥；浏览器和 Chromecast 还需要片源允许相应 CORS。仅清单模式不会自动回退为全部资源转发。

服务不可达、请求 20 秒无响应、上游请求失败或返回数据无效时，停止加载并显示具体错误，不自动改变开关。适配器请求仅清单模式而旧版服务未返回对应模式时，会提示更新服务，不把全部资源模式当作仅清单使用。用户可主动关闭中转，改用浏览器直连；开启去广告时仍在本机过滤 HLS。失败缓存会清除，恢复服务后可重新选集或载入视频。新增模式需要同时更新播放器文件和配套服务。

服务端独立入口：

```ts
import { handleMediaRelay } from '@swebersmith/crayon-player/server';

const response = await handleMediaRelay(request, {
  secret: process.env.MEDIA_SECRET || '', // 缺少密钥时服务返回 503
  authorize: async request => verifyYourLogin(request),
});
// 非 /api/player/prepare、/api/player/media 请求返回 null，交给宿主路由。
```

需要 Fetch API、Web Crypto 和流式响应。认证由宿主提供，密钥仅存服务端；应沿用宿主的访问频率控制。协议保留 CORS、Range、密钥状态、AES-128 IV 和原片时间映射，全部资源模式以流式响应转发二进制分片，仅清单模式不读取这些资源。

高级接入可用 `createCrayonPlayerCore(options, enhancements)` 保留自有加载器、设置和按钮，或用 `crayonPlayerPlugin`。低层插件要求关闭宿主重复的 `gesture`、`fastForward`；不要同时安装插件和工厂。推荐高级配置字段为 `player`；早期的 `artplayer` 字段仍兼容，同时传入以 `player` 为准。

程序控制全屏可调用 `await toggleCrayonFullscreen(player)`（由主入口导出），或设置 `player.fullscreenWeb = true` 使用网页全屏。前者请求整个 Crayon 界面的元素全屏，保留播放器控件，不调用视频元素的系统播放界面。

## 操作与默认行为

- 画面三等分：左侧双击快退 10 秒，中间双击暂停/继续，右侧双击快进 10 秒；跨区域两次点击不合并为双击。
- 长按 500ms，临时至少 2 倍速；松手、取消触摸、失焦、锁屏或换源后恢复原倍速。原来超过 2 倍不会降速。
- 画面左右滑动、底部进度条触摸拖动和鼠标拖动均调节进度，超出边界限制在 0 与总时长之间。进度条聚焦后可用方向键、Home / End。
- 左上角显示「当前进度 / 总时长」，如 `59秒`、`1分钟0秒`、`1小时2分钟3秒`；窄屏使用 `27:32 / 1:16:53` 这类紧凑时间，并隐藏底部重复时间。拖动时进度条立即同步。
- 控件根据播放器容器的实际尺寸自适应，适用于网页嵌入和桌面模式的手机浏览器。窄屏保留播放、设置、投屏和全屏等主要入口，音量、画中画、网页全屏等可从设置进入；极窄时投屏也移到设置。下载速率仍在设置按钮左侧。设置及投屏面板限制在画面内并可滚动，网页全屏支持横竖屏切换及安全区域留白。
- 右侧上下滑调节音量；设置 → 音量提供手动滑块。没有亮度调节。
- 单击显隐控制栏，设置与控制栏一起隐藏，播放中闲置约 3 秒收起；拖动期间保持可见。
- 设置 → 迷你进度条默认关闭，开启后保留视频底边细条，并记住选择。控制栏收起时，画面左右滑动快进/快退会直接同步细条，不展开完整控制栏；可直接点按或拖动细条调节进度，操作时显示当前时间。细条上方保留透明触控区域，方便手指命中；支持鼠标、触屏及聚焦后的方向键、Home / End，兼容全屏与旋转画面。控制栏已经展开时，继续使用完整进度条。
- 设置 → 多路预取支持关闭、2 路（默认）、3 路、4 路；选择即时生效并保存在当前浏览器。路数包含正常播放的一路，其余并发下载后续 HLS 点播分片，播放时复用缓存及尚在下载的请求。当前分片开始加载时即启动预取，接管预取请求后立即补充后台通道，减少下载与解码之间的空档。可连续播放的缓冲不足一个分片或 6 秒时（取较大值，并考虑倍速），最多启用一路后台预取，优先保障当前分片；缓冲恢复后自动增加到所选路数。仅从实际播放的清单预取，兼容本地和服务端去广告；解密、音画同步和缓冲顺序仍由 HLS.js 处理。
- 设置 → 服务器中转与去广告分别控制。配置配套服务时默认开启中转，开关显示「已开启 / 已关闭」并记住选择，刷新和连续换集沿用；切换时按原片时间恢复进度，并清除旧投屏清单缓存。中转关闭、去广告开启：浏览器直连并本机过滤，片源须允许 CORS；中转开启：按「中转方式」处理资源，去广告开关同时作用于本机和投屏清单；两项都关闭：直接播放原片。中转关闭时不请求准备服务，投屏面板会说明电视直连原始片源、本机过滤不传给电视。未配置 `prepareMedia` 的静态部署不显示中转开关和中转方式。
- 设置 → 中转方式可选「全部资源」（默认）和「仅清单（分片直连）」。先开启服务器中转，再选择仅清单，即可保留投屏清单去广告并减少服务器视频流量；分片、初始化片段和密钥由设备直连，MP4 也直接播放原地址。片源需要允许设备访问和所需 CORS；直连受限时可切回全部资源。选择会保存在当前浏览器，切换时保留原片进度并使旧投屏清单失效；中转关闭时只保存选择，重新开启后生效。
- 预取窗口最多向后 60 秒、8 个分片，缓存限制为 24 MiB；暂停和卡顿时停止尚未被播放接管的后台下载，保留已完成缓存，恢复播放后自动继续预取。调整路数保留可用缓存，降低路数时优先取消较远的下载；关闭预取、拖动进度、切换清晰度和销毁时清理过时预取。预取失败时正常播放请求会重新加载，其他后台通道继续补位；网络较慢或片源限制并发时，可在设置中降低路数或关闭。MP4、直播和 LL-HLS 使用各自原有加载方式。
- 设置 → 下载速率显示默认关闭，开启后在右下角设置按钮的左侧显示每秒实际下载量（B/s、KB/s、MB/s），随底部控制栏显隐，包括普通 HLS 分片及预取流量；缓存命中不重复计数，空闲时显示 0 B/s。此功能显示网络下载速率；MP4 和接收端投屏不提供网页端分片速率，显示「↓ —」。开关会保存在当前浏览器。
- 设置中的服务器中转、去广告、跳过片头片尾、迷你进度条和下载速率显示均使用状态按钮，直接显示「已开启」或「已关闭」，点击可切换；支持键盘聚焦及 Enter / 空格操作。
- 首次触屏播放显示提示。双指操作和锁屏不触发普通手势。
- 保留倍速、画中画、全屏、网页全屏、自动横屏和平台支持时的屏幕常亮。“全屏”按钮和桌面双击优先让整个 Crayon 界面进入设备全屏，保留控制栏、设置与手势；元素全屏不可用时使用网页全屏。“网页全屏”另有独立入口。高级接入可通过 `player.fullscreen`、`player.fullscreenWeb` 分别配置。

## 去广告、设备与投屏注意事项

- **统一网页播放**：手机、平板和电脑本地 HLS 均使用 Crayon 的 HLS.js 路径；关闭系统控制条，设置 `playsinline` 和 `webkit-playsinline`。MMS 播放不提供原生 HTTP 备用源；仅在手动选择投屏时安装电视地址。
- **支持范围**：本地 HLS 需要 MSE/MMS；即使浏览器能原生播放 HLS，缺少这些接口时也不会自动切换系统播放器。Crayon 通过网页视频 API 解码，宿主浏览器强制接管视频的行为仍受宿主控制，网页无法保证禁止所有内置浏览器的接管。
- **直连播放**：未配置 `prepareMedia` 的静态部署，或用户主动关闭服务器中转时，使用浏览器直连，按去广告开关决定是否本机过滤；片源须满足 CORS、HTTPS 和编码条件。服务失败不会自动切换路径。投屏去广告需要开启服务器中转和去广告，并使用电视能够访问的服务端清单。
- **时长**：「已过滤」对应的清单应不再有广告 URI，界面时长会缩短；记录保留原片时间，便于开关过滤后恢复。
- **复杂格式**：多轨音频/字幕、直播、LL-HLS、字节范围、fMP4 MAP、DRM 和无法可靠解析的清单保守保留，避免音画错位或无法解密。未命中规则不等于没有广告。
- **音量和自动播放**：部分 iOS 浏览器限制网页音量，需要设备音量键；浏览器可能要求点击播放才能出声，不能绕过系统限制。
- **投屏条件**：设备需满足发现条件，通常在同一网络；电视需支持对应编码、HTTPS 和 HLS。Google SDK 需可访问官方域名，SDK 不可达不影响本地播放。
- **接收端功能**：手动点击投屏后，配套服务支持 AirPlay、Chromecast 的清单过滤；投屏不继承本地片头片尾跳过，不自动推送下一集，不将电视进度同步回网页。Google Cast 使用其控制界面，这里不提供通用 DLNA 控制器。
- **视频地址**：使用媒体地址，不能用需登录的播放网页代替。HTTPS 页面不应加载 HTTP 片源。静态模式需要片源提供所需 CORS。依赖特殊 Cookie、Referer、地区网络或私有地址的上游不保证可用；服务不转发网站 Cookie/Authorization。
- **升级**：覆盖整套静态文件，关闭旧播放页再打开；宿主有 Service Worker/CDN 时更新相应缓存。全屏切换只调整展示方式，不改变播放来源或去广告方式。

## 常见问题

**黑屏或一直加载**：先用公开测试流确认播放器可运行，再检查地址、容器高度、HTTPS、CORS 和编码。不要把 HTML 播放页当 M3U8。

**iPad 检测到广告却还在播放**：确认使用新发行文件，且正在使用 Crayon 的 MSE/MMS 路径。自建加载器不要把原片 `<source>` 加回视频，也不要删除 MMS 的 blob source。配置服务时应实际播放服务准备的过滤清单；投屏去广告需要配套服务。

**手机一直显示加载**：网站应提供能直接调用 Crayon `play()` 的点击播放按钮，以满足有声播放的用户手势限制。准备请求超时会停止加载并提示；HLS 致命错误最多连续恢复 3 次，仍失败会停止并提示，不切换过滤方式或播放器。

**准备接口 401**：刷新播放器页面并输入 `VIEWER_PASSWORD` 重新登录，无需用户名。准备接口使用登录 Cookie，未登录时返回 JSON 401，不再触发浏览器用户名弹窗；自定义服务的 `authorize` 应验证宿主会话，不要把签名密钥作为前端口令。

**是不是只支持某一个资源？**：不是。过滤器按 HLS 清单结构识别插播，包含通用规则与已验证的插播路径规则，不按片源名称限制播放。`no-match` 表示未识别出可安全移除的广告，`unsupported` 表示当前格式保守保留；两者都可以继续播放，不能当成“已经没有广告”。

**清单准备失败或显示 HTTP 状态**：这表示服务读取上游清单失败，可能涉及片源网络、拒绝访问、超时或返回 HTML，区别于未匹配到广告。接口返回 `{ error: { code, upstreamStatus? } }`（兼容旧版纯文本失败响应），不暴露上游地址或响应正文。播放器会区分登录失效、服务未就绪、超时和无效清单；应恢复服务或更换可读取的片源后重试。

**电视 401 或链接过期**：重新准备投屏，确认服务端时钟、有效期及签名密钥未变。电视不应跳转到网页登录页。

**本地能播，电视不能播**：检查电视能否访问签名链接、分片和密钥，以及编码支持；不要发送浏览器 blob 地址。

**换集后进度错乱**：每集使用独立 `storageKey`，销毁旧实例，不混用不同片源或过滤前后时间轴。

## 开发和发布检查

```sh
npm ci
npm run check
npm run worker:types
npm run deploy:check
npm pack
```

`npm run release` 会先完成上述构建与功能检查，再在 `release/` 生成 npm 包、静态网站包、浏览器发行包和 SHA-256 校验文件；不自动公开仓库，也不自动创建远端部署。

- `dist/`：ESM、CommonJS、浏览器脚本、服务端入口与类型声明。
- `demo-dist/`：播放器网站，`build:demo` 是纯静态模式，`build:hosted` 启用同源服务。
- `examples/cloudflare/worker.mjs`：独立部署示例；`examples/embed.html`：直接嵌入示例。
- `test/`：功能、发行文件、MSE/MMS、禁止原生回退、投屏、手势、时间映射与服务鉴权验证。
- `docs/ci-example.yml`：可复制到 `.github/workflows/check.yml` 的 Actions 模板；模板存在不代表远端检查已启用。

自动测试和部署打包不能代替所有实体设备测试。iPad、AirPlay、Chromecast 和片源网络仍需对应设备验证。

## 许可

采用 [CC BY-NC-SA 4.0](LICENSE)，分发时保留 [NOTICE.md](NOTICE.md) 和依赖许可证；商业使用应先确认所需授权。产品名称和界面统一为 Crayon Player，必要的来源与第三方归属集中在许可说明中。
