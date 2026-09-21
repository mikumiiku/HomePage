# 雀蛇素材来源

## 游戏图标

游戏入口使用 Delapouite 的 Domino Tiles，CC BY 3.0。

来源：https://game-icons.net/1x1/delapouite/domino-tiles.html
自托管文件：`domino-tiles.svg`（下载自 `/icons/ffffff/transparent/1x1/delapouite/domino-tiles.svg`）。
该版本本身没有黑色底路径，可直接用于 CSS mask 着色。

## 牌面贴图

场上、蛇身与手牌条的牌面使用 FluffyStuff 的 riichi-mahjong-tiles，**CC0 1.0（公有领域）**，无需署名。

来源：https://github.com/FluffyStuff/riichi-mahjong-tiles
许可原文：https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/master/LICENSE.md
自托管目录：`squek/`，取自仓库的 `Regular/` 一版（另有 `Black/` 深色版未使用），`viewBox="0 0 300 400"`（竖版 3:4）。

只取了 34 种牌，仓库里的 `Front.svg`、`Back.svg`、`Blank.svg` 与红宝牌（`Man5-Dora` 等）未使用——本游戏没有红宝牌，也不画牌背。

`kind` 与文件名的对应顺序与 `web/static/js/games/squek-engine.js` 的牌定义一致：

| kind | 牌 | 文件 |
|---|---|---|
| 0-8 | 一万..九万 | `Man1.svg`..`Man9.svg` |
| 9-17 | 一筒..九筒 | `Pin1.svg`..`Pin9.svg` |
| 18-26 | 一条..九条 | `Sou1.svg`..`Sou9.svg` |
| 27-30 | 东 南 西 北 | `Ton.svg` `Nan.svg` `Shaa.svg` `Pei.svg` |
| 31 | 红中 | `Chun.svg` |
| 32 | 发财 | `Hatsu.svg` |
| 33 | 白板 | `Haku.svg` |

贴图为传统画法：`Sou1`（一条）是孔雀图案而不是竹节，`Pin1`（一筒）是同心圆花，字牌用繁体字形。
