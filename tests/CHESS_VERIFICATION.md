# 国际象棋验收记录（2026-09-14）

- `node tests/chess_engine_test.cjs` 通过：初始局面三层 perft=8902、王车易位及穿越将军限制、吃过路兵、四种升变、牵制、将死、逼和、子力不足、三次重复、五十回合、非法/终局后棋谱拒绝。
- `go test ./...` 通过；`go build -o bin/homepage .` 通过。
- `CHESS_BASE=http://127.0.0.1:8045 python3 tests/chess_test.py` 通过：游戏列表入口、本地棋子加载、人机回应、非法走棋、键盘操作、刷新续局、悔棋、查看棋谱、PGN 下载、新局取消、易位、过路兵、升变取消/选择/恢复、将死/和局/认输、结算不重复、执黑、跨标签页冲突、损坏/未来存档不覆盖。
- 1440×1000、1024×768、768×1024、390×844、320×740、844×390 六种视口均无横向溢出，棋盘保持正方形。检查了亮暗主题、减少动态效果、原生选择菜单、升变弹窗及围棋兄弟页面；浏览器无 pageerror。
- 浏览器截图输出 `/tmp/chess-verification/`。所有测试使用独立上下文和预览服务，不读取真实用户存档。
- Premium strict 静态扫描报告 `/tmp/chess-ui-audit-final-output.txt`：国际象棋文件无发现；项目现有 21 项 actionless-button 检测仍存在，涉及聊天、射击和公共模板的动态绑定，非本次新增国际象棋按钮。本次不扩大修改其他应用，也不将全站静态扫描宣称为通过。
- 规则采用 chess.js 0.10.3；三次重复与五十回合在休闲对局中自动判和，界面已说明。电脑为本地限时搜索，未声明 Elo 或专业棋力。
- `python3 tests/chess_failure_test.py` 通过：Worker 不可用时快速合法回应；localStorage 不可用时明确提示且仍可对局。
- 已执行面板 HomePage restart；面板返回成功后端口未监听，按 README 既有方案执行 `systemctl restart homepage-panel-launch`，8023 healthz 返回 ok。公网 http://<服务器地址>/game/chess 独立浏览器复核 HTTP 200、64 格棋盘、白方 e4 与电脑回应均通过，无浏览器错误。
