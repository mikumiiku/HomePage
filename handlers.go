package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"html/template"
	"io/fs"
	"net/http"
	"strings"
)

// ViewData 是导航页 / 游戏页 / 关于页共用的模板数据。
type ViewData struct {
	Title     string
	Platform  string    // 当前展示视角：desktop / mobile / all（游戏集合页用）
	Items     []NavItem // 导航页条目
	Games     []Game    // 已按视角过滤的游戏
	GamesMeta []Game    // 全部游戏元数据（集合页 JS 用，模板里输出为 JS 数组字面量）
	Game      Game
	Hint      string
	Mismatch  bool // 当前视角与游戏适配平台不符
	Scripts   []string
	Ver       string // 静态资源版本（二进制 mtime），用于缓存失效
}

var (
	navTmpl      *template.Template
	gamesTmpl    *template.Template
	gameTmpl     *template.Template
	aboutTmpl    *template.Template
	chatTmpl     *template.Template
	notFoundTmpl *template.Template
)

func initTemplates(fsys embed.FS) {
	chatTmpl = template.Must(template.ParseFS(fsys, "web/templates/layout.html", "web/templates/chat.html"))
	navTmpl = template.Must(template.ParseFS(fsys,
		"web/templates/layout.html", "web/templates/nav.html"))
	gamesTmpl = template.Must(template.ParseFS(fsys,
		"web/templates/layout.html", "web/templates/games.html"))
	gameTmpl = template.Must(template.ParseFS(fsys,
		"web/templates/layout.html", "web/templates/game.html"))
	aboutTmpl = template.Must(template.ParseFS(fsys,
		"web/templates/layout.html", "web/templates/about.html"))
	notFoundTmpl = template.Must(template.ParseFS(fsys,
		"web/templates/layout.html", "web/templates/notfound.html"))
}

func mustSub(fsys embed.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err)
	}
	return sub
}

func cacheStatic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=604800")
		next.ServeHTTP(w, r)
	})
}

// navHandler 是站点根路径：导航页。
func navHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		renderNotFound(w)
		return
	}
	render(w, navTmpl, ViewData{
		Title: "主页",
		Items: navItems,
	})
}

// gamesHandler 是「小游戏」板块的列表页：/games 与 /games/。
func gamesHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/games" && r.URL.Path != "/games/" {
		renderNotFound(w)
		return
	}
	p := autoDetectPlatform(r)
	render(w, gamesTmpl, ViewData{
		Title:     "小游戏",
		Platform:  p,
		Games:     gamesForPlatform(p),
		GamesMeta: gamesOrder,
	})
}

func gameHandler(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/game/")
	if !validID(id) {
		renderNotFound(w)
		return
	}
	g, ok := gameByID(id)
	if !ok {
		renderNotFound(w)
		return
	}
	p := autoDetectPlatform(r)
	mismatch := p != PlatformAll && !g.Supports(p)
	scripts := []string{"/static/js/games/" + g.ID + ".js"}
	if id == "chess" {
		scripts = []string{"/static/vendor/chess/chess.js", "/static/js/games/chess-engine.js", "/static/js/games/chess.js"}
	} else if id == "gomoku" {
		scripts = []string{"/static/js/games/gomoku-engine.js", "/static/js/games/gomoku-ai.js", "/static/js/games/gomoku.js"}
	} else if id == "go" {
		scripts = []string{"/static/js/games/go-engine.js", "/static/js/games/go-ai.js", "/static/js/games/go.js"}
	} else if id == "squek" {
		scripts = []string{"/static/js/games/squek-engine.js", "/static/js/games/squek-ai.js", "/static/js/games/squek.js"}
	}
	render(w, gameTmpl, ViewData{
		Title:    g.Title,
		Platform: p,
		Game:     g,
		Hint:     g.Hint(p),
		Mismatch: mismatch,
		Scripts:  scripts,
	})
}

func aboutHandler(w http.ResponseWriter, r *http.Request) {
	render(w, aboutTmpl, ViewData{Title: "关于"})
}

func apiGamesHandler(w http.ResponseWriter, r *http.Request) {
	p := autoDetectPlatform(r)
	if r.URL.Query().Get("scope") == "all" {
		p = PlatformAll
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(map[string]any{
		"platform": p,
		"games":    gamesForPlatform(p),
	})
}

func render(w http.ResponseWriter, t *template.Template, data ViewData) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	data.Ver = assetVersion
	if err := t.ExecuteTemplate(w, "layout", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// renderNotFound 走与其他页面同一套 layout：跟随亮暗模式、保留页头与主题按钮。
// 先渲染到缓冲区，确认成功后再写 404 状态，避免模板出错时状态码与实际内容不一致。
func renderNotFound(w http.ResponseWriter) {
	var buf bytes.Buffer
	data := ViewData{Title: "页面不存在", Ver: assetVersion}
	if err := notFoundTmpl.ExecuteTemplate(&buf, "layout", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusNotFound)
	w.Write(buf.Bytes())
}

func chatHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Referrer-Policy", "no-referrer")
	render(w, chatTmpl, ViewData{Title: "AI 对话"})
}
