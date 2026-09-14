package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGomokuRoutes(t *testing.T) {
	initTemplates(webFS)
	for _, ua := range []string{"Mozilla/5.0 desktop", "Mozilla/5.0 iPhone Mobile"} {
		req := httptest.NewRequest("GET", "/game/gomoku", nil)
		req.Header.Set("User-Agent", ua)
		w := httptest.NewRecorder()
		gameHandler(w, req)
		body := w.Body.String()
		for _, want := range []string{"五子棋", `data-game="gomoku"`, "gomoku-engine.js?v=", "gomoku-ai.js?v=", "gomoku.js?v=", "gomoku.css?v="} {
			if !strings.Contains(body, want) {
				t.Errorf("%s response lacks %q", ua, want)
			}
		}
		if strings.Contains(body, "用你当前的设备玩可能不太顺手") {
			t.Error("gomoku must support both platforms")
		}
	}
	req := httptest.NewRequest("GET", "/game/2048", nil)
	w := httptest.NewRecorder()
	gameHandler(w, req)
	if strings.Contains(w.Body.String(), "gomoku") {
		t.Error("gomoku assets leaked to another game")
	}
	w = httptest.NewRecorder()
	apiGamesHandler(w, httptest.NewRequest("GET", "/api/games?scope=all", nil))
	var response struct {
		Games []Game `json:"games"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, game := range response.Games {
		if game.ID == "gomoku" {
			found = true
		}
	}
	if !found {
		t.Error("gomoku missing from public game list")
	}
	for _, path := range []string{"web/static/js/games/gomoku-worker.js", "web/static/img/go.svg", "web/static/css/gomoku.css"} {
		if _, err := webFS.ReadFile(path); err != nil {
			t.Fatal(err)
		}
	}
}
