#!/usr/bin/env bash
# Corresponding build instructions for the bundled GNU Go 3.8 binary.
# Requires GCC, make, Python 3 and Emscripten (tested with 3.1.5).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$(mktemp -d /tmp/homepage-gnugo-build.XXXXXX)"
echo "Build directory: $BUILD"
echo 'da68d7a65f44dcf6ce6e4e630b6f6dd9897249d34425920bfdd4e07ff1866a72  gnugo-3.8.tar.gz' | (cd "$HERE" && sha256sum -c -)
mkdir "$BUILD/native" "$BUILD/wasm"
tar xzf "$HERE/gnugo-3.8.tar.gz" -C "$BUILD/native" --strip-components=1
tar xzf "$HERE/gnugo-3.8.tar.gz" -C "$BUILD/wasm" --strip-components=1
# Native tools generate pattern C sources; no native engine is installed or served.
cd "$BUILD/native"
./configure CFLAGS='-O2 -fcommon' --without-readline --without-curses --disable-socket-support
make -j2 -C utils
make -j2 -C sgf
make -j2 -C engine
make -j2 -C patterns
cd "$BUILD/wasm"
# GNU Go 3.8 has tentative definitions in a header; modern wasm-ld needs one owner.
python3 - <<'PY'
from pathlib import Path
p = Path('engine/liberty.h')
s = p.read_text()
for name in ['meaningless_black_moves', 'meaningless_white_moves']:
    s = s.replace('int ' + name + '[BOARDMAX];', 'extern int ' + name + '[BOARDMAX];')
p.write_text(s)
p = Path('engine/globals.c')
p.write_text(p.read_text() + '\n/* HomePage WASM link fix, 2026-09-17. */\nint meaningless_black_moves[BOARDMAX];\nint meaningless_white_moves[BOARDMAX];\n')
PY
emconfigure ./configure CFLAGS='-O2' --without-readline --without-curses --disable-socket-support
emmake make -j2 -C utils AR=emar
emmake make -j2 -C sgf AR=emar
emmake make -j2 -C engine AR=emar
cp "$BUILD/native/patterns/"*.c "$BUILD/native/patterns/"*.db patterns/
for helper in mkpat joseki mkeyes mkmcpat uncompress_fuseki; do
  cp "$BUILD/native/patterns/$helper" "patterns/$helper"
done
emmake make -j2 -C patterns AR=emar -o mkpat -o joseki -o mkeyes -o mkmcpat -o uncompress_fuseki libpatterns.a
emcc -O2 -I. -Iengine -Isgf -Iutils "$HERE/bridge.c" \
  engine/libengine.a patterns/libpatterns.a sgf/libsgf.a utils/libutils.a \
  -sMODULARIZE=1 -sEXPORT_NAME=createGnuGo -sENVIRONMENT=worker,node \
  -sEXPORTED_FUNCTIONS='["_hp_init","_hp_play","_hp_generate","_hp_value","_hp_stone","_hp_dead"]' \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=268435456 \
  -sTOTAL_STACK=16777216 -o "$HERE/../gnugo.js"
