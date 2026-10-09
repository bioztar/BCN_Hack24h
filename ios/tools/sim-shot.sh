#!/bin/zsh
# Build for the iPhone 17 Pro simulator, install, launch, screenshot.
# usage: ios/tools/sim-shot.sh <name> [delay-seconds] [launch-args...]   -> ios/build/shots/<name>.png
#   e.g. ios/tools/sim-shot.sh kb 7 -focus-input     (keyboard up)
#        ios/tools/sim-shot.sh mouth 6 -mouth-demo   (both mouths held open)
set -euo pipefail
name="${1:-shot}"
delay="${2:-4}"
shift $(( $# < 2 ? $# : 2 ))
launch_args=("$@")
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
xcrun simctl launch booted "$bundle" "${launch_args[@]}" >/dev/null
sleep "$delay"
xcrun simctl io booted screenshot "$out/$name.png" 2>/dev/null
echo "$out/$name.png"
