#!/bin/zsh
# Build for Zond (iPhone 14 Pro), install and launch with devicectl. Automatic signing, team in project.yml.
# usage: ios/tools/device-install.sh
# If the phone is locked the install still succeeds; launch fails with "Locked" — unlock and tap the icon.
set -uo pipefail
here="${0:A:h}"
root="${here:h}"
bundle=com.pro7ocol.eurocrat
udid=00008120-001C18A10C0BC01E                 # xcodebuild id
device=7C29C2CE-14E0-574B-B520-85623BC30754    # devicectl id

cd "$root"
xcodegen generate >/dev/null
xcodebuild -project PocketEurocrat.xcodeproj -scheme PocketEurocrat -destination "id=$udid" \
  -allowProvisioningUpdates -derivedDataPath build build 2>&1 | grep -E "error|BUILD" || true
xcrun devicectl device install app --device "$device" build/Build/Products/Debug-iphoneos/PocketEurocrat.app 2>&1 | grep -iE "error|App installed|Locked"
xcrun devicectl device process launch --device "$device" "$bundle" 2>&1 | grep -E "Launched|Locked|error" || true
