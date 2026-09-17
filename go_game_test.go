package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGoGameRoutes(t *testing.T) {
	initTemplates(webFS)
	for _, ua := range []string{"Mozilla/5.0 desktop", "Mozilla/5.0 iPhone Mobile"} {
		req := httptest.NewRequest("GET", "/game/go", nil)
		req.Header.Set("User-Agent", ua)
		w := httptest.NewRecorder()
		gameHandler(w, req)
		body := w.Body.String()
		for _, want := range []string{"围棋", `data-game="go"`, "go-engine.js?v=", "go-ai.js?v=", "go.js?v=", "go.css?v=", `class="is-go"`} {
			if !strings.Contains(body, want) {
				t.Errorf("%s response lacks %q", ua, want)
			}
		}
		if strings.Contains(body, "用你当前的设备玩可能不太顺手") {
			t.Error("go must support both platforms")
		}
	}

	req := httptest.NewRequest("GET", "/game/2048", nil)
	w := httptest.NewRecorder()
	gameHandler(w, req)
	if strings.Contains(w.Body.String(), "go-engine.js") || strings.Contains(w.Body.String(), "go.css") {
		t.Error("go assets leaked to another game")
	}

	w = httptest.NewRecorder()
	apiGamesHandler(w, httptest.NewRequest("GET", "/api/games?scope=all", nil))
	var response struct {
		Games []Game `json:"games"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	goIndex, gomokuIndex := -1, -1
	for index, game := range response.Games {
		switch game.ID {
		case "go":
			goIndex = index
		case "gomoku":
			gomokuIndex = index
		}
	}
	if goIndex < 0 || gomokuIndex < 0 || goIndex != gomokuIndex+1 {
		t.Errorf("go should be registered immediately after gomoku: gomoku=%d go=%d", gomokuIndex, goIndex)
	}

	for _, path := range []string{
		"web/static/js/games/go-engine.js",
		"web/static/js/games/go-ai.js",
		"web/static/js/games/go-worker.js",
		"web/static/js/games/go.js",
		"web/static/vendor/gnugo/gnugo.js",
		"web/static/vendor/gnugo/gnugo.wasm",
		"web/static/vendor/gnugo/COPYING",
		"web/static/vendor/gnugo/SOURCES.md",
		"web/static/vendor/gnugo/source/gnugo-3.8.tar.gz",
		"web/static/vendor/gnugo/source/bridge.c",
		"web/static/vendor/gnugo/source/build.sh",
		"web/static/img/encirclement.svg",
		"web/static/img/go-SOURCES.md",
		"web/static/css/go.css",
	} {
		if _, err := webFS.ReadFile(path); err != nil {
			t.Fatal(err)
		}
	}
}
