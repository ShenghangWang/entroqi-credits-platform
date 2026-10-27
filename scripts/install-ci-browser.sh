#!/usr/bin/env bash
set -euo pipefail
# Playwright's pinned package still chooses the complete dependency list. Only
# this invocation's APT repository changes; do not rewrite runner/system sources.
[[ "$(uname -s)" == Linux ]]
release_codename="$(lsb_release -cs)"
[[ "$release_codename" =~ ^[a-z]+$ ]]
apt_directory="$(mktemp -d)"
trap 'rm -rf "$apt_directory"' EXIT
cat > "$apt_directory/ubuntu.sources" <<SOURCES
Types: deb
URIs: https://archive.ubuntu.com/ubuntu
Suites: $release_codename $release_codename-updates $release_codename-security
Components: main universe
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
SOURCES
cat > "$apt_directory/apt.conf" <<CONFIG
Dir::Etc::sourcelist "$apt_directory/ubuntu.sources";
Dir::Etc::sourceparts "-";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
Acquire::Retries "2";
CONFIG
playwright_cli="$(node -p 'require("node:path").join(require("node:path").dirname(require.resolve("playwright/package.json")), require("playwright/package.json").bin.playwright)')"
# Running only install-deps as root preserves the scoped APT_CONFIG through
# Playwright's child shell. Download Chromium as the ordinary test-runner user.
sudo timeout 300 env APT_CONFIG="$apt_directory/apt.conf" "$(command -v node)" "$playwright_cli" install-deps chromium
"$(command -v node)" "$playwright_cli" install chromium

