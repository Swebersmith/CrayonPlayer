# 在 Cloudflare 控制台部署，并通过 GitHub 自动更新

本教程部署独立的 Crayon Player 页面、去广告清单服务和投屏媒体转发。只需 Cloudflare 账户和仓库访问权限，无需本地安装工具，也无需视频网站、数据库、KV 或 D1。

使用 **Workers Builds** 连接 `Swebersmith/CrayonPlayer` 的 `main` 分支。首次手动配置完成后，推送到 `main` 会自动构建并发布播放器。此部署与接入它的视频网站分别管理。

## 1. 先创建 Worker

1. 在 Cloudflare 控制台打开 **Workers & Pages → Create application（创建应用程序）**。
2. 选择 **Hello World**，创建名为 **`crayon-player`** 的 Worker 并部署。
3. 若已存在自己的 Crayon Worker，可以直接使用它。

控制台的 Worker 名称必须与仓库根目录 `wrangler.jsonc` 中的 `name` 一致。想使用其他名称时，先在自己的仓库修改该字段，再创建同名 Worker。

本仓库已声明两个必需的运行时密钥。直接导入 GitHub 并首次发布，可能因密钥尚未设置而失败。先创建 Worker，才能在下一步填好密钥，再连接仓库。

## 2. 添加运行时密钥

打开这个 Worker 的 **Settings → Variables and Secrets（设置 → 变量和机密）**，添加以下两项，类型均选择 **Secret（机密）**，然后保存并部署：

- `MEDIA_SECRET`：媒体链接的签名密钥。使用密码管理器生成至少 32 字符的随机英文数字字符串。
- `VIEWER_PASSWORD`：访问播放器的口令。设置一个独立的长随机口令。

这两项必须添加在 Worker 的运行时设置中。**Build Variables and Secrets（构建变量和机密）只供构建使用，不能代替这里的运行时密钥。**

密钥值不放进 GitHub、`wrangler.jsonc`、前端代码或播放链接。以后更新代码不需要重新生成；更换 `MEDIA_SECRET` 会使已有投屏链接失效。

## 3. 连接 GitHub 仓库

打开这个 Worker 的 **Settings → Builds（设置 → 构建）→ Connect（连接）**，选择 GitHub 并授权仓库访问权限，然后选择：

- 仓库：`Swebersmith/CrayonPlayer`（使用自己的副本时选择自己的仓库）。
- 生产分支：`main`，开启生产分支自动构建和部署。
- 根目录：仓库根目录，保留默认值 `/`；不要填 `src`、`dist` 或 `demo-dist`。
- 构建命令：`npm run build:hosted`。
- 部署命令：`npx wrangler deploy --keep-vars`。
- 预览命令（开启非生产分支 / PR 预览时）：`npx wrangler preview`。仓库已在 `wrangler.jsonc` 声明 `"previews": {}`，页面资源和兼容性配置仍放在顶层。

预览有独立的运行时密钥。需要预览 PR 时，在 Worker 的 **Settings → Variables and Secrets → Previews Base** 中添加预览用的 `MEDIA_SECRET` 和 `VIEWER_PASSWORD`，类型选择 **Secret**；生产环境已设置的密钥不能代替预览配置。新建的 Preview 会取得 Base 密钥，已创建的 Preview 需要在该预览中单独更新密钥。预览仍通过用户名 `crayon` 和预览的 `VIEWER_PASSWORD` 登录。

Cloudflare 默认会根据 `package-lock.json` 安装依赖；本仓库的 `.node-version` 指定 Node.js 24。不要开启 `SKIP_DEPENDENCY_INSTALL`。如果之前已开启，移除该构建变量，或自行将构建命令改为 `npm ci && npm run build:hosted`。

使用 Cloudflare 自动生成的构建部署凭据即可，不需要把 Cloudflare API Token 交给播放器或写入 GitHub。若仓库没有出现在列表里，检查 GitHub 上 Cloudflare 应用的仓库授权范围。

保存配置并启动首次构建。若没有立即开始，可在构建记录中手动重试，或向 `main` 提交一次更新。首次仓库部署成功后，Hello World 会被 Crayon 页面及服务替换。

不要选择 Pages 的纯静态部署，也不要把命令填成 `npm run build:demo`。完整部署需要 `build:hosted`，以便页面接入同站点的 `/api/player/prepare` 服务。

## 4. 打开并验证

1. 在 Worker 的 **Deployments（部署）** 中确认最新 GitHub 提交的构建和部署均成功，且已成为当前活动部署。
2. 打开 Cloudflare 提供的 HTTPS `workers.dev` 地址。浏览器弹出登录框时，用户名填 **`crayon`**，密码填 `VIEWER_PASSWORD` 的值。
3. 首页显示 Crayon Player 后，可先用默认公开测试视频检查播放、全屏和手势，再粘贴自己的 MP4 / M3U8 地址。
4. 开启去广告后，设置会显示已过滤秒数、未识别出广告或暂不支持过滤。无法读取片源时会显示具体错误，不自动切换原片、本地过滤或其他播放器。
5. 投屏时，电视通过签名媒体地址读取过滤后的清单，不需要网页登录口令。实际可用性仍取决于片源连通性、设备编码支持和投屏发现条件。

0.3.3 起支持 `https://自己的播放器域名/parse?url=编码后的视频地址`，默认只显示播放器。可在首页粘贴视频地址并点击 **生成播放链接**，直接复制完整链接。这里接收 MP4 / M3U8 等媒体地址，不解析任意视频网站网页；访问仍需登录。跨站 iframe 的登录受浏览器限制，详情及 SDK 接入方式见主 README。

如需自己的域名，在 Worker 的 **Settings → Domains & Routes（设置 → 域和路由）** 中添加专用播放器子域名，并等 HTTPS 生效后再使用。

## 5. 后续自动更新

- 修改所连接仓库并推送到 `main` 后，Cloudflare 自动拉取代码、安装依赖、构建页面并部署 Worker。
- 只修改本地文件、创建 GitHub Release 或提交到其他分支，不会更新当前生产分支；PR 合并进 `main` 才会触发对应的生产部署。
- 在 Worker 的构建记录核对提交 SHA，确认访问的是最新活动部署；旧播放页可以关闭后重新打开。
- Worker 上已保存的运行时密钥会在后续部署中继续使用，`--keep-vars` 同时保留控制台设置的普通变量。
- 此连接更新的是独立播放器服务。其他网站直接嵌入这个服务时会使用服务的新版本；把 SDK 源码或脚本复制到网站中的接入方式仍需单独同步并发布网站。

## 常见问题

- **`The following required secrets have not been set`**：检查运行时的两项 Secret 是否保存并部署到了同名 Worker，再重试构建；只填构建变量无效。
- **`Your Wrangler configuration is missing a previews block`**：失败发生在 `wrangler preview`。确认构建使用包含 `"previews": {}` 的最新提交后重试。生产部署命令填 `npx wrangler deploy --keep-vars`，非生产分支 / PR 的预览命令填 `npx wrangler preview`，分别配置；open beta 的 WARNING 本身不会导致失败。预览随后缺少密钥时，按上面的 Previews Base 步骤设置。
- **Worker 名称不匹配**：检查控制台名称与 `wrangler.jsonc` 的 `name`，不要通过随意修改部署目标绕过。
- **一直是 Hello World**：检查 GitHub 构建是否成功、部署命令是否为 `wrangler deploy`，以及新版本是否已成为活动部署。
- **一直提示登录或 401**：用户名是 `crayon`；检查 `VIEWER_PASSWORD` 和浏览器保存的旧登录凭据。
- **显示“请配置 MEDIA_SECRET 和 VIEWER_PASSWORD”**：当前活动版本没有取得两个运行时密钥，回到运行时设置检查并部署。
- **页面打开，但清单失败**：先看页面的具体错误；上游 403/超时、无效清单和服务配置问题与 GitHub 自动更新是不同环节。

完整部署会转发视频分片。请求量、CPU、流量策略和源站对 Cloudflare 出口的访问限制都会影响播放；部署成功不代表所有片源和设备都能播放。

依据 Cloudflare 官方文档：[控制台创建 Worker](https://developers.cloudflare.com/workers/get-started/dashboard/)、[连接现有 Worker 与仓库](https://developers.cloudflare.com/workers/ci-cd/builds/)、[构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[预览配置与密钥](https://developers.cloudflare.com/workers/previews/configuration/)、[构建环境与 Node 版本](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)、[运行时密钥](https://developers.cloudflare.com/workers/configuration/secrets/)。
