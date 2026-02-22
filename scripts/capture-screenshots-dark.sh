#!/usr/bin/env bash
set -euo pipefail

APP_PATH="/Applications/localmd.app"
if [[ ! -d "$APP_PATH" ]]; then
  APP_PATH="$(pwd)/dist/mac-arm64/localmd.app"
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "localmd.app not found. Build/install first." >&2
  exit 1
fi

OUT_DIR="$(pwd)/docs/screenshots"
DEMO_DIR="$(pwd)/demo"
mkdir -p "$OUT_DIR" "$DEMO_DIR"

cat > "$DEMO_DIR/README.md" <<'MD'
# localmd Demo

This is a sample markdown file for screenshots.

- Folder tree on the left
- Viewer/editor on the right
- Theme toggle in toolbar
MD

pkill -f 'localmd.app/Contents/MacOS/localmd' || true
open -a "$APP_PATH"
sleep 2
osascript -e 'tell application "localmd" to activate' || true

echo "Toggle localmd to DARK mode, make sure the start screen is visible, then press Enter..."
read -r _
screencapture -x "$OUT_DIR/start-screen-dark.png"

pkill -f 'localmd.app/Contents/MacOS/localmd' || true
"$APP_PATH/Contents/MacOS/localmd" "$DEMO_DIR/README.md" >/dev/null 2>&1 &
sleep 2
osascript -e 'tell application "localmd" to activate' || true

echo "Ensure localmd is still in DARK mode on reader screen, then press Enter..."
read -r _
screencapture -x "$OUT_DIR/reader-screen-dark.png"

pkill -f 'localmd.app/Contents/MacOS/localmd' || true

echo "Saved:"
echo "  $OUT_DIR/start-screen-dark.png"
echo "  $OUT_DIR/reader-screen-dark.png"
