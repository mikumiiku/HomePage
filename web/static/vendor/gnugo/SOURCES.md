# GNU Go 3.8 — 浏览器本地围棋引擎

- 上游：GNU Go，https://www.gnu.org/software/gnugo/ ，稳定版 3.8。
- 原始源包：https://ftp.gnu.org/gnu/gnugo/gnugo-3.8.tar.gz 。本次从 GNU 镜像 https://mirrors.kernel.org/gnu/gnugo/gnugo-3.8.tar.gz 下载。
- 原始源包 SHA-256：`da68d7a65f44dcf6ce6e4e630b6f6dd9897249d34425920bfdd4e07ff1866a72`。
- 许可证：GNU GPL v3 或更新版本，完整文本见 [COPYING](COPYING)。版权所有者及作者见源包的 COPYING、AUTHORS 与各源码头部。
- 浏览器移植参考：https://github.com/TristanCacqueray/wasm-gnugo 、https://github.com/percy1860/weiqi/tree/main/wasm 。本项目从 GNU 官方源包自行编译，未使用这些项目的预编译文件。

## 完整对应源码与构建

同站点提供全部引擎对应源码，不依赖外链才能取得：

1. [原始 GNU Go 3.8 完整源码](source/gnugo-3.8.tar.gz)
2. [本项目 C 接口](source/bridge.c)
3. [完整构建脚本（含补丁）](source/build.sh)
4. [JavaScript 难度适配](../../js/games/go-ai.js) 与 [Worker 接口](../../js/games/go-worker.js)
5. [规则校验源码](../../js/games/go-engine.js)

保留上述目录结构后运行 `bash source/build.sh`。需要 GCC、make、Python 3、Emscripten（本产物使用 3.1.5）；构建脚本在临时目录生成原生棋形生成工具，再生成单线程 WASM。原生程序仅用于构建，不安装为服务器棋力服务。引擎 JS / WASM 由站点同源提供，无 CDN、模型下载、第三方请求或服务端推理。

2026-09-17 的修改：修复 GNU Go 3.8 在新链接器下两处 tentative definition 的重复符号；新增 bridge.c；采用 16 MiB 栈、64 MiB 初始内存、256 MiB 增长上限，保留引擎断言。完整补丁操作在 build.sh 内。桥接及难度/Worker 适配以 GPL-3.0-or-later 提供。源码只在主动下载时传输，玩游戏只加载 gnugo.js 与 gnugo.wasm。

## 接口与难度

保留中国规则、7.5 贴目、禁自杀和位置超级劫。每次搜索重放完整棋谱；GNU Go 内部黑白编码由桥接转换，JavaScript 规则引擎再次验证所有候选及最终落点。Worker 完成一手后复用，悔棋、新局、冲突或失败立即终止旧任务。

| 难度 | GNU Go level | 次优候选策略 |
| --- | --- | --- |
| 低 · 入门 | 0 | 85% 概率从最多 12 个候选中取点，候选内部价值比首选最多低 12 |
| 中 · 训练 | 3 | 55% 概率从最多 5 个候选中取点，候选内部价值比首选最多低 5 |
| 高 · 挑战 | 10 | 使用引擎首选点，不主动削弱 |

只从引擎给出正价值、并经完整规则校验的点中选取；没有合适次优点则采用首选。内部价值是 GNU Go 的启发式评分，不是准确目差。三档均可正常停一手。难度不承诺固定段位，高档仍受 GNU Go 本身棋力上限限制。

加载等待最多 60 秒；计算安全上限低/中/高为 20/30/45 秒，正常速度依设备与局面而定，上限不是人为等待时间。超时或加载失败保留棋谱、提供重试，不更换为旧弱引擎、不自动停一手、不改战绩。无需 WebGPU、SharedArrayBuffer、HTTPS 或跨域隔离。
