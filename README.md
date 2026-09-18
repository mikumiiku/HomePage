# 小游戏集合（HomePage）

Go 实现的自制小游戏站：设备自动适配（手机/电脑）、莫奈配色、**所有游戏数据保存在用户浏览器端**。

## 全站计算原则

本站服务器只承担必要的 HTTP 服务、轻量模板渲染、目录元数据输出、静态文件分发及健康检查。游戏规则、棋类 AI 搜索、射击游戏敌人逻辑/物理/渲染、背景图片裁剪、统计与存档处理均在用户浏览器运行；耗时任务使用 Worker / WASM 等客户端机制，不部署服务端计算或客户端故障后的服务器计算回退。

AI 对话保留浏览器直连用户配置的模型服务：本站不代理、不推理；实际模型计算在该服务完成，不能称为用户设备本地推理。此规则适用于后续全站新增功能，硬性约定见 AGENTS.md。构建与测试仍属于开发运维工作。

2026-09-17 已检查所有 Go 请求处理器及自有前端计算/网络入口：未发现本站服务器承担游戏或图像处理等业务计算；`/api/games` 只返回游戏目录元数据，不处理棋局或 AI。

- 线上地址：`http://<服务器地址>/`（公网 80 端口直访）；备选 `http://<服务器地址>:8888/`（需云安全组放行）
- AI 对话：`http://<服务器地址>/home`（原生轻量页面，浏览器直连模型服务，配置和对话仅存本机）
- 技术栈：Go 标准库（`net/http` + `html/template` + `go:embed`，无第三方依赖），前端原生 JS
- 11 个小游戏：国际象棋（通用）、五子棋（通用）、围棋（通用）、沙城突击（3D 枪战，通用）、2048（通用）、贪吃蛇（通用）、雀蛇（麻将贪吃蛇，通用）、记忆翻牌（通用）、扫雷（通用）、俄罗斯方块（电脑/键盘）、指尖快划（手机/触屏）
- 亮暗模式：全站 token 化，右上角太阳/月亮切换（动画交叉旋转），跟随系统 + 手动持久化（app:appearance 槽位）
- 主页背景：亮色为美国国家美术馆公开的《撑伞的女人》高清原画、暗色为自托管《睡莲》1907，主页采用整页背景和连续阅读遮罩，其余页面保留较轻的油画笔触；页头图片按钮上传图片，Cropper.js 框选裁剪后存 localStorage（app:appearance 槽位），亮暗各存一张互不影响，自定义壁纸全站生效（主页铺满、内页作淡笔触底纹）；悬停按钮滑出的重置按钮恢复当前主题的默认油画
- 站点结构：`/` 导航页（`games.go` 的 `navItems` 注册入口）→ `/games/` 小游戏集合 → `/game/<id>` 游戏页；另有 `/about`；导航页「AI 对话」目录行指向 `/home`（浏览器直连）
- 游戏图标来自 [game-icons.net](https://game-icons.net/)（Lorc、Delapouite、Faithtoken，CC BY 3.0），已去除图标自带的黑色底以适配 CSS mask 着色

> 注意：宝塔全局 `proxy.conf` 默认开启 `proxy_cache`，两个站点 vhost 已显式 `proxy_cache off`；
> 静态资源 URL 带 `?v=<二进制mtime>` 指纹，重新 build 后缓存自动失效。

## 目录结构

```
main.go            启动与路由
games.go           游戏注册表（顺序=首页顺序）+ UA 设备检测
handlers.go        页面/API 渲染
web/templates/     layout / home / game 模板
web/static/css/    home.css（设计系统）+ games.css（游戏样式）
web/static/js/core/    store.js（存档抽象）schemas.js（结构登记）common.js（HUD/输入）
web/static/js/games/   每个游戏一个文件
DATA_MODEL.md      用户侧数据结构与兼容策略（先读这个再加游戏）
DESIGN.md          设计约定与 Canonical UI Map
tests/             Go 单测 + Node 引擎测试 + Playwright 浏览器回归
```

## 本地运行

克隆后不需要服务器环境，Go 单测加编译即可跑起来（前端静态资源经 `go:embed` 打进二进制，改前端也要重新 build）：

```bash
go test ./...                          # Go 单测
go build -o bin/homepage .             # 产物同时用于线上部署
./bin/homepage -addr 127.0.0.1:8034    # 换端口，避开线上的 8023
```

各游戏的浏览器回归测试用 Playwright，需要先按该游戏章节的端口启动一份构建再运行对应脚本。

## 日常运维

进程由宝塔面板托管（网站 → Go项目 → HomePage）：面板里可启动/停止/重启/查看日志，已设开机自启。

```bash
tail -f <日志目录>/HomePage.log             # 应用日志（面板项目详情里也有入口）
tail -f <日志目录>/HomePage.access.log      # Nginx 访问日志
```

改代码后重新发布（重编译后重启面板项目）：

```bash
cd <项目目录> && go build -o bin/homepage .
```

重启走面板：网站 → Go项目 → HomePage → 重启。自动化终端下先调用面板的重启操作，再按下面一节核对端口。

（静态资源通过 `go:embed` 打进二进制，改前端也要重新 build。）

若面板返回成功但 8023 端口未监听，使用既有的 `systemctl restart homepage-panel-launch` 启动包装服务；它仍调用面板 HomePage 的启动操作并沿用面板 PID 文件，避免进程随终端会话回收。该包装服务只负责启动；若旧进程仍在运行，先在面板停止项目，再重启包装服务，否则不会替换旧二进制。发布后用 `curl -fsS http://127.0.0.1:8023/healthz` 检查实际服务状态，并核对 `/home` 已渲染新控件。

## 服务拓扑

| 层 | 位置 |
| --- | --- |
| 进程托管 | 宝塔 Go 项目 HomePage，监听 127.0.0.1:8023 |
| Nginx | `<面板 vhost 目录>/nginx/monet-arcade-ip80.conf`（80）与 `monet-arcade.conf`（8888），全部路由指向 Go |
| AI 对话 | /home 原生静态页面，无独立进程、数据库或模型代理 |

## AI 对话（轻量浏览器方案）

用户要求彻底移除 OpenWebUI，采用本站原生 JS + 自托管 Marked / DOMPurify，不引入 Node/Python 服务。调研参考 Anse 的浏览器本地对话存储：https://github.com/anse-app/anse 。Markdown 库与许可证见 web/static/vendor/chat/SOURCES.md。聊天专用 JS/CSS 与第三方运行库共约 110 KB（未压缩），仅打开 /home 时加载。

- 首次使用打开左下角「设置」，填写 Base URL 和 API Key 后点击「连接」。浏览器请求该地址下的 `/models`，成功后保存连接并自动填充输入框下的模型列表，无需手填模型 ID。支持多组连接，重新连接可刷新模型列表。对话偏好可设置连接名称、系统提示词和温度。
- 输入框下直接选择模型和思考等级（默认 / low / medium / high / xhigh / max）；明确选择等级时，通过 `reasoning_effort` 发给服务商，默认不发送此字段。支持情况取决于模型；参数错误时提示切回默认，不自动降级或重复请求。
- 支持 OpenAI 兼容 /chat/completions，浏览器直接发请求；接口需允许 CORS。没有本站代理回退，不自动同步、无账号登录。
- app:chat 槽位存于用户 localStorage。密钥默认遮蔽，用户点击保存才持久化；对话/草稿自动保存在此浏览器，容量不足明确报错，另一标签页修改触发冲突保护。数据结构见 DATA_MODEL.md。
- 流式 SSE 支持分包 UTF-8、停止保留部分回复、错误重试及上下文；非流式 JSON 回复也可接收。请求最长 3 分钟，模型列表读取最长 20 秒。
- Markdown 使用安全过滤，禁止外部图片、脚本、iframe、样式及其他嵌入；外部链接不发送 referrer。密钥只放在直连请求的 Authorization 头，禁止本站接口地址，禁止请求重定向与 cookies。
- 导出仅包含对话，不含配置/密钥；导入验证格式并添加新对话，不覆盖已有记录。最多 100 段对话、每段 500 条消息。
- 验证：python3 tests/chat_test.py（Playwright + 8034 预览服务；临时测试接口监听 8091），覆盖真实浏览器跨域、分块流式、停止、错误、IME、存储、导入导出、手机/深色及本站无聊天 POST。

OpenWebUI 容器、数据卷、镜像、旧凭据文件、定制脚本和 3000 端口规则已移除。旧服务端账号和对话不再保留，也不会迁入新页面。

## 如何加一个新游戏

1. `games.go` 的 `gamesOrder` 里注册一条元数据（ID 稳定、上线后不改）。
2. `web/static/js/core/schemas.js` 登记 `main` 槽位（best/stats/settings 分区约定见 DATA_MODEL.md）。
3. 新建 `web/static/js/games/<id>.js`，用 `M.stage('<id>')` 拿舞台、`M.savegame('<id>')` 存档、
   `M.hud` 更新计分、`M.overlay` 做开始/结束画面，`M.onSwipe` / `M.onDirectionKeys` 接输入。
4. `go build -o bin/homepage . && systemctl restart HomePage`。

首页目录行的最佳成绩、设备过滤、「最近在玩」条都是自动的（没有纪录的成绩不显示）。

## 接口

- `GET /` 导航页
- `GET /games/` 游戏集合页（按 UA 自动过滤；忽略历史 platform cookie 和 URL 参数）
- `GET /game/<id>` 游戏页
- `GET /api/games?scope=all` 游戏列表 JSON（供未来客户端使用）
- `GET /healthz` 健康检查

## 沙城突击

入口 `/game/sandstrike`。原创 CS 风格单人 3D 清场训练：三轮共 15 名敌人、步枪、爆头、掩体遮挡、网格寻路、每轮补给和本地战绩。电脑 WASD 移动、鼠标瞄准、左键射击、R 换弹、Shift 奔跑、Esc 暂停；鼠标锁定不可用时可拖动视角、方向键瞄准、空格射击。手机支持触屏按钮，建议横屏。需要 WebGL，首次加载 Three.js 约 655 KiB、真实材质约 3.8 MiB；不请求外部 CDN。

Three.js 0.160.1（MIT）存放在 `web/static/vendor/three/`，许可证随附。新增游戏图标 crossed-pistols 来自 game-icons.net 的 Lorc，CC BY 3.0，已去除背景。

砂岩、木板与砖地颜色/法线纹理来自 Poly Haven（CC0），均已自托管；来源与许可见 `web/static/img/sandstrike/SOURCES.md`。浏览器回归：`SANDSTRIKE_BASE=http://127.0.0.1:8034 python3 tests/sandstrike_test.py`（需 Playwright Chromium 和测试端口服务）。

战术装备：开局或暂停时选择步枪（30 发）、栓动狙击枪（5 发）或泵动霰弹枪（8 发），另配手枪（12 发）、战术刀和 2 枚破片手雷。1/2/3/4 切换主武器/手枪/刀/手雷，G 快速投雷，C 切换蹲伏；右键切换开镜，R 换弹。狙击枪射击后需拉栓，霰弹枪逐发装填且可打断，切枪保留各自弹药与冷却。手雷引信 2 秒，支持重力、反弹、距离衰减、掩体遮挡和自身伤害；暂停时引信停止。主武器偏好存于 v2 存档，并迁移 v1。

士兵采用 Mixamo Vanguard 的带贴图骨骼模型（Three.js 示例），含独立步行/待机动画，模型来源与使用说明见 `web/static/models/sandstrike/SOURCES.md`。人物资源约 2.1 MiB，仍由本地提供。

沙城训练场更新：可活动范围由约 33×33 米扩展到 65×65 米，中央庭院连通市场外巷、仓库长通道与南北绕行路线，每轮限时 4 分钟。敌人拥有视距/视野、枪声调查、14 秒最后目击记忆、巡逻、搜索、举枪预警、四至五发短点射、掩体转移与换弹。最多三名敌人同时瞄准或点射；感知间隔 0.08 秒，瞄准约 0.27–0.50 秒，仅在视线内跟踪目标。敌弹 220 米/秒，以整段射线检测墙体和玩家，避免高速穿墙；伤害随轮次为 10/12/14。点射间隔 0.12 秒，转移休整 0.85–1.2 秒，12 发弹匣、1.8 秒换弹。利用掩体切断视线可中止攻击。

选枪和操作说明位于场景内开始/暂停菜单，武器栏、生命、弹药与得分也在视口内。右键切换瞄准，松开保持，栓狙拉栓后自动恢复瞄准。鼠标锁定不可用时，左键同样可以开火并拖动视角；切枪/拉栓期间保留一次开火请求。取消 Ctrl 蹲伏，统一 C 切换，避免 Ctrl+W 冲突；游戏区域阻止右键菜单、拖拽、辅助点击、滚轮页面动作，进行中的对局离开页面会触发浏览器离开确认。浏览器或扩展保留的手势无法由网页全面接管。

新增回归：`python3 tests/sandstrike_input_test.py` 使用正式渲染循环实测鼠标、键盘和开镜；`python3 tests/sandstrike_ai_test.py` 验证预警、躲闪、掩体、记忆与地图连通性。两者同样接受 `SANDSTRIKE_BASE`；低内存机器请串行运行浏览器测试。


沉浸式界面：战斗只常驻时间/轮次、生命、弹药和右下纵向武器栏，装备剪影由本地枪模生成；Tab 按住查看地图/战绩，Q 切回上一武器，开始/暂停菜单的「操作与战术」默认折叠。狙击拉栓恢复正常视角并下移枪身，手臂/枪栓分段动作，完成后恢复瞄准。常规操作、击杀、投雷不再弹文字提示。场景增加天空渐变、市场摆设、棕榈、弹痕/弹壳与倒地反馈，建筑按材质合并绘制，原墙体继续参与射线碰撞。

AI 地面视野按真实朝向、警戒状态和墙体遮挡更新；发现目标后等待 0.65 秒，向 24 米内同伴报告当时的位置。同伴按角色搜索左右侧，不引用玩家实时坐标；未发出警报时击倒敌人可阻止传播，单次转告不会无限扩散，保留至多三名同时攻击者和举枪预警/掩体阻挡。新增 `python3 tests/sandstrike_immersion_test.py` 检查拉栓中央视线、剪影、UI 收敛、视野裁切、无线电延迟/范围/快照/中断和分路目标。

玩家迷雾：常规 26 米、约 124° 前方观察角，狙击开镜 48 米；墙体参与遮挡，探索记忆在一局三轮之间保留、新局清空。Tab 地图只显示探索过的地形和当前可见敌人。敌人及其视野线不会通过未探索区泄漏位置；队友警报仍传递历史目击点，AI 不依赖是否被玩家看见而停止行动。玩家世界迷雾使用 `sandstrike-fog.js` 的网格纹理，视角内外的世界材质统一处理；第一人称枪械单独绘制。新增 `python3 tests/sandstrike_fog_test.py` 覆盖迷雾范围、开镜、墙体、转身后的探索记忆、重开清空和敌人/视野线隐藏。滚轮切枪、Q 上一武器均已接入。

枪械后坐力：步枪、栓狙、霰弹枪和手枪拥有不同的真实准星上跳与横向摆动，射击后改变相机与后续弹道；持续扫射积累后坐力，停火逐渐恢复稳定性，鼠标下拉可压枪。瞄准与蹲伏分别将后坐力乘以 0.72。切枪保留各枪的扫射积累，新局清空。AI 回归同时检查高速弹道、掩体碰撞、进攻压力和后坐力。

敌人交战连续性：撤退和侧移时朝向最后确认的威胁，导航方向与观察方向分离；掩体不可用时原地保持警戒，不退回出生点。搜索目标变化即丢弃旧路线；丢失视线后最多调查 14 秒，到达调查点观察 3 秒后可恢复巡逻。搜索与掩体评估只用最后获知的位置。枪声听觉半径为手枪 30 米、步枪 42 米、霰弹枪 46 米、栓狙 54 米；墙体遮挡将半径缩至 60%，刀不产生枪声，手雷爆炸半径 48 米。声音提供约 1.4 米误差的静态声源位置，触发转向与调查，不持续更新隔墙玩家坐标；连发听觉事件限频为 0.3 秒。


## 五子棋

入口 `/game/gomoku`，支持电脑/手机，人机与同屏双人。15×15、黑先、无禁手，五颗及以上连线获胜。人机简单/普通/困难三档预算约 150/600/2000ms；同源 Web Worker 搜索，故障时退回不阻塞页面的分时快速搜索。无需外部 API 或在线模型。

手机默认点按直接落子，可开启「确认后落子」。支持悔棋、提示、手数、自动续局、赛后逐步复盘和本地战绩；使用辅助的棋局单独统计。损坏或未来存档保留原数据，可导出备份；另一标签页修改会暂停本页并提供「加载最新进度」。游戏图标来源见 `web/static/img/gomoku-SOURCES.md`。

验证（浏览器测试使用独立预览端口，不能指向带个人存档的真实浏览器）：

```bash
node tests/gomoku_engine_test.cjs
go test ./...
go build -o /tmp/homepage-gomoku-preview .
/tmp/homepage-gomoku-preview -addr 127.0.0.1:8035
GOMOKU_BASE=http://127.0.0.1:8035 python3 tests/gomoku_test.py
```

截图和验证报告输出到 `/tmp/gomoku-verification/`。五子棋已于 2026-09-11 经面板项目重启发布，入口 `/game/gomoku`。已核实 `homepage-panel-launch` 包装服务的启动目标就是面板项目 HomePage；发布使用「日常运维」中的 HomePage 重启步骤。完整验收与静态检查限制见 `tests/GOMOKU_VERIFICATION.md`。

五子棋布局更新：保留站点页头和「全部游戏」返回入口，棋盘按剩余显示区最大化正方形尺寸，双方信息按屏幕空间切换到上方或侧边；新局设置、悔棋、提示、复盘、棋谱和战绩全部收进「设置」按钮。设置面板独立滚动，固定完成按钮；手机横竖屏和窗口缩放即时适配，不改变 v1 存档。布局验证：`GOMOKU_BASE=http://127.0.0.1:8035 python3 tests/gomoku_layout_test.py`，截图在 `/tmp/gomoku-layout-verification/`。

2026-09-13：五子棋自适应布局已发布。保留站点顶部导航和返回链接，棋盘尽量占满剩余视口，设置统一收进齿轮按钮。10 种视口与 16 组对局场景通过，生产落子和电脑回应复核通过；详细记录见 `tests/GOMOKU_VERIFICATION.md`。

五子棋操作布局：新局设置与本局操作常驻主界面。桌面使用右侧操作栏，手机置于棋盘下方，360px 以下选项逐行显示；允许手机自然滚动以保留棋盘和控件尺寸。显示偏好、棋谱与战绩仍在设置内。布局验证运行 `GOMOKU_BASE=http://127.0.0.1:8035 python3 tests/gomoku_layout_test.py`，截图输出 `/tmp/gomoku-controls-verification/`。

2026-09-13：上述常用操作外置布局已发布，线上落子、电脑回应、悔棋和设置复核通过。

## 围棋

入口 `/game/go`，支持电脑和手机。提供 9、13、19 路人机与同屏双人，采用中国规则、白贴 7.5 目、禁止自杀与全局同形再现；连续停一手后核对死子并按数子法计分。人机使用 GNU Go 3.8（GPLv3+），单线程 WebAssembly 在用户浏览器 Worker 内计算，服务端仅提供静态文件，不运行围棋搜索。无需 WebGPU、外部 API 或服务端模型，普通 HTTP 可用。引擎运行文件约 5.7 MiB，仅在人机首次落子时加载；同一棋局复用已加载 Worker，载入后断网也能继续计算。

低 / 中 / 高分别面向入门 / 训练 / 挑战：GNU Go level 0 / 3 / 10，另以不同概率和价值范围选择次优候选；高档采用首选点。具体参数、源码、许可和可复现构建见 `web/static/vendor/gnugo/SOURCES.md`。不标注未经测量的段位。计算时间随用户设备和局面变化；加载上限 60 秒，计算安全上限 20/30/45 秒。失败或超时保留棋局并显示「重试电脑落子」，也可悔棋或新局，不悄悄退回弱 AI。静态引擎文件同样携带二进制 mtime 指纹。

支持悔棋、认输、自动续局、本地战绩与赛后复盘，不提供提示和棋钟。人机悔棋会撤回玩家最近一手及电脑回应，同屏双人撤回一手。触屏落点按实际网格单元命中并容忍轻微手指抖动；13/19 路默认先选择落点，通过局部放大图核对后确认。损坏或未来存档保留原值并允许导出，跨标签页更新会冻结旧页面。

验证：

```bash
node tests/go_engine_test.cjs
node tests/go_ai_test.cjs
# 可选：三档交替执黑白校准（不是段位评定）
nice -n 15 node tests/go_ai_match.cjs 6
go test ./...
go build -o /tmp/homepage-go-preview .
/tmp/homepage-go-preview -addr 127.0.0.1:8041
GO_BASE=http://127.0.0.1:8041 python3 tests/go_test.py
GO_BASE=http://127.0.0.1:8041 python3 tests/go_ai_browser_test.py
```

截图输出到 `/tmp/go-verification/`；游戏图标来源见 `web/static/img/go-SOURCES.md`。


## 国际象棋

入口 `/game/chess`，提供离线人机（轻松/标准/深入）与同屏双人。标准棋子走法、将军/将死、王车易位、吃过路兵与四种兵升变；休闲对局在逼和、子力不足、三次重复局面及五十回合条件下自动判和。电脑在本地 Web Worker 中进行限时搜索，故障时使用快速合法走法，不请求外部服务。

点击或键盘走棋，显示合法落点、上一手与将军位置。支持选择执棋、翻转棋盘、悔棋、认输、棋谱查看/PGN 导出、自动续局和本地战绩。存档为 chess:main v1；损坏/未来版本保留并允许备份，跨标签页更新暂停旧页面。所有 SVG 和 chess.js 0.10.3 规则库自托管，资源来源与许可见 web/static/img/chess/SOURCES.md 及 web/static/vendor/chess/SOURCES.md。

验证：`node tests/chess_engine_test.cjs`、`go test ./...`；浏览器运行 `CHESS_BASE=http://127.0.0.1:8044 python3 tests/chess_test.py`，需先启动对应端口的构建。截图位于 `/tmp/chess-verification/`，验收记录见 `tests/CHESS_VERIFICATION.md`。


## 雀蛇（麻将贪吃蛇）

入口 `/game/squek`，支持电脑和手机。四条麻将蛇（玩家 + 三台电脑）在 36×24 的网格竞技场里抢场上常驻的四张麻将：吃到一张身体长一节、手牌到 14 张先判胡牌，没胡就要点手牌（或直接点蛇身）打掉一张；地图上下左右是循环的（走出边界从对边回来，不判死亡），撞自己或撞到别的蛇会死亡并换一副起手牌重生，重生后 3 秒无敌。先凑成标准胡、七对子或十三幺的一方获胜，同一 tick 双方同时胡牌记为双胡。

节奏与思考时间：移动每格 360ms（相对首版降速一半）。选牌时间按日麻那套两段计时——每次思考给 12 银秒，用超了才扣每局共用的 30 金秒，金秒见底才自动弃牌；金秒余量常驻在手牌条右侧。难度偏休闲，不靠加快电脑移速制造压力。

界面语言与图形：局内短标签（READY / GO / DRAW · PICK ONE / CRASH / RESPAWN / INVINCIBLE / HU、状态牌的 TENPAI / n-SHANTEN / CHOOSE / WIN）用英文，HUD 的牌库、场上牌数、时间、速度改成自托管 Bootstrap Icons 图标加数字（含义放在 aria-label 与 title）；中央横幅不再用 `-webkit-text-stroke` 描边——描边画在字形之上会盖掉字面颜色，改成新粗野主义的硬阴影。电脑的吃牌、撞击与重生不再占中央大屏，改在它自己的蛇头上弹一行小字。麻将牌面改为矢量绘制：筒子是圆点阵、条子是带节竹节、万子是大号数字、字牌在格子够大时用汉字（白板画成传统空白方框），格子太小时字牌退化成 E/S/W/N/C/F/P 首字母，数字牌完全不依赖字体，小尺寸也不会糊。

规则与 AI 全部在浏览器执行，服务端只发静态文件。麻将引擎（136 张、理牌、向听数、胡牌判定、牌价值）在 `web/static/js/games/squek-engine.js`，三种性格（牌效率 / 抢牌 / 干扰）与三档难度（休闲 / 普通 / 困难，只改判断力与反应频率，不改移速）在 `squek-ai.js`，对局、碰撞与渲染在 `squek.js`。地图与蛇用 canvas 画（逻辑固定步长、渲染 60FPS 插值），手牌条与四家状态牌用 HTML，整体为新粗野主义配色（`web/static/css/squek.css` + home.css 的 `--sq-*` 令牌）。

信息公开：所有蛇身体上的牌面都可见，点状态牌能把任意一家的手牌摊在手牌条上（只读），因此盯别人的听牌、抢别人的进张都是策略的一部分。键盘方向键 / WASD 转向、双击方向有输入缓冲、Esc 暂停；手机在地图上滑动转向。三档难度与向听提示、音效开关在「设置」里。

验证：

```bash
node tests/squek_engine_test.cjs
node tests/squek_ai_test.cjs
go test ./...
go build -o /tmp/homepage-squek-preview .
/tmp/homepage-squek-preview -addr 127.0.0.1:8034
python3 tests/squek_test.py
python3 tests/game_layout_test.py
```

截图与状态快照输出到 `/tmp/squek-verification/`；游戏图标来源见 `web/static/img/squek-SOURCES.md`，验收记录见 `tests/SQUEK_VERIFICATION.md`。


## 小游戏统一布局
2026-09-14：全部游戏按剩余视口等比适配，主游戏界面单屏显示并水平居中；即时操作常驻，新局选项、记录与说明在设置中。此约定替代前文手机游戏页自然滚动与常驻新局设置的旧布局。设置内容独立滚动。浏览器回归：`python3 tests/game_layout_test.py`（8034 预览服务，GAME_BASE 可覆盖），覆盖全部十一个游戏、横竖屏、设置、开局和棋盘实际落子。
