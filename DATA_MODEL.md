# 数据模型 · 用户侧存档设计（v1）

> 本站所有游戏数据都保存在**用户自己的浏览器**（localStorage），服务端零存档、零跟踪。
> 本文是第一版（envelope version 1）的结构约定。设计目标：**向前兼容**——未来加功能、改结构时，
> 老玩家的存档不丢、不迁移成本不高，也不必堆积"向后兼容"的补丁代码。

## 1. 键名与信封（Envelope）

每个存档单元是一个「槽位 slot」，localStorage 键名：

```
homepage:e<ENV>:<gameId>:<slotName>
        └ 信封版本，当前 1
```

值是 JSON 信封：

```json
{ "v": 1, "t": 1725490000000, "d": { ...数据... } }
```

| 字段 | 含义 |
| --- | --- |
| `v` | 该槽位**数据结构**版本号，迁移机制的依据 |
| `t` | 最近写入时间戳（ms），调试/展示用 |
| `d` | 业务数据，顶层只允许下面约定的「稳定分区」 |

键名里的 `e1` 与信封里的 `v` 分工不同：`e1` 只在**键名格式或信封字段本身**变化时 +1（那时直接换前缀、旧键整体废弃或一次性搬家）；`v` 是每个槽位各自的**业务结构**版本，用于日常的渐进迁移。

## 2. 数据分区的顶层约定（所有游戏一致）

```
d = {
  best:     { ... },   // 纪录：最高分 / 最快时间 / 最少步数，只增不减
  stats:    { ... },   // 累计统计：局数、总步数等，单调累加
  settings: { ... },   // 玩家偏好：难度选择、开关等
  session:  null,      // 进行中的对局（可选；没有对局功能时省略或置 null）
}
```

规则：

1. **顶层分区名是稳定接口**。新增字段一律挂进对应分区，不新造顶层键。
2. 新游戏若没有某分区的需求，保留空对象或省略该键（读取时 defaults 会补齐）。
3. `best` 里的键是"度量名"（score / seconds / moves / …），嵌套键（如 `easy` / `hard`）表示难度。
   难度名的命名空间归游戏自己，但**难度键一旦上线不可改名**（改名 = v+1 迁移）。

## 3. 结构登记与迁移（core/schemas.js）

所有游戏槽位的结构集中在 `web/static/js/core/schemas.js` 一处登记：

```js
App.store.defineSlot('2048', 'main', {
  version: 1,
  defaults: () => ({ best: { score: 0, maxTile: 0 }, stats: { games: 0 }, settings: {}, session: null }),
  // 未来结构变化示例：
  // version: 2,
  // migrations: {
  //   1: (d) => { d.best.maxTile = d.best.maxTile || 0; return d; }, // v1 -> v2
  // },
  bestText: (b) => b && b.score > 0 ? '最高 ' + b.score + ' 分' : null,
});
```

读取流程（`App.store.load`）：

```
读信封 → v > 当前版本? → 标记 fromFuture（只读，拒绝写回，防降级覆盖）
       → v < 当前版本? → 链式执行 migrations[v]（v → v+1 …）
       → defaults 补齐缺失字段（backfill，递归，只补缺不改值）
```

写入流程（`App.store.save`）：整体写回 load 出来的对象 + 当前版本号。
**游戏代码只改自己认识的键，天然保留未知字段**——这就是"不需要向后兼容补丁"的关键：
v2 代码读 v1 存档靠 defaults 补齐；v1 代码（理论上）遇到 v2 存档会被 fromFuture 保护。

## 4. App 级槽位（跨游戏数据）

同一个机制，`gameId = 'app'`：

| 槽位 | 结构 | 用途 |
| --- | --- | --- |
| `app:activity` | `{ counts: {gameId: 次数}, recent: [{g, t}] ≤12 }` | 首页「最近在玩」 |

未来可加：`app:profile`（昵称/头像）、`app:settings`（全局偏好）等，同样是 defineSlot 一行登记。

## 5. 当前各游戏槽位结构

| 游戏 | 槽位 | best | stats | settings | session |
| --- | --- | --- | --- | --- | --- |
| gomoku | `main` | `{streak}` | `{buckets}` | `{mode,level,color,confirm,numbers}` | `{id,settings,human,moves,assisted,result,settled}` |
| go | `main` | `{streak}` | `{buckets}` | `{mode,size,level,color,confirm,numbers}` | `{id,settings,human,moves,phase,dead,confirmations,result,settled}` |
| 2048 | `main` | `{score, maxTile}` | `{games, totalMoves}` | `{}` | `{board[16], score, won}` |
| snake | `main` | `{score}` | `{games, foodEaten}` | `{}` | — |
| memory | `main` | `{easy:{moves,seconds}, hard:{moves,seconds}}` | `{games}` | `{difficulty}` | — |
| minesweeper | `main` | `{easy:{seconds}, hard:{seconds}}` | `{games, wins}` | `{difficulty, flagMode}` | — |
| tetris | `main` | `{score, lines}` | `{games}` | `{}` | — |
| sandstrike | `main` | `{score}` | `{games, wins, kills, headshots}` | `{sound, primary}` | — |
| swipe | `main` | `{score, combo}` | `{games, arrows}` | `{}` | — |

## 6. 加新游戏 / 改结构的标准动作

**加游戏**：`games.go` 注册元数据 → `schemas.js` 登记 `main` 槽位 → 新建 `games/<id>.js`。存档、首页最佳成绩、「最近在玩」全部自动生效。

**改结构**：`version + 1`，`migrations` 加一条纯函数（旧数据 → 新数据），defaults 同步更新。不要在游戏代码里写"if (typeof old === 'undefined')"式的散装兼容。

**放弃旧结构**：若迁移链过长，可以在某个大版本把键前缀 `e1` 升到 `e2` 做一次性的"换仓"，配合读取旧前缀搬家一次，之后彻底干净。

## 7. 已知边界

- localStorage 被禁用/隐私模式：自动退化为内存存档（本次会话有效），`backendKind()` 可探测。
- JSON 损坏：视为空存档重新开始（原值留在键里可人工排查）。
- 配额超限：写入失败时 toast 提示，游戏继续可玩。

沙城突击 `main` 槽位 v2：新增 `settings.primary`（rifle / sniper / shotgun）；v1 → v2 迁移设为 rifle，保留战绩、音效及未知字段。每局弹药、姿态和手雷仅驻留内存，不存续局。

## AI 对话：app:chat（v2）
localStorage 键 homepage:e1:app:chat，沿用 App.store 信封，服务端不接收存档。
best / stats 保留空对象；settings 包含 profiles（id/name/base/key/model/models/reasoning/system/temperature）与 selected；session 包含 active 与 threads。每段对话包含 id/title/time/draft/messages，消息包含 id/role/content/reasoning/model/state/time。支持最多 100 段、每段 500 条；容量不足保留内存数据并提示导出，不自动删历史。多标签页修改触发冲突只读，先导出再刷新；更高版本数据只读。模型密钥经用户点击连接并成功获取模型后存于该浏览器，不出现在导出文件、URL、服务器请求或日志。导出格式 homepage-chat version 1 只包含 threads；导入验证并生成新 ID，不覆盖模型配置。

app:chat v1 → v2：每个连接新增 models（从 /models 获取、去重排序的模型 ID 数组）与 reasoning（空字符串表示默认，或 low/medium/high/xhigh/max）。迁移将旧 model 包装为单元素 models，reasoning 设为空；保留密钥、历史、草稿和未知字段。当前连接由 settings.selected 指定，model 为该连接最后选择的模型；重新连接优先保留仍在列表中的模型，否则选首个。连接失败或存储失败不覆盖旧配置。

## 五子棋（gomoku:main，v1）

键 `homepage:e1:gomoku:main`，信封版本与结构版本均为 1。新增游戏不改其它槽位。

- `best.streak`：跨难度的最佳无辅助人机连胜。
- `stats.buckets`：键为 `ai:easy` / `ai:normal` / `ai:hard` / `local`。每项含 `wins` / `losses` / `draws` / `assisted` / `streak` 非负整数；人机胜负从玩家视角统计，双人 wins/losses 分别为黑胜/白胜。辅助局单独计数并结束当前连胜，不重复计入无辅助胜负。未完成局不计战绩。
- `settings`：`mode` 为 ai/local；`level` 为 easy/normal/hard；`color` 为 black/white/random；`confirm` 与 `numbers` 为布尔值。默认 ai/normal/black/false/false。
- `session`：null 或 `{id, settings, human, moves, assisted, result, settled}`。settings 是开局设置快照；human 为 1（黑）或 2（白），随机执棋也保存实际结果；moves 为 0–224 的落点索引（从左上逐行排列），黑先交替，无单独棋盘副本；result 为 null（未结束）、0（和）、1（黑胜）、2（白胜）；settled 标记战绩已写入。

每次有效落子、悔棋、提示使用和偏好变更均保存，终局战绩和 settled 同一信封写入，恢复时不重复结算。终局保留棋谱用于只读复盘，新局替换 session。重放校验拒绝重复、越界和终局后续落子，校验实际胜负与保存结果一致。损坏/未来存档保持原字符串不写回，提供原存档导出，并允许内存临时对局；不自动降级修复。读取缺省字段仍由 schemas/store 的既有 backfill 负责。

游戏通过 storage 事件及写入前比较检测其他标签页更新，暂停操作后需加载最新进度。此机制用于避免常规交错编辑；localStorage 无事务锁，不提供多标签页同时同毫秒写入的原子事务保证。无服务端存档和网络对战。

## 围棋（go:main，v1）

键 `homepage:e1:go:main`，结构版本为 1；服务端不保存棋局。

- `best.streak`：跨棋盘尺寸和难度的人机最长连胜。
- `stats.buckets`：键为 `ai:<size>:<level>` 或 `local:<size>`，每项包含 `wins` / `losses` / `draws` / `streak`。人机按玩家视角统计；双人 wins/losses 分别表示黑胜/白胜。未完成局不计战绩。
- `settings`：`mode` 为 ai/local；`size` 为 9/13/19；`level` 为 easy/normal/hard；`color` 为 black/white/random；`confirm` 为 auto/always/never；`numbers` 为布尔值。默认 ai/9/normal/black/auto/false。
- `session`：null 或 `{id, settings, human, moves, phase, dead, confirmations, result, settled}`。`moves` 使用左上起逐行索引，`-1` 表示停一手；`phase` 为 play/scoring/ended；`dead` 保存计分时按整组展开后的死子索引；`confirmations` 保存黑白确认状态；`result` 保存胜方、score/resign 原因、双方分数与胜目；`settled` 防止重复结算。

棋盘从棋谱重放，不另存盘面与提子数。计分使用中国数子法，盘上棋子与围住空点计入面积，白方加 7.5 目，提子不重复计分。有效落子禁止自杀和所有此前出现过的全盘局面；停一手允许盘面重复。计分争议选择继续对局时保留棋谱并恢复落子阶段。

每次落子、停一手、悔棋、死子调整、确认、认输和终局结算均写回同一信封。悔棋直接截短棋谱后重放，不新增存档字段：人机局回到玩家最近一次落子前，同屏双人撤回一手；计分核对阶段悔棋会恢复落子阶段并清空死子及确认状态，终局后不可悔棋。损坏/未来存档保持原字符串不写回，并允许导出和内存临时对局；storage 事件与写前比较用于阻止跨标签页静默覆盖。

## 国际象棋（chess:main，v1）

键 `homepage:e1:chess:main`。`best: {wins}` 为人机累计获胜次数；`stats: {games,wins,draws}` 为完成局数、人机获胜局数与所有模式和局数。`settings: {mode,level,color}`，mode=ai/local，level=easy/normal/hard，color=w/b；默认 ai/normal/w。`session` 为 null 或 `{settings,moves,result,settled}`，settings 保存本局设置快照，moves 为从初始局面开始的 SAN 字符串数组。result 为 null 或 `{winner,reason}`，winner=w/b/null，reason 为将死、逼和、子力不足、三次重复局面、五十回合规则或认输。settled 与终局结果同次保存，防止刷新重复计数。
恢复时由棋谱重放校验，拒绝非法棋谱及不一致结果。悔棋截短棋谱再保存；人机撤回玩家一手及电脑回应，双人撤回一手，终局不能悔棋。不保存派生棋盘、翻转与查看棋谱位置。保留未知字段；损坏/未来存档不写回并提供原文件导出，跨标签页变更冻结操作。隐私模式退化内存时明确提示。
