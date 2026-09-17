# 围棋 GNU Go 客户端引擎验收（2026-09-17）

## 实现

用自行编译的 GNU Go 3.8 WebAssembly 替换旧棋形/UCT 引擎。运行在单线程 Web Worker，普通 HTTP 可用；不依赖 GPU、SharedArrayBuffer、外部模型或服务器搜索。运行文件 5.7 MiB，源码包单独提供；许可、对应源码、补丁、构建脚本与校验和在 `web/static/vendor/gnugo/`。

低/中/高分别使用 GNU Go level 0/3/10，次优选点概率 85%/55%/0%、候选上限 12/5/1、内部价值差上限 12/5/0。参数定义唯一 owner 为 go-ai.js。GNU Go 内部价值不等同真实目差，不标段位。所有候选均经现有 GoEngine 完整规则验证，保存规则与 v1 槽位不变，历史战绩保留。

Worker 成功后复用；悔棋、新局、离页或冲突终止旧任务。加载及计算分别显示状态、分别计时；加载失败、WASM 不支持或超时保留棋谱并提供重试，不降级、不自动停一手。无服务端 AI 路由。

## 自动验证

- `node tests/go_engine_test.cjs`：9 组中国规则测试。
- `node tests/go_ai_test.cjs`：43 次实际 WASM 搜索；9/13/19 路、三档、黑白、停一手、吃子、劫、棋谱重放、跨棋盘复用与固定种子，逐点比对 WASM / JavaScript 棋盘，校验 C 输入边界。
- `go test ./...`：通过；静态嵌入检查包括 WASM、许可证、源码、桥接与构建脚本。
- `go build -o bin/homepage .`：通过。
- `GO_BASE=http://127.0.0.1:8042 python3 tests/go_test.py`：14 组浏览器回归，包含真实 Worker 回应、续局、悔棋、迟到结果、新局、计分、跨标签页冲突、损坏/未来存档、配额、禁用存储、触屏定位、19 路确认及亮暗主题。
- `GO_BASE=http://127.0.0.1:8042 python3 tests/go_ai_browser_test.py`：浏览器真实 WASM 的全部 9 个尺寸/难度组合；断网后同一 Worker 连续落子；网络仅同源 GET 静态资源；加载失败与恢复重试；加载超时不改变棋局。截图 `/tmp/go-ai-verification/`。
- agent-browser 检查预览页：81 个交叉点、三档新文案与操作正常，无页面错误。检查手机设置、暗色与错误截图，重试按钮可见可操作。
- `git diff --check`：通过。

全项目 premium strict 静态审计报告 `/tmp/go-ai-premium-audit.json`：21 条现有其他页面的“未检测到按钮动作”报告（动态事件绑定未被该扫描器识别），本次修改的围棋界面/引擎文件 0 条。未为本任务改动无关聊天、主页或射击游戏。此审计不替代浏览器证据。

## 难度校准

`nice -n 15 node tests/go_ai_match.cjs 6`，每个组合 6 局，双方各执黑 3 局，固定种子。18 局全部在双方连续停一手后结束，共 813 手，无非法落子或引擎断言失败。本测试设备实测最慢单手约 2.99 秒；不能据此承诺用户手机耗时。

| 对阵 | 结果 |
| --- | --- |
| 中对低 | 中 6 胜、低 0 胜 |
| 高对中 | 高 5 胜、中 1 胜 |
| 高对低 | 高 6 胜、低 0 胜 |

逐局落点、颜色、死子、胜目与最长耗时保存于 `tests/fixtures/go-ai-calibration.json`。终局用固定 level 10 的 GNU Go 判断死子，再按现有中国数子规则计分；这不是独立裁判，也不是段位认证。小样本主要检查三档区分度，不能保证每盘高档必胜或推断真人段位。用户实际对局仍保留原有人工死子核对流程。

## 选型依据与限制

- GNU Go 官方源码、成熟棋形/战术/死活搜索，GNU GPL v3+；完整对应源码同源提供。
- 比较了 wasm-gnugo、percy1860/weiqi 的浏览器移植经验与 KataGo/web-katrain；从官方 GNU Go 源包独立构建，未拿未知来源 WASM 直接上线。
- KataGo 的浏览器实用模型及运行库加载量更大，本次优先普通 HTTP、低配置客户端与单线程通用性。高档是 GNU Go 完整 level 10 的本地挑战，不是职业/超人棋力。
- 没有实体手机性能测量或人工段位标定；移动视口、触屏行为与真实 Chromium WASM 已测。需要浏览器支持 Worker 和 WebAssembly。

## 发布

已重新构建 bin/homepage，经面板 HomePage 停止旧进程，再由既有 homepage-panel-launch 包装服务启动。8023 healthz 返回 ok；生产 JS、WASM、源码及许可证内容逐字节匹配本次构建，WASM MIME 为 application/wasm。生产隔离浏览器实测选择高档、玩家落子、真实电脑回应、悔棋回到 0 手，无页面错误；截图 /tmp/go-ai-production.png。原生产运行二进制备份 /tmp/homepage-before-go-gnugo。

公网 80 端口页面指纹与生产一致，公开 WASM 内容匹配且 HTTP 200。8041/8042 临时预览已停止。
