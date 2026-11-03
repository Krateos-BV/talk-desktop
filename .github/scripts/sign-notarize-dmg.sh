#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 XeniaCloud
# SPDX-License-Identifier: MIT
#
# Sign, notarise and staple the macOS .dmg container, then verify it.
#
# electron-forge signs and notarises the .app bundle (packagerConfig.osxSign /
# osxNotarize), but MakerDMG only wraps that bundle in a disk image: the .dmg file
# itself comes out unsigned with no ticket stapled ("code object is not signed at
# all", spctl "rejected, source=no usable signature"). This closes that gap.
#
# Runs after `npm run package:mac`, while the signing keychain created by the
# "Import Developer ID certificate" step still exists. Any failure exits non-zero:
# a signed build must not ship an unsigned .dmg.
#
# Required env: APPLE_ID, APPLE_ID_PASSWORD (app-specific password), APPLE_TEAM_ID.
# Optional env: KEYCHAIN (default "$RUNNER_TEMP/signing.keychain-db").

set -euo pipefail

: "${APPLE_ID:?APPLE_ID is not set}"
: "${APPLE_ID_PASSWORD:?APPLE_ID_PASSWORD is not set}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID is not set}"
KEYCHAIN="${KEYCHAIN:-$RUNNER_TEMP/signing.keychain-db}"

shopt -s nullglob
dmgs=(out/make/dmg/*/*.dmg out/make/*.dmg)
shopt -u nullglob
if [ "${#dmgs[@]}" -ne 1 ]; then
  echo "::error::Expected exactly one .dmg under out/make, found ${#dmgs[@]}: ${dmgs[*]:-none}"
  exit 1
fi
DMG="${dmgs[0]}"
echo "DMG: $DMG"

# Pick the identity by hash so an extra matching identity cannot make codesign ambiguous.
IDENTITY="$(security find-identity -v -p codesigning "$KEYCHAIN" | awk '/"Developer ID Application/ { print $2; exit }')"
if [ -z "$IDENTITY" ]; then
  echo "::error::No 'Developer ID Application' identity in $KEYCHAIN"
  exit 1
fi

echo "--- sign ---"
codesign --sign "$IDENTITY" --keychain "$KEYCHAIN" --timestamp --force "$DMG"

echo "--- notarise ---"
result="$(xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID" \
  --wait --timeout 30m --output-format json)"
status="$(printf '%s' "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')"
id="$(printf '%s' "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')"
echo "submission $id: $status"
if [ "$status" != "Accepted" ]; then
  echo "::error::Notarisation of the .dmg was not accepted (status: ${status:-unknown})"
  [ -n "$id" ] && xcrun notarytool log "$id" \
    --apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID" || true
  exit 1
fi

echo "--- staple ---"
xcrun stapler staple "$DMG"

# Verify the container itself, not just the app inside it. Each command fails the
# step on a bad result.
echo "--- verify .dmg ---"
codesign --verify --strict --verbose=2 "$DMG"
codesign -dv --verbose=2 "$DMG" 2>&1 | grep -E '^(Authority|TeamIdentifier|Timestamp)='
spctl -a -vvv -t open --context context:primary-signature "$DMG"
xcrun stapler validate "$DMG"

# And the app inside the signed .dmg still passes.
echo "--- verify app inside .dmg ---"
MNT="$(mktemp -d)"
hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$DMG" >/dev/null
trap 'hdiutil detach "$MNT" >/dev/null 2>&1 || true' EXIT
APP="$(find "$MNT" -maxdepth 1 -name '*.app' -print -quit)"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl -a -vvv -t exec "$APP"
xcrun stapler validate "$APP"

echo "OK: .dmg is signed, notarised and stapled, and the app inside it passes."
