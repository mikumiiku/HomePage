package main

import (
	"embed"
	"flag"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

//go:embed web
var webFS embed.FS

// assetVersion 用二进制文件的修改时间作为静态资源指纹：
// 每次重新 build 后 URL 全部变化，浏览器/代理缓存的旧资源自然失效。
var assetVersion = func() string {
	exe, err := os.Executable()
	if err != nil {
		return "1"
	}
	if st, err := os.Stat(exe); err == nil {
		return strconv.FormatInt(st.ModTime().Unix(), 10)
	}
	return "1"
}()

func main() {
	addr := flag.String("addr", "127.0.0.1:8023", "HTTP 监听地址")
	flag.Parse()

	initTemplates(webFS)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("/api/games", apiGamesHandler)
	mux.Handle("/static/", cacheStatic(http.StripPrefix("/static/", http.FileServer(http.FS(mustSub(webFS, "web/static"))))))
	mux.HandleFunc("/game/", gameHandler)
	mux.HandleFunc("/about", aboutHandler)
	mux.HandleFunc("/home", chatHandler)
	mux.HandleFunc("/games/", gamesHandler)
	mux.HandleFunc("/games", gamesHandler)
	mux.HandleFunc("/", navHandler)

	srv := &http.Server{
		Addr:              *addr,
		Handler:           withLogging(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("homepage 监听 %s", *addr)
	log.Fatal(srv.ListenAndServe())
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}
