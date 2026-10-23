#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
dest="${1:-build/FakeIDM.app}"
node_binary="${NODE_BINARY:-$(command -v node)}"
mkdir -p "$dest/Contents/MacOS" "$dest/Contents/Resources/app"
swiftc -O -target "$(uname -m)-apple-macosx14.0" -module-cache-path "${TMPDIR:-/tmp}/fakeidm-swift-cache" -framework Cocoa -framework WebKit Launcher.swift -o "$dest/Contents/MacOS/FakeIDM"
cp "$node_binary" "$dest/Contents/Resources/node"
cp engine.mjs server.mjs platform.mjs http-policy.mjs package.json "$dest/Contents/Resources/app/"
cp -R public "$dest/Contents/Resources/app/"
cp Info.plist "$dest/Contents/Info.plist"
if [ -f FakeIDM.icns ]; then cp FakeIDM.icns "$dest/Contents/Resources/FakeIDM.icns"; fi
if [ -n "${NODE_LICENSE:-}" ]; then
  cp "$NODE_LICENSE" "$dest/Contents/Resources/NODE-LICENSE.txt"
else
  node_version=$("$node_binary" --version)
  curl --fail --location --silent --show-error "https://raw.githubusercontent.com/nodejs/node/$node_version/LICENSE" -o "$dest/Contents/Resources/NODE-LICENSE.txt"
fi
cp LICENSE "$dest/Contents/Resources/FAKEIDM-LICENSE.txt"
codesign --force --deep --sign - "$dest"
printf 'Built: %s\n' "$dest"
