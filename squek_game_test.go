package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSquekGameRoutes(t *testing.T) {
	initTemplates(webFS)
	for _, ua := range []string{"Mozilla/5.0 desktop", "Mozilla/5.0 iPhone Mobile"} {
		req := httptest.NewRequest("GET", "/game/squek", nil)
		req.Header.Set("User-Agent", ua)
		w := httptest.NewRecorder()
		gameHandler(w, req)
		body := w.Body.String()
		for _, want := range []string{
			"雀蛇", `data-game="squek"`,
			"squek-engine.js?v=", "squek-ai.js?v=", "squek.js?v=", "squek.css?v=",
		} {
			if !strings.Contains(body, want) {
				t.Errorf("%s response lacks %q", ua, want)
			}
		}
		if strings.Contains(body, "用你当前的设备玩可能不太顺手") {
			t.Error("squek must support both platforms")
		}
	}

	req := httptest.NewRequest("GET", "/game/2048", nil)
	w := httptest.NewRecorder()
	gameHandler(w, req)
	for _, leak := range []string{"squek-engine.js", "squek.css", "go-engine.js"} {
		if strings.Contains(w.Body.String(), leak) {
			t.Errorf("%s leaked to another game", leak)
		}
	}

	w = httptest.NewRecorder()
	apiGamesHandler(w, httptest.NewRequest("GET", "/api/games?scope=all", nil))
	var response struct {
		Games []Game `json:"games"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	index := -1
	for i, game := range response.Games {
		if game.ID == "squek" {
			index = i
			if game.Title != "雀蛇" {
				t.Errorf("雀蛇 title mismatch: %q", game.Title)
			}
			if !game.Supports(PlatformDesktop) || !game.Supports(PlatformMobile) {
				t.Error("雀蛇 should support desktop and mobile")
			}
		}
	}
	if index < 0 {
		t.Fatal("squek is not registered in gamesOrder")
	}

	for _, path := range []string{
		"web/static/js/games/squek-engine.js",
		"web/static/js/games/squek-ai.js",
		"web/static/js/games/squek.js",
		"web/static/css/squek.css",
		"web/static/img/domino-tiles.svg",
		"web/static/img/squek-SOURCES.md",
	} {
		if _, err := webFS.ReadFile(path); err != nil {
			t.Fatal(err)
		}
	}
}
