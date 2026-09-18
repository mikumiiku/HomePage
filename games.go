package main

import (
	"net/http"
	"regexp"
)

// 平台视角：desktop / mobile / all（all 仅作为"站点视角"，不出现在游戏的 Platforms 里）
const (
	PlatformDesktop = "desktop"
	PlatformMobile  = "mobile"
	PlatformAll     = "all"
)

// Game 是一款游戏的唯一注册信息。
// 增加新游戏时：在这里加一条注册项，在 web/static/js/core/schemas.js 里登记存档结构，
// 再新建 web/static/js/games/<ID>.js 实现即可，服务端其他代码不用动。
type Game struct {
	ID          string   `json:"id"`        // URL 与存档命名空间使用的稳定标识，上线后不可更改
	Title       string   `json:"title"`     // 展示名
	Tagline     string   `json:"tagline"`   // 首页卡片一句话简介
	Icon        string   `json:"icon"`      // 卡片图标（emoji）
	Accent      string   `json:"accent"`    // 卡片主题色（莫奈色板取色）
	Platforms   []string `json:"platforms"` // 适配的平台：desktop / mobile，两者都有表示通用
	HintDesktop string   `json:"hint_desktop"`
	HintMobile  string   `json:"hint_mobile"`
}

func (g Game) Badge() string {
	if len(g.Platforms) >= 2 {
		return "通用"
	}
	if len(g.Platforms) == 1 && g.Platforms[0] == PlatformMobile {
		return "手机"
	}
	return "电脑"
}

// DeviceLabel 展签上对输入方式的纯文本描述（替代胶囊徽章）。
func (g Game) DeviceLabel() string {
	if len(g.Platforms) >= 2 {
		return "键盘与触屏"
	}
	if len(g.Platforms) == 1 && g.Platforms[0] == PlatformMobile {
		return "触屏"
	}
	return "键盘"
}

func (g Game) BadgeClass() string {
	if len(g.Platforms) >= 2 {
		return "any"
	}
	if len(g.Platforms) == 1 && g.Platforms[0] == PlatformMobile {
		return "mobile"
	}
	return "desktop"
}

func (g Game) Supports(p string) bool {
	for _, x := range g.Platforms {
		if x == p {
			return true
		}
	}
	return false
}

func (g Game) Hint(p string) string {
	if p == PlatformMobile {
		return g.HintMobile
	}
	return g.HintDesktop
}

// gamesOrder 决定首页展示顺序。Icon 是 web/static/img/ 下的图标文件名（game-icons.net）。
var gamesOrder = []Game{
	{
		ID: "chess", Title: "国际象棋", Icon: "chess-knight", Accent: "#306838",
		Tagline:     "将死对方国王，支持人机与同屏双人。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "点击棋子，再点击目标格走棋；方向键选择格子，Enter 或空格确认。",
		HintMobile:  "轻触棋子查看可走位置，再轻触目标格走棋。",
	},
	{
		ID: "gomoku", Title: "五子棋", Icon: "go", Accent: "#306838",
		Tagline:     "连成五子即可获胜，支持人机与同屏双人。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "点击交叉点落子；棋盘内可用方向键移动，Enter 或空格落子。",
		HintMobile:  "轻触交叉点落子；可开启「确认后落子」，滑动棋盘可滚动页面。",
	},
	{
		ID: "go", Title: "围棋", Icon: "encirclement", Accent: "#bfa64f",
		Tagline:     "通过围地和提子取胜，支持全尺寸人机与同屏双人。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "点击交叉点落子；棋盘内可用方向键移动，Enter 或空格落子。双方连续停一手后核对死子并计分。",
		HintMobile:  "9 路轻触直接落子；13 路和 19 路先选点，再核对局部放大图并确认落子。",
	},
	{
		ID: "sandstrike", Title: "沙城突击", Icon: "crossed-pistols", Accent: "#b7a468",
		Tagline:     "第一人称 3D 枪战，利用掩体完成三轮清场。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "WASD 移动，鼠标瞄准，左键或空格射击，右键切换开镜，R 换弹，C 切换蹲下，Shift 奔跑，1—4 切换武器，G 投雷，Esc 暂停。主武器可在开局或暂停时选择。",
		HintMobile:  "左侧按钮移动，拖动场景瞄准，右侧按钮射击、蹲下、开镜或投雷，下方切换武器和换弹。建议横屏或全屏游玩。",
	},
	{
		ID: "2048", Title: "2048", Icon: "number-2", Accent: "#7fa3b8",
		Tagline:     "滑动合并相同的数字，合成 2048。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "方向键 / WASD 滑动棋盘，R 键重开；中途退出会自动存档。",
		HintMobile:  "向四个方向滑动棋盘；中途退出会自动存档，回来接着玩。",
	},
	{
		ID: "snake", Title: "贪吃蛇", Icon: "snake", Accent: "#86a678",
		Tagline:     "吃食物变长，撞到自己就结束。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "方向键 / WASD 转向，越吃越快。",
		HintMobile:  "在棋盘上向任意方向滑动转向，越吃越快。",
	},
	{
		ID: "squek", Title: "雀蛇", Icon: "domino-tiles", Accent: "#a8523f",
		Tagline:     "四条蛇在场上抢麻将，先凑成胡牌的一方获胜。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "方向键 / WASD 转向，吃到牌后在 5 秒内点手牌打出一张；Esc 暂停。",
		HintMobile:  "在地图上滑动转向，吃到牌后轻触手牌打出一张。",
	},
	{
		ID: "memory", Title: "记忆翻牌", Icon: "card-pick", Accent: "#d98aa9",
		Tagline:     "翻牌找出所有成对的花。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "点击卡片翻牌，连开两张相同的花即配对成功。",
		HintMobile:  "轻触卡片翻牌，连开两张相同的花即配对成功。",
	},
	{
		ID: "minesweeper", Title: "扫雷", Icon: "land-mine", Accent: "#8a76b8",
		Tagline:     "按格上的数字推理，找出所有地雷。",
		Platforms:   []string{PlatformDesktop, PlatformMobile},
		HintDesktop: "左键翻开格子，右键插旗标记地雷。",
		HintMobile:  "轻触翻开格子；长按或开启「旗子模式」后轻触插旗。",
	},
	{
		ID: "tetris", Title: "俄罗斯方块", Icon: "t-brick", Accent: "#c9a86a",
		Tagline:     "移动、旋转方块，铺满一行即可消除。",
		Platforms:   []string{PlatformDesktop},
		HintDesktop: "← → 移动，↑ 旋转，↓ 加速，空格直落，P 暂停。",
		HintMobile:  "键盘游戏：请用带键盘的设备游玩。",
	},
	{
		ID: "swipe", Title: "指尖快划", Icon: "arrow-cluster", Accent: "#4f7a68",
		Tagline:     "30 秒内按箭头方向快速滑动，连击越长分越多。",
		Platforms:   []string{PlatformMobile},
		HintDesktop: "触屏游戏：请用手机或平板游玩。",
		HintMobile:  "看清箭头方向后立刻朝该方向滑动，连击越长分越多。",
	},
}

func gameByID(id string) (Game, bool) {
	for _, g := range gamesOrder {
		if g.ID == id {
			return g, true
		}
	}
	return Game{}, false
}

func gamesForPlatform(p string) []Game {
	var out []Game
	for _, g := range gamesOrder {
		if p == PlatformAll || g.Supports(p) {
			out = append(out, g)
		}
	}
	return out
}

var mobileUARe = regexp.MustCompile(`(?i)android|iphone|ipad|ipod|mobile|windows phone|webos|blackberry|opera mini|iemobile`)

// autoDetectPlatform 按 UA 自动判断设备，永远只返回 desktop 或 mobile。
func autoDetectPlatform(r *http.Request) string {
	if mobileUARe.MatchString(r.UserAgent()) {
		return PlatformMobile
	}
	return PlatformDesktop
}

// validID 防止把任意用户输入拼进模板/脚本路径。
func validID(id string) bool {
	if id == "" || len(id) > 40 {
		return false
	}
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_':
		default:
			return false
		}
	}
	return true
}

func init() {
	for _, g := range gamesOrder {
		if !validID(g.ID) {
			panic("游戏 ID 不合法: " + g.ID)
		}
	}
}

// NavItem 是导航页的一个入口。加新应用时在这里注册一行即可。
type NavItem struct {
	Name   string // 展示名
	Desc   string // 一句话简介
	Icon   string // web/static/img/ 下的图标文件名（game-icons.net）
	Href   string // 链接地址
	Accent string // 主题色
}

// navItems 决定导航页展示顺序。
var navItems = []NavItem{
	{Name: "小游戏", Icon: "gamepad", Href: "/games/", Accent: "#4f7a68"},
	{Name: "AI 对话", Icon: "conversation", Href: "/home", Accent: "#4d94cd"},
}
