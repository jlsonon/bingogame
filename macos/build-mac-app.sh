#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Lucky Bingo"
BUNDLE_ID="com.luckybingo.host"
APP_BUNDLE="${ROOT_DIR}/${APP_NAME}.app"
BUILD_TMP="${ROOT_DIR}/macos/build"

echo "==> Building Lucky Bingo macOS Host App..."
cd "$ROOT_DIR"

# 1. Verify offline voice cache exists
if [ ! -d "${ROOT_DIR}/voice-cache" ]; then
  echo "WARNING: voice-cache/ directory not found. Run 'npm run cache-voices' first to bundle all 20 natural voices offline."
fi

# 2. Build production frontend (Vite) and standalone Node server bundle (zero node_modules required!)
echo "==> Building frontend assets (dist/)..."
npx vite build

echo "==> Bundling standalone offline server (server.cjs)..."
mkdir -p "$BUILD_TMP"
npx esbuild server.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --external:vite \
  --external:bufferutil \
  --external:utf-8-validate \
  --outfile="${BUILD_TMP}/server.cjs"

# 3. Generate macOS AppIcon.icns
echo "==> Generating AppIcon.icns..."
ICONSET_DIR="${BUILD_TMP}/AppIcon.iconset"
rm -rf "$ICONSET_DIR"
swift "${ROOT_DIR}/macos/generate-icon.swift" "$ICONSET_DIR"
iconutil -c icns "$ICONSET_DIR" -o "${BUILD_TMP}/AppIcon.icns"

# 4. Compile native Swift Cocoa + WKWebView host binary
echo "==> Compiling native macOS binary (Swift + WKWebView)..."
swiftc -O \
  -framework Cocoa \
  -framework WebKit \
  "${ROOT_DIR}/macos/LuckyBingoApp.swift" \
  -o "${BUILD_TMP}/LuckyBingo"

# 5. Assemble Lucky Bingo.app bundle
echo "==> Assembling ${APP_NAME}.app..."
rm -rf "$APP_BUNDLE"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources/app"

cp "${BUILD_TMP}/LuckyBingo" "${APP_BUNDLE}/Contents/MacOS/LuckyBingo"
chmod +x "${APP_BUNDLE}/Contents/MacOS/LuckyBingo"
cp "${BUILD_TMP}/AppIcon.icns" "${APP_BUNDLE}/Contents/Resources/AppIcon.icns"

# Copy built client, standalone server, seed patterns.json, and offline voice-cache
cp -R "${ROOT_DIR}/dist" "${APP_BUNDLE}/Contents/Resources/app/dist"
cp "${BUILD_TMP}/server.cjs" "${APP_BUNDLE}/Contents/Resources/app/server.cjs"
if [ -f "${ROOT_DIR}/patterns.json" ]; then
  cp "${ROOT_DIR}/patterns.json" "${APP_BUNDLE}/Contents/Resources/app/patterns.json"
fi
if [ -d "${ROOT_DIR}/voice-cache" ]; then
  echo "==> Bundling offline natural voices into app..."
  cp -R "${ROOT_DIR}/voice-cache" "${APP_BUNDLE}/Contents/Resources/app/voice-cache"
fi

# 6. Write Info.plist (with local network permission description + ATS local networking)
cat > "${APP_BUNDLE}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>LuckyBingo</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSLocalNetworkUsageDescription</key>
  <string>Lucky Bingo hosts a local Wi-Fi game server so players on the same network can join from their phones.</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
  </dict>
</dict>
</plist>
EOF

# 7. Ad-hoc sign so macOS Gatekeeper runs it cleanly locally
echo "==> Signing ${APP_NAME}.app (ad-hoc)..."
codesign --force --deep --sign - "$APP_BUNDLE"

# Cleanup temp build folder
rm -rf "$BUILD_TMP"

VOICE_FILES="$(find "${APP_BUNDLE}/Contents/Resources/app/voice-cache" -name '*.mp3' 2>/dev/null | wc -l | tr -d ' ')"
APP_SIZE="$(du -sh "$APP_BUNDLE" | awk '{print $1}')"
echo ""
echo "Built: ${APP_BUNDLE} (${APP_SIZE}, ${VOICE_FILES} offline natural voice MP3s)"
echo "You can double-click 'Lucky Bingo.app' or drag it into /Applications!"
