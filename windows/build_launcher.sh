#!/bin/bash
# build_launcher.sh VERSION OUT.exe  - cross-build ZeroTyperance.exe (mingw-w64). Reproducible: no timestamps.
# ZT_LAUNCHER_CFLAGS (test builds only, e.g. -DZT_NO_JOB) is appended to the compile line.
set -euo pipefail
ver="${1:?usage: build_launcher.sh VERSION OUT.exe}"
out="${2:?usage: build_launcher.sh VERSION OUT.exe}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$(realpath -m "$out")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
num="${ver%%[-+]*}"
IFS=. read -r a b c d _ <<< "$num.0.0.0.0"
for x in "$a" "$b" "$c" "$d"; do [[ "$x" =~ ^[0-9]+$ ]] || { echo "bad version $ver" >&2; exit 2; }; done
printf '#define ZT_VER_STR "%s\\0"\n#define ZT_VER_NUM %s,%s,%s,%s\n' "$ver" "$a" "$b" "$c" "$d" > "$tmp/version.inc"
cp "$here/zt.ico" "$here/launcher.rc" "$tmp/"
(cd "$tmp" && x86_64-w64-mingw32-windres -O coff -i launcher.rc -o launcher_res.o)
mkdir -p "$(dirname "$out")"
# shellcheck disable=SC2086
x86_64-w64-mingw32-gcc -std=gnu99 -O2 -s -Wall -Wextra -municode -mwindows -static-libgcc ${ZT_LAUNCHER_CFLAGS:-} \
  -Wl,--no-insert-timestamp -o "$out" "$here/launcher.c" "$tmp/launcher_res.o" \
  -lshell32 -luser32 -ladvapi32 -lws2_32
echo "built $out ($(stat -c %s "$out") bytes)"
