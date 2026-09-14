# AGENTS.md — 本项目约定

对本项目做任何修改前，先读一遍本文件。README.md 是运维手册，DATA_MODEL.md 是存档结构约定。

## 界面与文案

- 界面文案用平实中文，不用比喻和文艺修辞；按钮写明动作结果（如「保存应用」）。
- 站点名称固定为「主页」（`/` 导航页）；游戏集合页标题为「小游戏」。

## 图标（硬性约束）

- **UI 图标**（按钮、开关等界面元素）统一使用 **Bootstrap Icons**：
  - SVG 下载到 `web/static/vendor/bootstrap-icons/` 自托管，国内可从 `registry.npmmirror.com/bootstrap-icons/<版本>/files/icons/<name>.svg` 拉取；
  - 通过 CSS mask 方式着色（参考 home.css 的 `.ti` / `.theme-toggle`，设置 `--icon: url(...)` 即可），不要引入整个字体包，不要用外链 CDN。
- **游戏图标**使用 game-icons.net（CC BY 3.0，页脚已署名）：
  - SVG 放 `web/static/img/`，下载后必须删除自带的黑色底 `<path d="M0 0h512v512H0z"/>`（以及其它实心填充的背景圆），否则 CSS mask 会渲染成整块色。

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
