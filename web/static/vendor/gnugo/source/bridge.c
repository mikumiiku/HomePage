/* HomePage GNU Go WASM bridge, 2026-09-17. GPL-3.0-or-later.
 * Colors and coordinates match go-engine.js (1 black, 2 white, top-left).
 * No I/O, threads or server component. Search never commits its proposed move.
 */
#include <stddef.h>
#include "gnugo.h"
#include "liberty.h"
#include "clock.h"
#include "gg_utils.h"

static int ready;
static int color_of(int color) { return color == 1 ? BLACK : WHITE; }
static int position_of(int point) {
  return point < 0 ? PASS_MOVE : POS(point / board_size, point % board_size);
}

int hp_init(int size, int strength, unsigned int seed) {
  if ((size != 9 && size != 13 && size != 19) || strength < 0 || strength > 10) return 0;
  if (!ready) { init_gnugo(8.0, seed); ready = 1; }
  gnugo_clear_board(size);
  komi = 7.5;
  chinese_rules = 1;
  ko_rule = PSK;
  suicide_rule = FORBIDDEN;
  set_level(strength);
  set_random_seed(seed);
  return 1;
}

int hp_play(int point, int color) {
  if (!ready || (color != 1 && color != 2) || point < -1 || point >= board_size * board_size) return 0;
  int pos = position_of(point), c = color_of(color);
  if (point >= 0 && !is_allowed_move(pos, c)) return 0;
  gnugo_play_move(pos, c);
  return 1;
}

int hp_generate(int color) {
  if (!ready || (color != 1 && color != 2)) return -2;
  int pos = genmove(color_of(color), NULL, NULL);
  return pos == PASS_MOVE ? -1 : I(pos) * board_size + J(pos);
}

float hp_value(int point) {
  if (point < 0 || point >= board_size * board_size) return 0;
  return potential_moves[position_of(point)];
}

/* Read-only diagnostics for rule parity and offline calibration tests.
 * hp_dead is meaningful only after hp_generate; it never changes UI scoring.
 */
int hp_stone(int point) {
  if (point < 0 || point >= board_size * board_size) return -1;
  int c = board[position_of(point)];
  return c == BLACK ? 1 : c == WHITE ? 2 : 0;
}
int hp_dead(int point) {
  if (point < 0 || point >= board_size * board_size) return 0;
  int pos = position_of(point);
  return board[pos] != EMPTY && dragon[pos].status == DEAD;
}
