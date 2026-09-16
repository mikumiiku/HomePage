# EB Garamond 拉丁子集（自托管）

- 文件：`eb-garamond-latin-vf.woff2`（33.9KB，222 字形，**可变字体**，wght 400–800）
- 字体：EB Garamond，设计者 Georg Duffner / Octavio Pardo，SIL Open Font License 1.1
- 上游：Google Fonts 官方仓库的 `EBGaramond[wght].ttf`（851KB，3247 字形，全套 OpenType 特性）
  - `https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf`
  - 许可正文：<https://github.com/google/fonts/tree/main/ofl/ebgaramond>
- 下载日期：2026-09-16

## 为什么自己裁而不是直接用 npm 包

`@fontsource/eb-garamond` 的 latin 子集（23KB）在打包时**剥掉了 onum/lnum 特性**，所有数字被固定成等宽 29px——
正是要避免的观感。改用上游可变字体自行子集化，才拿到旧式数字。

## 子集化命令（可复现）

```bash
pyftsubset EBGaramond[wght].ttf \
  --unicodes="U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+2039,U+203A,U+20AC,U+00B0,U+00AB,U+00BB,U+2032,U+2033" \
  --layout-features="onum,lnum,pnum,tnum,kern,liga,rlig,locl,frac,numr,dnom" \
  --flavor=woff2 --output-file=eb-garamond-latin-vf.woff2
```

- 只覆盖拉丁与数字，不含 CJK：中文继续走系统宋体，因此没有引入远程字体，也没有 CJK 字体文件的体积成本。
- 一份可变字体覆盖 400–800 全部字重（`home.css` 的 `@font-face` 声明 `font-weight: 400 800`），
  比两个静态字重文件（48KB）更小。
- 旧式数字由 CSS 的 `font-variant-numeric: oldstyle-nums` 触发，作品目录里的
  2048、成绩、计时因此呈印刷体的高低错落。
- 未纳入 `--no-hinting`；保留字距（GPOS）与连字。

## 缓存说明

`home.css` 里的 `@font-face` 用的是不带版本指纹的路径（CSS 文件里拿不到模板的 `{{.Ver}}`），
静态资源响应头为 `max-age=604800`。字体文件若要更换内容，**必须同时改文件名**，
否则老访客最多一周内仍用缓存副本。同样的情况chat.css 里引用 chevron-down.svg 时已存在。
