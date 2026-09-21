# AGENTS.md — 本项目约定

对本项目做任何修改前，先读一遍本文件。README.md 是运维手册，DATA_MODEL.md 是存档结构约定。

## 计算位置（全站硬性约束）

- 全站业务计算放在用户设备：游戏规则、AI 搜索、物理与渲染、图像处理、统计和存档处理均在浏览器执行；耗时任务优先使用 Web Worker / WebAssembly，避免阻塞界面。
- 本站服务器 CPU 较弱，只承担必要的 HTTP 服务、轻量页面模板/目录元数据输出、静态资源分发与健康检查；禁止新增服务端业务计算、模型推理、游戏 AI 服务或计算代理，客户端失败也不能回退到服务器计算。
- AI 对话保留浏览器直连用户配置的模型服务，不经本站代理；模型推理由该服务完成，不宣称在用户设备本地推理。用户已确认无需改成本机模型。
- 新增或更换功能时检查计算位置与网络请求；运行库、WASM 和静态资源同源自托管。构建和测试属于开发运维，不是用户请求的服务端计算。

## 界面与文案

- 界面文案用平实中文，不用比喻和文艺修辞；按钮写明动作结果（如「保存应用」）。
- 站点名称固定为「主页」（`/` 导航页）；游戏集合页标题为「小游戏」。

## 图标（硬性约束）

- **UI 图标**（按钮、开关等界面元素）统一使用 **Bootstrap Icons**：
  - SVG 下载到 `web/static/vendor/bootstrap-icons/` 自托管，国内可从 `registry.npmmirror.com/bootstrap-icons/<版本>/files/icons/<name>.svg` 拉取；
  - 通过 CSS mask 方式着色（参考 home.css 的 `.ti` / `.theme-toggle`，设置 `--icon: url(...)` 即可），不要引入整个字体包，不要用外链 CDN。
- **游戏图标**使用 game-icons.net（CC BY 3.0，页脚已署名）：
  - SVG 放 `web/static/img/`，下载后必须删除自带的黑色底 `<path d="M0 0h512v512H0z"/>`（以及其它实心填充的背景圆），否则 CSS mask 会渲染成整块色。
- **棋牌类贴图**（如雀蛇的麻将牌面）另找有明确开源许可的素材，放 `web/static/img/<游戏>/`，命名与出处写进同目录的 `<游戏>-SOURCES.md`：
  - 雀蛇用 FluffyStuff 的 riichi-mahjong-tiles（CC0 1.0，无需署名），竖版 3:4，只取 34 种牌。
  - 贴图在 canvas 里用 `drawImage` 画。**不要每帧直接贴 SVG**：光栅化开销会把帧率砍掉近一半（雀蛇实测 36 → 19 FPS），要按整数像素尺寸烘到离屏画布缓存，尺寸变化时整表作废。

## 亮暗模式

- 颜色一律使用 home.css 顶部的 design tokens；新增任何硬编码颜色，必须同时补 `html[data-theme="dark"]` 覆盖。
- canvas 里绘制的颜色用 `M.theme.isDark()` 区分，并监听 `window` 的 `themechange` 事件重绘。
- 主题与主页背景图存于 app 级存档槽 `app:appearance`（结构见 schemas.js），首屏主题由 layout.html 内联脚本提前设置，避免闪白。

## 加新内容

- 加游戏：`games.go` 的 `gamesOrder` 注册 → `web/static/js/core/schemas.js` 登记 `main` 槽位 → 新建 `web/static/js/games/<id>.js`（HUD/覆盖层/输入接口见 common.js）。
- 加导航入口：`games.go` 的 `navItems` 加一行 + 对应页面。
- 存档结构：顶层分区固定 best / stats / settings（+可选 session）；改结构时 version+1 并在 migrations 登记迁移函数，禁止散装兼容代码。

## 构建与发布

- 构建：`cd <项目目录> && go build -o bin/homepage .`（前端经 go:embed 内嵌，**改任何静态文件都要重新 build**）。
- 重启：面板 Go 项目 `monet_arcade`（命令见 README「日常运维」）。
- 静态资源 URL 带 `?v=<二进制 mtime>` 指纹，重编译即自动换缓存；本地第三方库（Cropper.js / Bootstrap Icons）自托管在 `web/static/vendor/`，国内从 `registry.npmmirror.com` 拉取。
- 模板循环内引用根级数据用 `{{$.Ver}}`（`{{.Ver}}` 在 range 里会取错作用域）。
