#!/bin/zsh
# Build for the iPhone 17 Pro simulator, install, launch, screenshot.
# usage: ios/tools/sim-shot.sh <name>     -> ios/build/shots/<name>.png
set -euo pipefail
name="${1:-shot}"
here="${0:A:h}"
root="${here:h}"
bundle=com.pro7ocol.eurocrat
sim="iPhone 17 Pro"
out="$root/build/shots"
mkdir -p "$out"

cd "$root"
xcodegen generate >/dev/null
xcodebuild -project PocketEurocrat.xcodeproj -scheme PocketEurocrat \
  -destination "platform=iOS Simulator,name=$sim" -derivedDataPath build build 2>&1 | grep -E "error:|BUILD" || true
xcrun simctl boot "$sim" 2>/dev/null || true
xcrun simctl terminate booted "$bundle" 2>/dev/null || true
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/PocketEurocrat.app
xcrun simctl launch booted "$bundle" ${=SHOT_ARGS:-} >/dev/null   # e.g. SHOT_ARGS=-focus-input
sleep "${SHOT_DELAY:-4}"
xcrun simctl io booted screenshot "$out/$name.png" 2>/dev/null
echo "$out/$name.png"
