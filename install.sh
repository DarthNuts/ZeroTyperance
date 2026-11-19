#!/usr/bin/env bash
# ZeroTyperance 0.1.0 installer for Linux and macOS.
#   curl -fsSL https://github.com/DarthNuts/ZeroTyperance/releases/latest/download/install.sh | bash
#   uninstall: curl -fsSL .../install.sh | bash -s -- --uninstall
# It installs the game page, the co-op server and a private copy of Node.js 24.22.2 (from nodejs.org, checked
# against a pinned SHA-256) into ZT_PREFIX (default ~/.local/share/zerotyperance) and the command `zerotyperance`
# into ZT_BIN_DIR (default ~/.local/bin). Nothing is written outside those two places (the download is staged in a
# temporary folder beside ZT_PREFIX and removed). The original ROM image is downloaded from technopop.net
# (royalty-free for distribution by its copyright owner; SHA-256 pinned) unless ZT_NO_ROM=1; without it the page asks
# for yours.
# Environment: ZT_PREFIX, ZT_BIN_DIR, ZT_RELEASE_BASE (where the release files are), ZT_UNINSTALL=1, ZT_NO_ROM=1,
# ZT_ROM_URLS (where the ROM zip is, space-separated).
set -euo pipefail

ZT_VERSION="0.1.0"
NODE_VERSION="24.22.2"
BASE="${ZT_RELEASE_BASE:-https://github.com/DarthNuts/ZeroTyperance/releases/latest/download}"
PREFIX="${ZT_PREFIX:-$HOME/.local/share/zerotyperance}"
BIN_DIR="${ZT_BIN_DIR:-$HOME/.local/bin}"
ARCHIVE="zerotyperance.tar.gz"

say() { printf 'zerotyperance: %s\n' "$*"; }
die() { printf 'zerotyperance: error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

sha256_of() {
  if have sha256sum; then sha256sum "$1" | cut -d' ' -f1
  elif have shasum; then shasum -a 256 "$1" | cut -d' ' -f1
  else die "needs sha256sum or shasum"; fi
}

fetch() { # fetch URL FILE
  curl -fL --retry 3 --connect-timeout 20 -o "$2" "$1" || die "download failed: $1"
}

ours() { [ -f "$1/launch.mjs" ] && [ -f "$1/VERSION" ]; } # a directory this installer made

uninstall() {
  ours "$PREFIX" || [ -e "$BIN_DIR/zerotyperance" ] || { say "not installed in $PREFIX"; exit 0; }
  if ours "$PREFIX"; then rm -rf "$PREFIX"; fi
  if grep -q 'launch.mjs' "$BIN_DIR/zerotyperance" 2>/dev/null; then rm -f "$BIN_DIR/zerotyperance"; fi
  say "removed $PREFIX and $BIN_DIR/zerotyperance"
  say "the browser keeps the extracted assets for http://localhost:8802 until you clear that site's data"
  exit 0
}

if [ "${1:-}" = "--uninstall" ] || [ "${ZT_UNINSTALL:-}" = "1" ]; then uninstall; fi
[ "${1:-}" = "" ] || die "unknown argument $1 (only --uninstall)"

have curl || die "needs curl"
have tar || die "needs tar"
if [ -e "$PREFIX" ] && ! ours "$PREFIX" && [ -n "$(ls -A "$PREFIX" 2>/dev/null)" ]; then
  die "$PREFIX exists and is not a ZeroTyperance install; set ZT_PREFIX to another directory"
fi
if [ -e "$BIN_DIR/zerotyperance" ] && ! grep -q 'launch.mjs' "$BIN_DIR/zerotyperance" 2>/dev/null; then
  die "$BIN_DIR/zerotyperance exists and is not ours; set ZT_BIN_DIR to another directory"
fi

os=$(uname -s); arch=$(uname -m)
case "$os" in
  Linux) nos=linux ;;
  Darwin) nos=darwin ;;
  *) die "this installer is for Linux and macOS (found $os); on Windows use install.ps1" ;;
esac
case "$arch" in
  x86_64|amd64) narch=x64 ;;
  aarch64|arm64) narch=arm64 ;;
  *) die "no Node.js build for this CPU ($arch)" ;;
esac
if [ "$nos" = linux ] && { ldd --version 2>&1 | grep -qi musl; }; then
  die "musl-based Linux (Alpine) is not supported by the official Node.js builds"
fi

case "$nos-$narch" in
  linux-x64) NODE_SHA=361718c444e49af2ca5a110c83ba6a8901143f23ab285ebbef0341f391f482a9 ;;
  linux-arm64) NODE_SHA=95c264150aceb7f3437a29fd6984924f5f8d1511ea3cbd6c508b83f6c555dae2 ;;
  darwin-x64) NODE_SHA=d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52 ;;
  darwin-arm64) NODE_SHA=aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a ;;
  *) die "no pinned Node.js build for $nos-$narch" ;;
esac
NODE_DIR="node-v$NODE_VERSION-$nos-$narch"
NODE_URL="https://nodejs.org/dist/v$NODE_VERSION/$NODE_DIR.tar.gz"

# staged beside the prefix, not in /tmp: the new Node.js binary runs from here (a noexec /tmp would refuse it) and the
# final move stays on one file system
mkdir -p "$(dirname "$PREFIX")"
TMP=$(mktemp -d "$(dirname "$PREFIX")/.zerotyperance-new.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

say "downloading ZeroTyperance from $BASE"
fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS"
fetch "$BASE/$ARCHIVE" "$TMP/$ARCHIVE"
want=$(awk -v f="$ARCHIVE" '$2 == f || $2 == "*" f { print $1 }' "$TMP/SHA256SUMS")
[ -n "$want" ] || die "SHA256SUMS has no line for $ARCHIVE"
[ "$(sha256_of "$TMP/$ARCHIVE")" = "$want" ] || die "$ARCHIVE does not match its SHA-256"
mkdir -p "$TMP/new"
tar -xzf "$TMP/$ARCHIVE" -C "$TMP/new"
[ -f "$TMP/new/ZeroTyperance/launch.mjs" ] || die "the archive has no ZeroTyperance/launch.mjs"
got_version=$(cat "$TMP/new/ZeroTyperance/VERSION")

if [ -x "$PREFIX/node/bin/node" ] && [ "$("$PREFIX/node/bin/node" --version 2>/dev/null)" = "v$NODE_VERSION" ]; then
  say "Node.js $NODE_VERSION already installed"
  mkdir -p "$TMP/new/ZeroTyperance/node"
  cp -R "$PREFIX/node/." "$TMP/new/ZeroTyperance/node/"
else
  say "downloading Node.js $NODE_VERSION ($nos-$narch) from nodejs.org"
  fetch "$NODE_URL" "$TMP/node.tar.gz"
  [ "$(sha256_of "$TMP/node.tar.gz")" = "$NODE_SHA" ] || die "the Node.js download does not match its pinned SHA-256"
  mkdir -p "$TMP/node"
  tar -xzf "$TMP/node.tar.gz" -C "$TMP/node" "$NODE_DIR/bin/node" "$NODE_DIR/LICENSE"
  mkdir -p "$TMP/new/ZeroTyperance/node/bin"
  mv "$TMP/node/$NODE_DIR/bin/node" "$TMP/new/ZeroTyperance/node/bin/node"
  mv "$TMP/node/$NODE_DIR/LICENSE" "$TMP/new/ZeroTyperance/node/LICENSE"
fi
"$TMP/new/ZeroTyperance/node/bin/node" --version >/dev/null 2>&1 || die "the Node.js binary does not run on this system"

# The ROM image: the original, which its copyright owner Randel Reiss made royalty-free for distribution
# (technopop.net). Downloaded from there (the archive.org copy as the fallback), never from this project.
ROM_ZIP_SHA="5d8f7f96dcab8ed7679ae0d92959b784517c541821f903e95f671308505b8e01"
ROM_SHA="02e98d4dbf68c2279bf1471bfc7df4d6b8dc864435582beea92d2915febd0eeb"
ROM_URLS="${ZT_ROM_URLS:-http://www.technopop.net/images/zerotole.zip https://web.archive.org/web/20180310132236id_/http://www.technopop.net/images/zerotole.zip}"
ROM_NEW="$TMP/new/ZeroTyperance/rom"
if [ -f "$PREFIX/rom/Zerotole.bin" ]; then
  # an update keeps the ROM image already there, whoever put it there
  mkdir -p "$ROM_NEW" && cp "$PREFIX/rom/Zerotole.bin" "$ROM_NEW/Zerotole.bin"
  if [ "$(sha256_of "$PREFIX/rom/Zerotole.bin")" = "$ROM_SHA" ]; then
    say "the ROM image is already installed"
  else
    say "kept the ROM image in $PREFIX/rom (not the pinned one; delete it and run this again to download that)"
  fi
elif [ "${ZT_NO_ROM:-}" = "1" ]; then
  say "ZT_NO_ROM=1: no ROM image downloaded; the page will ask you for one"
else
  got=""
  for u in $ROM_URLS; do
    say "downloading the Zero Tolerance ROM image from $u"
    if curl -fsL --retry 2 --connect-timeout 20 -o "$TMP/rom.zip" "$u" && [ "$(sha256_of "$TMP/rom.zip")" = "$ROM_ZIP_SHA" ]; then
      mkdir -p "$ROM_NEW"
      if "$TMP/new/ZeroTyperance/node/bin/node" "$TMP/new/ZeroTyperance/unzip1.mjs" "$TMP/rom.zip" Zerotole.bin "$ROM_NEW/Zerotole.bin" \
         && [ "$(sha256_of "$ROM_NEW/Zerotole.bin")" = "$ROM_SHA" ]; then got=1; break; fi
      rm -rf "$ROM_NEW"
    fi
    say "that copy failed or does not match its pinned SHA-256"
  done
  if [ -n "$got" ]; then
    say "ROM image installed (royalty-free for distribution by its copyright owner, Randel Reiss: technopop.net)"
  else
    say "no ROM image could be downloaded: the page will ask you for one"
  fi
fi

# the old copy moves into the staging folder (same file system), which the EXIT trap removes; no other name is touched
if [ -e "$PREFIX" ]; then mv "$PREFIX" "$TMP/old"; fi
if ! mv "$TMP/new/ZeroTyperance" "$PREFIX"; then
  if [ -e "$TMP/old" ]; then mv "$TMP/old" "$PREFIX"; fi
  die "could not move the new copy into $PREFIX"
fi

mkdir -p "$BIN_DIR"
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; } # single-quoted for sh, any path
{
  printf '#!/bin/sh\n'
  printf 'exec %s %s "$@"\n' "$(q "$PREFIX/node/bin/node")" "$(q "$PREFIX/launch.mjs")"
} > "$BIN_DIR/zerotyperance"
chmod 755 "$BIN_DIR/zerotyperance"

say "installed ZeroTyperance $got_version in $PREFIX"
[ "$got_version" = "$ZT_VERSION" ] || say "note: this installer is $ZT_VERSION, the downloaded release is $got_version"
if have pgrep && pgrep -f "$PREFIX/launch.mjs" >/dev/null 2>&1; then
  say "ZeroTyperance is running: close it and start it again to use the new version"
fi
case ":$PATH:" in
  *":$BIN_DIR:"*) say "start it with: zerotyperance" ;;
  *) say "start it with: $BIN_DIR/zerotyperance"
     say "(add $BIN_DIR to your PATH to type just 'zerotyperance')" ;;
esac
if [ -f "$PREFIX/rom/Zerotole.bin" ]; then
  say "it serves the game on http://localhost:8802/ and opens your browser; the page extracts its assets from the ROM image"
else
  say "it serves the game on http://localhost:8802/ and opens your browser; the page asks you for your ROM image"
fi
