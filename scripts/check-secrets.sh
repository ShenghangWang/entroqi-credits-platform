#!/bin/sh
# Scan privately with the upstream MIT CLI, never a third-party upload service.
set -eu
scan_root=$(git rev-parse --show-toplevel)
scan_temp=$(mktemp -d)
trap 'rm -rf "$scan_temp"' EXIT HUP INT TERM
case "$(uname -s):$(uname -m)" in
  Linux:x86_64)
    scan_asset=linux_x64
    scan_sha=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb ;;
  Darwin:x86_64)
    scan_asset=darwin_x64
    scan_sha=dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709 ;;
  Darwin:arm64)
    scan_asset=darwin_arm64
    scan_sha=b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5 ;;
  *) echo "Unsupported secret scanner platform." >&2; exit 2 ;;
esac
curl --fail --location --silent --show-error --max-time 60 \
  "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_${scan_asset}.tar.gz" \
  --output "$scan_temp/scanner.tar.gz"
if command -v sha256sum >/dev/null 2>&1; then
  scan_actual=$(sha256sum "$scan_temp/scanner.tar.gz" | cut -d ' ' -f 1)
else
  scan_actual=$(shasum -a 256 "$scan_temp/scanner.tar.gz" | cut -d ' ' -f 1)
fi
[ "$scan_actual" = "$scan_sha" ] || { echo "Secret scanner checksum mismatch." >&2; exit 2; }
tar -xzf "$scan_temp/scanner.tar.gz" -C "$scan_temp" gitleaks LICENSE
# Current committed snapshot, including unchanged tracked files; exclude installs,
# local credentials and generated artifacts by using git's own file manifest.
mkdir "$scan_temp/snapshot"
git -C "$scan_root" archive HEAD | tar -xf - -C "$scan_temp/snapshot"
"$scan_temp/gitleaks" dir "$scan_temp/snapshot" --redact=100 --no-banner --log-level=error --ignore-gitleaks-allow
# CI checks out complete history. Refuse a misleading partial-history result.
[ "$(git -C "$scan_root" rev-parse --is-shallow-repository)" = false ] || {
  echo "Full secret history scan requires a non-shallow checkout." >&2; exit 2;
}
"$scan_temp/gitleaks" git "$scan_root" --redact=100 --no-banner --log-level=error --ignore-gitleaks-allow
echo "Gitleaks v8.30.1: committed snapshot and available Git history passed."
