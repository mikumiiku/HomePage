# 雀蛇验收记录

2026-09-18，独立预览地址：http://127.0.0.1:8034/game/squek （临时二进制，不碰生产 8023）。
需求来源：用户提供的《麻将贪吃蛇》设计文档 v1.0 共 101 节，按第 89 节 MVP 范围实现。

## 结果

- `node tests/squek_engine_test.cjs`：10 项通过。136 张牌池与每种 4 张、理牌顺序（万筒条字、东南西北中发白）、向听数（和牌 −1 / 听牌 0 / 七对听牌 / 十三幺）、三种和牌型、吃牌收益与危险提示、有效牌统计扣除已见张、弃牌排序优先打孤张字牌、整副牌下 40 次弃牌评估的平均耗时低于 40ms。
- `node tests/squek_ai_test.cjs`：8 项通过。追进张走位、不掉头不出界、被围死返回 null、决策态与无敌蛇不构成障碍、干扰型为对手的进张加价、抢牌型为双方都想要的牌加价、弃牌返回合法下标、开局局面单次决策耗时低于 12ms。
- `python3 tests/squek_test.py`：11 组场景全部通过，浏览器 console.error 与 pageerror 为 0。覆盖开局倒计时与新手说明、四处牌张守恒（手牌 + 场上 + 牌库恒为 136）、朝最近场上牌走位直到吃牌、决策态幽灵、点手牌弃牌后场上补回、查看任意一家公开手牌（只读）、Esc 暂停且对局时钟停走、四种视口（1440×900 / 390×844 / 844×390 / 320×568）棋盘与操作条都不溢出、深色主题重绘、设置面板改难度与关闭向听提示并落存档、重新开始后重新守恒，以及注入「必定胡牌」判定桩后的胡牌横幅、结算面板（胜者名、牌型、十四张牌）、战绩写入与再来一局。
- `python3 tests/game_layout_test.py`：47 组视口用例通过，雀蛇已纳入统一布局回归（设置弹窗、开局点击、几何不溢出、水平居中）。
- `go test ./...`：通过，含雀蛇路由（两类设备 UA）、脚本与样式清单、不向其它游戏泄漏资源、`gamesOrder` 注册、嵌入资源存在性。
- `go vet ./...`、`go build -o bin/homepage .`：通过。
- 帧率：1280×720 桌面视口 + 390×844 手机视口各连测 4 段 4 秒，中位数 58.9 FPS（无 GPU 的 swiftshader 软件渲染，最差 55.1）；场地底与格线按尺寸/主题缓存成一张背景图，牌面字体串按字号缓存，每帧不做 DOM 操作。

截图与状态快照：`/tmp/squek-verification/`（01-start、02-playing、03-discard、04-spectate、05-paused、06-running、07-hu、08-result、04-1440x900 / 04-390x844 / 04-844x390 / 04-320x568、05-dark、report.json）。人工检查了开局画面、对局、弃牌手牌条、观战、暂停、胡牌闪金与结算、竖屏与横屏、深色主题。

## 2026-09-18 第二轮调整（用户反馈）

用户反馈三点：汉字显示异常（黑边盖住字面）、麻将牌面字体不清晰、难度太高。改动与验证：

- 中央横幅去掉 `-webkit-text-stroke`，改为无衬线字体 + 硬阴影；局内短标签改英文（READY / DRAW · PICK ONE / CRASH / RESPAWN / INVINCIBLE / HU，状态牌 TENPAI / n-SHANTEN / CHOOSE / WIN / GHOST / DEALING）；HUD 的四项统计改成自托管 Bootstrap Icons（box-seam / grid-3x3-gap / clock / speedometer2，新下载四个 SVG）+ 数字，含义放在 aria-label 与 title。
- 牌面全部改为矢量绘制（筒=圆点阵、条=带节竹节、万=大号数字、字牌大字或白板空白方框，格子不够大时字牌退化成 E/S/W/N/C/F/P），数字牌不再使用字体；手牌条改为每张牌一块独立小画布（34/40px），与棋盘同一套画法。
- 移动每格 180ms → 360ms；玩家选牌改为日麻式两段计时（12 银秒 + 每局 30 金秒，金秒见底才自动弃牌），手牌条右侧常驻读数与进度条。
- 电脑的吃牌 / 撞击 / 重生改为在它蛇头上弹一行小字（约 1 秒淡出），中央横幅只显示玩家自己的事件。

回归：`node tests/squek_engine_test.cjs` 10 项、`node tests/squek_ai_test.cjs` 8 项、`go test ./...` 通过；`python3 tests/squek_test.py` 12 组通过（新增银秒用完后开始扣金秒的断言），`python3 tests/game_layout_test.py` 47 组通过，浏览器 console 与 pageerror 为 0。截图：`/tmp/squek-verification/11-new-hud.png`（新 HUD 与牌面）、`03-discard.png`（DRAW · PICK ONE + 银/金秒）、`12-cpu-note.png`（电脑蛇头小字 + 中央只报玩家撞击）、`07-hu.png`（HU 横幅）、`04-390x844.png`（手机两行手牌）。

## 已知边界

- 单局不存档：刷新页面即重开，存档只记录战绩与偏好（squek:main v1）。
- Sudden Death（8 分钟后每 20 秒 +5% 速度，上限 160%）与连续死亡惩罚按设计实现，但未做长时对局的实机回归；`game.speed` 可在状态快照里观察。
- AI 只做目标评估 + BFS 路径 + 一步预判，不做多步博弈搜索；抢牌与干扰是启发式权重，不代表最优打牌。
- canvas 里的小字在 320px 宽（格子约 8px）时只显示单字数字与花色条，读清整手牌要靠下方手牌条；这是固定 36×24 网格在窄屏的取舍。
- localStorage 被禁用时退化为内存存档，战绩当次会话有效。

## 发布状态

2026-09-18 用户授权后发布：工作树先提交（`feat: 新增雀蛇（麻将贪吃蛇）小游戏`）再编译，产物经 rename 换入 `bin/homepage`（运行中的旧进程持有旧 inode，直接覆盖会失败），发布前二进制备份在 `/tmp/homepage-before-squek`。重启走面板 HomePage 项目的重启操作，重启后新进程 PID 变化。

发布后核对：`/healthz` 返回 ok；`/`、`/games/`、`/game/snake`、`/game/squek` 均 200；`/game/squek` 引用的五个资源（squek-engine/ai/主脚本、squek.css、domino-tiles.svg）带新二进制 mtime 指纹且全部 200；集合页出现「雀蛇」卡片与新图标。线上浏览器冒烟（全新上下文，无本地存档）：开局到 PLAYING 正常，牌张守恒 136，console 与 pageerror 均为 0，截图 `/tmp/squek-verification/09-prod-games.png`、`10-prod-playing.png`。

## 第二轮发布状态

2026-09-18 用户授权后发布：提交 `fix(squek): 牌面改矢量绘制、局内标签改英文图标、降速并加入银金秒` 后编译，产物仍经 rename 换入 `bin/homepage`，发布前二进制备份在 `/tmp/homepage-before-round2`；面板 HomePage 项目重启后新进程 PID 变化。

发布后核对：`/healthz` 返回 ok；`/`、`/games/`、`/game/snake`、`/game/go`、`/game/squek` 均 200；`/game/squek` 的四个雀蛇资源带新指纹（1789746706），四个新下载的 Bootstrap Icons（clock / speedometer2 / box-seam / grid-3x3-gap）均 200。线上浏览器冒烟（全新上下文）：stepMs 360、金秒 30000、银秒 12000、牌张守恒 136、HUD 图标 5 个、状态牌显示 RESPAWN 1，console 与 pageerror 为 0。截图：`/tmp/squek-verification/13-prod-v2.png`（桌面）、`14-prod-v2-mobile.png`（手机）。

## 2026-09-18 第三轮调整：边界改为循环

用户要求「碰到界面边缘不应该重置，应该是循环的边缘」，据此覆盖原设计文档第 11 节的撞墙死亡：

- 移动：蛇头越界改为取模环绕（`(x + dx + W) % W`），不再有撞墙死亡；死亡原因只剩撞自己与撞到别的蛇。
- 渲染：新增 `wrapPoints()`，跨缝的那一节把上一格换算到相邻副本插值，并在接缝另一侧补画一份（角上四个副本），蛇是「一半出去、一半进来」，不会横穿整块棋盘。
- 电脑：BFS 寻路、风险预判、候选方向全部在环面（torus）上计算，边界不再是 AI 的禁区；身体加长、场上牌刷新也不再排除边界格。
- 文案：开局说明加 WRAP AROUND 一条，旧文案里的「撞墙」已清理。

回归：`node tests/squek_ai_test.cjs` 9 项（新增「路径与预判在循环边界上计算」：空场从 (0,5) 到 (19,5) 距离为 1、蛇头在最右侧时朝边界走才是最近路径）、`node tests/squek_engine_test.cjs` 10 项、`go test ./...`、`python3 tests/squek_test.py` 13 组（新增循环边界用例：一直朝右走，观察到蛇头 x 从 35 跳到 0 且死亡计数未增加）、`python3 tests/game_layout_test.py` 47 组全部通过。

## 第三轮发布状态

2026-09-18 用户要求后发布：提交 `feat(squek): 地图边界改为循环穿越` 后编译，产物经 rename 换入 `bin/homepage`，发布前二进制备份在 `/tmp/homepage-before-round3`；面板 HomePage 项目重启后新进程 PID 变化。

发布后核对：`/healthz` 返回 ok、`/game/squek` 200；线上浏览器冒烟（全新上下文）无 console 与 pageerror，并抓到一条跨缝的蛇（CPU.02 机身 x 覆盖 0 与 35，13 节），确认「一半出去一半进来」的渲染正确，截图 `/tmp/squek-verification/15-wrap.png`。
