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
- canvas 里的小字在 320px 宽时仍然吃力：格子约 12px，牌面高不到 10px。棋盘格数已按可用区域自适应（窄屏重铺成 18×18 一类的方阵），但 320×568 这类设备上棋盘高度只剩 200px 左右，受「行列不小于 18 格」的硬下限限制，格子撑不上去；横屏手机（844×390，可用高约 128px）同样是高度受限，根因是状态牌与手牌条占掉 232px，属于 HUD 布局问题，需要单独的横屏紧凑方案。读清整手牌靠下方手牌条。
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

## 2026-09-18 第四轮调整：牌头

用户要求增加「牌头」概念：吃进牌时先不排牌，整手往后顺一位、蛇头就是这张新牌，打出之后才排牌。

- 吃牌：`s.hand.unshift(新牌)`，不再 `sortHand`；配合移动阶段「头进尾不退」，`segments[0]` 与 `hand[0]` 恰好都是刚吃进的牌（沿用第 8 节 `display[i] = hand[i]` 的映射）。
- 弃牌：`doDiscard()` 里删牌、收尾后再 `sortHand()`，这时才重新映射牌面；开局发牌与重生仍然直接排好。
- 手牌条：14 张时把牌头挪到最右，前面插入一个宽度等于一张牌的 `.sq-gap` 空位（日麻摸牌位）；查看电脑手牌时同样如此，因此看蛇头就知道它刚摸到什么。
- 调试快照新增 `headTile` / `handKinds` / 场上牌 `name`，供回归断言使用。

回归：`python3 tests/squek_test.py` 13 组通过，其中新增断言——吃牌后 `hand[0]` 等于「按吃牌前场上的位置找到的那张牌」、`hand[1:]` 等于吃牌前的 13 张顺序、`headTile` 一致、手牌条出现且仅出现一个 `.sq-gap`、最后一格是牌头；弃牌后 `handKinds` 已排序且空位消失。`node tests/squek_engine_test.cjs` 10 项、`node tests/squek_ai_test.cjs` 9 项、`go test ./...`、`python3 tests/game_layout_test.py` 47 组全部通过，截图 `/tmp/squek-verification/16-head-tile.png`。

## 第四轮发布状态

2026-09-18 用户要求后发布：提交 `feat(squek): 增加牌头，吃牌不排牌、打出后再理牌` 后编译，产物经 rename 换入 `bin/homepage`，发布前二进制备份在 `/tmp/homepage-before-round4`；面板 HomePage 项目重启后新进程 PID 变化。

发布后核对：`/healthz` 返回 ok、`/game/squek` 的脚本带新指纹（1789831613）；线上浏览器冒烟（全新上下文）无 console 与 pageerror，抓到一次玩家吃牌：`headTile` 与 `hand[0]` 同为 8条、手牌条出现 1 个牌头空位、最后一格是「打出八条」，截图 `/tmp/squek-verification/17-prod-head.png`。

## 2026-09-21 第五轮调整：牌面改用 CC0 贴图 + 窄屏自适应棋盘

用户反馈「雀蛇游戏的场上牌用英文比较难识别」。定位结果不是素材问题：`drawHonor` 用汉字画字牌的条件是 `bh >= 15`，而场上牌的内边距是 `cell * 0.12`、蛇身牌是 `cell * 0.10`——格子 26px 时两者牌面高分别是 14.8px 与 15.4px，刚好卡在阈值两侧，于是只有场上牌退化成 `E/S/W/N/C/F/P`。手机上格子只有 8-11px，整场都是字母。

改动：

- 牌面换成自托管贴图 `web/static/img/squek/`（FluffyStuff 的 riichi-mahjong-tiles，CC0 1.0，34 张 SVG，竖版 3:4），按 kind 顺序对应万、筒、条、东南西北中发白；方块格子里按 3:4 居中放置，不再画顶部花色条。程序化画法与字母退化路径全部删除，只留「象牙白底 + 花色顶条」的加载占位。
- SVG 每帧光栅化会把帧率砍掉近一半（实测 1440×900 无头 Chromium 36 → 19 FPS），并连带让回归测试里的元素点击超时（Playwright 的稳定性判定要求连续两帧一致，帧率一低就永远等不到）。改为按整数像素尺寸烘到离屏画布再贴（`ART_SPRITES`，格子尺寸或设备像素比变化时整表作废），帧率回到 33 FPS（基线 31）。
- 棋盘格数在开局时按可用区域定一次、整局不变：桌面与笔记本沿用 36×24；只有格子小于 17px 才重铺（手机 390×844 → 18×22，格子 20px）。行列各不小于 18 格，因为 `pickSpawn` 要把 13 节蛇身连同前方两格放进棋盘。
- `App.squek.state()` 增加 `w` / `h` / `cell`，测试不再硬编码 36×24。

回归：`node tests/squek_engine_test.cjs` 10 项、`node tests/squek_ai_test.cjs` 9 项、`go test ./...` 通过；`python3 tests/squek_test.py` 16 组通过（新增「34 张贴图都能加载」与「宽屏沿用 36×24、窄屏减格数」两组），`python3 tests/game_layout_test.py` 47 组通过，console 与 pageerror 为 0。人工核对四档视口：1440×900（36×24，牌面高 20.8）、1024×768（36×24，16.0）、390×844（18×22，16.0）、320×568（18×18，9.6），棋盘居中不溢出，字牌东/南/西/北/中/发/白与万筒条都能认。


## 第五轮发布状态

2026-09-21 用户授权后发布：提交 `d81dc93` 后编译，产物先落到 `bin/homepage.new` 再 rename 换入 `bin/homepage`（运行中的旧进程持有旧 inode，直接覆盖会 ETXTBSY），发布前二进制备份在 `/tmp/homepage-before-round5`。

**重启方式记一笔**：先用 `systemd-run --unit=... ` 起临时单元调面板的 `GoProjectControl('HomePage','restart')`，面板返回「重启成功」、新进程也打印了监听日志，但进程随该临时单元的 cgroup 一起被回收，8023 随即断开。改用 README 记录的 `systemctl restart homepage-panel-launch` 包装服务后恢复（新进程 PID 857108）。**以后发布直接用包装服务，不要用 systemd-run 临时单元调 restart。**

发布后核对：`/healthz` 200；`/`、`/games/`、`/game/squek` 均 200；雀蛇四个资源带新指纹（1789980406）；抽查 `Ton.svg` / `Haku.svg` / `Sou1.svg` / `Man1.svg` 均 200。线上浏览器冒烟（全新上下文，无本地存档）：1440×900 棋盘 36×24、格子 26；390×844 棋盘 18×22、格子 20；34 张贴图全部加载，牌张守恒 136，console 与 pageerror 为 0。

## 2026-09-21 第六轮调整：开局先发牌、点 READY 再倒计时

用户要求：点「开始游戏」后先把牌分配好，让用户看完手牌，再点中间的 Ready 按钮才进倒计时。

- 新增 `READY` 阶段（`MENU / READY / COUNTDOWN / PLAYING / OVER`）：`newGame()` 把牌全部发好、四条蛇摆好、场上四张牌补齐，然后停在这里。`timers()` 在 `READY` 不推进任何逻辑，对局时钟 `time` 保持 0，蛇一格都不动。
- 中央新增常驻的原生 button `.sq-ready`（`frame` 下的独立一层，只用 `hidden` 切换）：`--sq-bg` 底、`--sq-player` 字、3px 粗黑描边 + 5px 硬阴影，字号跟随横幅的 `clamp()`，四套视口都在棋盘外框内。出现时自动聚焦，键盘与读屏走原生路径，中文含义放 `aria-label`（「手牌已发好，点这里开始倒计时」）。
- 点按钮才 `beginCountdown()`：设 `countdownEnd = now + 3000` 并进 `COUNTDOWN`。倒计时从 3.2 秒改成 3 秒、每秒一个数字，中央不再重复显示 READY（那个提示已经由按钮承担）。
- `.sq-msg` 是 `pointer-events: none` 的纯文字层，按钮不做它的子节点，否则 `showMsg()` 的 `textContent` 赋值会连带把按钮抹掉。
- 发牌阶段仍然可以点四家状态牌翻看别人的手牌（牌都公开），打完再看「所有蛇的牌都公开」这条规则不受影响。
- 播报改成「新的一局：十三张手牌已发好，看完点准备开始」，点按钮后播报「倒计时开始」。

回归：`python3 tests/squek_test.py` 17 组通过（新增 ready 用例：`READY` 阶段中间显示准备按钮且中央无横幅文字、场上四张、四家各十三张且身体 13 节、手牌条已摊开十三张；停 1.2 秒后仍在 `READY`、`time` 仍为 0、四家蛇头坐标未变；点按钮后 3/2/1 → GO → PLAYING）。所有点「开始游戏 / 再来一局 / 重新开始」的地方都改成经 `start_round()`（等 `READY` → 点按钮 → 等 `PLAYING`）。`go test ./...`、`python3 tests/game_layout_test.py` 47 组通过；五档视口（1440×900 / 1024×768 / 390×844 / 320×568 / 844×390）实测按钮都在棋盘外框内、命中测试落在按钮上，pageerror 为 0。
