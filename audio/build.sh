#!/bin/sh
# Rebuilds render_audio-wasm32.wasm, the page's music and sound renderer, from this folder (WASI preview 1).
# Needs clang + lld + wasi-libc + the wasm32 compiler-rt (Ubuntu: clang lld wasi-libc libclang-rt-dev-wasm32).
# With the same compiler (the release used: Ubuntu clang version 21.1.8 (6ubuntu1)) the output equals the shipped file byte for byte.
# To run a modified build, replace app/render_audio-wasm32.wasm in your ZeroTyperance folder with it.
set -eu
cd "$(dirname "$0")"
CC=${CC:-clang}
"$CC" --target=wasm32-wasi -O2 -std=c99 -ffp-contract=off -ffile-prefix-map="$PWD"=. -Wl,--strip-all \
    -I vendor/z80 -I vendor/ym3438 -I vendor/psg \
    render_audio.c vendor/z80/z80.c vendor/ym3438/ym3438.c vendor/psg/emu76489.c -lm -o render_audio-wasm32.wasm
sha256sum render_audio-wasm32.wasm
