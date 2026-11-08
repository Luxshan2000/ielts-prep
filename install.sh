#!/bin/sh
# BandReady, the browser edition, for Linux and macOS.
#
#   curl -LsSf https://raw.githubusercontent.com/Luxshan2000/ielts-prep/main/install.sh | sh
#
# Installs into your home folder only: no sudo, no Node, no git, and no Python of your own
# (uv downloads one just for BandReady). Run the same line again to update.
#
# BANDREADY_WHEEL=<path or URL>  install that build instead of the latest release
# BANDREADY_NO_LAUNCH=1          install only, do not start BandReady afterwards
set -eu

REPO="Luxshan2000/ielts-prep"

say() { printf '%s\n' "$*"; }
fail() {
  printf '\nBandReady could not be installed: %s\n' "$*" >&2
  printf 'If this keeps happening, please report it at https://github.com/%s/issues\n' "$REPO" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "this needs curl. Install it with your package manager and run the line again."

# 1. uv, which installs Python and BandReady without touching the rest of the system.
if command -v uv >/dev/null 2>&1; then
  UV=$(command -v uv)
elif [ -x "$HOME/.local/bin/uv" ]; then
  UV="$HOME/.local/bin/uv"
else
  say "Installing uv, the tool that sets up Python for BandReady..."
  curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh >/dev/null 2>&1 \
    || fail "uv did not install. Check your internet connection."
  UV="$HOME/.local/bin/uv"
fi

# 2. The build to install: the newest release that has a browser edition attached.
if [ -n "${BANDREADY_WHEEL:-}" ]; then
  WHEEL="$BANDREADY_WHEEL"
else
  say "Finding the latest BandReady release..."
  WHEEL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=10" \
    | grep -o '"browser_download_url": *"[^"]*\.whl"' \
    | head -n 1 \
    | sed 's/.*"\(https[^"]*\)"$/\1/') || true
  [ -n "$WHEEL" ] || fail "no release with a browser edition was found at https://github.com/$REPO/releases"
fi
case "$WHEEL" in
  /*) WHEEL="file://$WHEEL" ;;
esac

# 3. The voice features (Listening audio, the speaking examiner). Their speech engine has
#    no Intel Mac build, so an Intel Mac gets everything else.
EXTRA="[voice]"
if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "x86_64" ]; then
  EXTRA=""
  say "This is an Intel Mac: installing without Listening audio and the speaking examiner,"
  say "which need a speech engine that no longer supports Intel Macs."
fi

# uv warns that its bin folder is not on PATH, which means nothing to someone who has never
# opened a terminal. It is on PATH for this script, and `update-shell` adds it for later.
BIN_DIR=$("$UV" tool dir --bin)
PATH="$BIN_DIR:$PATH"
export PATH

say "Installing BandReady. The first time downloads about 800 MB, so this can take a while..."
"$UV" tool install --force --reinstall-package bandready-sidecar --python 3.11 "bandready-sidecar$EXTRA @ $WHEEL" \
  || fail "the download or install did not finish. Check your internet connection and run the line again."
"$UV" tool update-shell >/dev/null 2>&1 || true

BIN="$BIN_DIR/bandready"
[ -x "$BIN" ] || fail "the install finished but $BIN is missing."

# 4. Something to click next time.
if [ "$(uname -s)" = "Linux" ]; then
  SHARE="${XDG_DATA_HOME:-$HOME/.local/share}"
  mkdir -p "$SHARE/applications" "$SHARE/icons"
  curl -fsSL "https://raw.githubusercontent.com/$REPO/main/app/build/icon.png" \
    -o "$SHARE/icons/bandready.png" 2>/dev/null || true
  cat > "$SHARE/applications/bandready.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=BandReady
Comment=IELTS practice that runs on your own computer
Exec="$BIN"
Icon=$SHARE/icons/bandready.png
Terminal=true
Categories=Education;
EOF
  WHERE="from your applications menu (search for BandReady)"
else
  mkdir -p "$HOME/Applications"
  LAUNCHER="$HOME/Applications/BandReady (browser).command"
  printf '#!/bin/sh\nexec "%s"\n' "$BIN" > "$LAUNCHER"
  chmod +x "$LAUNCHER"
  WHERE="by double-clicking \"BandReady (browser)\" in the Applications folder in your home folder"
fi

say ""
say "BandReady is installed."
say "Next time, start it $WHERE, or type: bandready"
say ""

if [ -z "${BANDREADY_NO_LAUNCH:-}" ]; then
  exec "$BIN"
fi
