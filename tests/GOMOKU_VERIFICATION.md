# 五子棋验收记录

2026-09-11，独立预览地址：http://127.0.0.1:8035/game/gomoku 。

## 结果

- `node tests/gomoku_engine_test.cjs`：23 项通过。四向五连、长连、边界、非法落子、满盘和棋、终局不可继续、棋谱重放、三档电脑必胜/必防、搜索预算、固定种子、活四强制获胜、分时回退及取消。
- `GOMOKU_BASE=http://127.0.0.1:8035 python3 tests/gomoku_test.py`：16 组场景全部通过，浏览器 console.error 和 pageerror 为 0。实际 Web Worker、三档/执白/随机、悔棋/提示/确认、新局弹窗与焦点、迟到消息隔离、刷新续局、复盘、终局去重、辅助统计、跨标签页冲突、坏档/未来存档导出、容量不足/禁止存储及 Worker 故障均覆盖。
- 浏览器使用 Chromium 与真实 CDP 触摸滚动；320/375/768px、亮暗主题、减少动态效果、单一棋盘 Tab 入口、方向键/Enter、原生 select 打开、多指及 pointercancel、主页/集合/2048/关于回归通过。
- `go test ./...`：通过，包含游戏路由、两类设备、公开游戏列表、资源嵌入和其它游戏不加载五子棋资源。
- `go build -o bin/homepage .` 和独立预览二进制构建：通过。预览与原生产服务 `/healthz` 均为 `ok`。
- agent-browser 复核最终页面：225 个交叉点、正确的回合状态、无浏览器错误。

截图与结构化报告：`/tmp/gomoku-verification/`（report.json、desktop-win-light.png、desktop-win-dark.png、mobile-320/375/768-light/dark.png、games-list.png）。人工检查了桌面亮暗、375px 深色和320px浅色截图。

## 静态检查的边界

- `designmd lint DESIGN.md`：0 errors，5 条既有文档 token 警告（min-height/max-height 命名与未引用颜色）。
- Premium strict 全项目审查报告位于 `/tmp/gomoku-ui-audit.json`：21 条既有 actionless-button 检测项，分布在聊天、沙城突击及公共模板；五子棋新增文件 0 项。扫描器未识别这些既有跨文件/帮助函数事件绑定；本次没有为消除全项目扫描输出而修改其它功能。不能把该审查称为全项目通过。
- 此次棋力验证针对固定战术与预算，不代表专业棋力评级或最优解保证。Worker 失败时快速搜索的棋力低于正常困难模式。
- localStorage 无原子事务锁；冲突保护覆盖普通交错编辑，不承诺同时同毫秒写入的事务隔离。

## 发布状态

2026-09-11 用户授权发布后，重新构建 `bin/homepage`，通过 HomePage 面板停止旧进程，再由既有 homepage-panel-launch 包装服务启动新进程。生产健康检查、公网游戏页面、API 游戏入口及四项页面直接加载的五子棋资源均通过。发布前运行二进制已备份至 `/tmp/homepage-before-gomoku`。独立预览由临时 systemd 单元 `homepage-gomoku-preview.service` 托管，使用 `/tmp/homepage-gomoku-preview -addr 127.0.0.1:8035`，不占生产 8023 端口且不随终端退出。结束预览可运行 `systemctl stop homepage-gomoku-preview`；此单元不设置开机自启。

只读核实：`homepage-panel-launch` 包装服务的启动目标就是面板项目 HomePage，生产命令为 `<项目目录>/bin/homepage`。README 中的 HomePage 项目名与实际配置一致，AGENTS.md 中 monet_arcade 的项目名是旧约定。未来发布应使用已核实的 HomePage 面板项目，按 README「日常运维」重启后再检查 8023 的健康检查与 `/game/gomoku` 页面。

发布后浏览器在生产本机地址 127.0.0.1:8023 实测落子与电脑回应成功，无页面错误。公网 IP 导航被 agent-browser 客户端拦截，因此公网检查采用 HTTP 请求验证，未宣称公网浏览器端到端测试。独立预览临时服务已停止，正式入口为 http://<服务器地址>/game/gomoku 。

## 自适应布局发布（2026-09-13）

保留原站点页头、主题按钮及「全部游戏」返回链接的几何位置，棋盘按剩余视口计算最大正方形，双方信息随横竖屏排列，设置与统计收进原生设置对话框。

- 布局测试通过 10 种视口（320px 手机至 1920px 桌面，含 568×320 横屏），检查原页头位置一致、棋盘最大适配、无页面溢出、亮暗模式、弹窗滚动与焦点、旋转和实时调整窗口。
- 原 16 组浏览器对局场景全部通过。布局截图及报告位于 `/tmp/gomoku-layout-verification/`，对局报告位于 `/tmp/gomoku-verification/`。
- 重新构建并经 HomePage 面板停止、homepage-panel-launch 启动发布。运行前二进制备份 `/tmp/homepage-before-gomoku-layout`。
- 生产健康检查通过；公网及本机页面和四项带版本指纹的资源加载通过。本机生产浏览器实测落子、电脑回应、设置打开与关闭、大棋盘适配通过，pageerror 为 0；截图为 `/tmp/gomoku-layout-verification/production.png`。
- 临时预览服务 homepage-gomoku-layout 已停止。

## 常用操作外置复核（2026-09-13）

按用户反馈，新局选项、开始新局、悔棋、提示及终局复盘移出设置弹窗；桌面右栏与手机下方共用同一组控件，不复制事件或存档逻辑。显示偏好、棋谱、规则、战绩仍在设置中。新局操作保留原生确认和取消焦点；操作后将棋盘滚入视野。手机保留大棋盘与至少 44px 操作高度，允许自然滚动。实际查看桌面亮暗及手机截图后修正窄屏选项文字拥挤、重复回合文案与短横屏棋盘高度。

- 对局回归 16 组通过，含 Worker、存档失败、冲突、触屏滚动防误触和原生选择菜单。
- Go 测试通过，预览和发布二进制构建成功。
- DESIGN.md lint 0 errors、5 条既有警告。严格静态审查仍为 21 条既有项目检测项，五子棋文件 0 项，报告 `/tmp/gomoku-controls-audit.json`；不宣称全项目静态审查通过。
- 布局测试更新为验证常用操作在弹窗外、触控高度、桌面最大棋盘、手机自然滚动、页头坐标不变、新局确认与焦点以及窗口实时调整。截图与报告 `/tmp/gomoku-controls-verification/`。

布局 10 种视口及动态缩放全部通过；最终紧凑排版另验 844/568/320/375px 的双方信息不覆盖棋盘、直接新局、落子及悔棋通过。最终截图 `final-320.png`、`final-844.png` 已人工查看。2026-09-13 经 HomePage 面板与 homepage-panel-launch 发布，备份 `/tmp/homepage-before-gomoku-controls`。生产健康、公网带指纹资源、本机生产浏览器直接操作、电脑回应、悔棋与设置均通过，pageerror 为 0；截图 `production.png`。临时预览 homepage-gomoku-controls 已停止。
