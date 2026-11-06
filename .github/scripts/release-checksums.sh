#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 XeniaCloud
# SPDX-License-Identifier: MIT
#
# Per-artifact SHA-256 checksums for a Xenia Talk release (XEN-248, fix item 2).
#
#   release-checksums.sh generate <dist-dir>
#       Writes <dist-dir>/SHA256SUMS covering every release asset in <dist-dir>
#       (everything except SHA256SUMS itself), in `sha256sum` format, sorted by
#       name, then re-checks it with `sha256sum -c`.
#
#   release-checksums.sh verify-published <local-SHA256SUMS> <published-SHA256SUMS> <release.json>
#       Checks a release as GitHub actually stored it, before it is made public:
#         1. the SHA256SUMS asset on the release is byte-identical to the one we built;
#         2. every installer asset on the release has exactly one line in it;
#         3. every line's hash equals the digest GitHub computed for that asset on
#            upload (`assets[].digest` in the release API response).
#       Check 3 means the published file is the one that was hashed in this run,
#       without downloading ~1 GB of installers again.
#
# Any mismatch exits non-zero.
#
# Note: SHA256SUMS lives on the same release as the files it describes, so it
# detects corruption and a swap of a single asset, not a compromise of the whole
# release. That is the "second layer" the ticket asks for; the first layer is the
# OS code signature (macOS today, Windows and Linux still unsigned).

set -euo pipefail

SUMS_NAME=SHA256SUMS

die() { echo "::error::$*" >&2; exit 1; }

generate() {
	local dir="$1"
	[ -d "$dir" ] || die "Not a directory: $dir"
	(
		cd "$dir"
		rm -f "$SUMS_NAME"
		shopt -s nullglob
		local files=()
		for f in *; do
			[ -f "$f" ] && [ "$f" != "$SUMS_NAME" ] && files+=("$f")
		done
		[ "${#files[@]}" -gt 0 ] || die "No release assets found in $dir"
		for f in "${files[@]}"; do
			case "$f" in
				*[[:space:]]*) die "Asset name contains whitespace, refusing to checksum: '$f'" ;;
			esac
		done
		printf '%s\n' "${files[@]}" | LC_ALL=C sort | xargs sha256sum -- > "$SUMS_NAME"
		echo "--- $SUMS_NAME ---"
		cat "$SUMS_NAME"
		echo "--- self-check ---"
		sha256sum -c --strict "$SUMS_NAME"
	)
}

verify_published() {
	local local_sums="$1" published_sums="$2" release_json="$3"
	local fail=0

	[ -f "$local_sums" ] || die "Missing local $SUMS_NAME: $local_sums"
	[ -f "$published_sums" ] || die "Missing published $SUMS_NAME: $published_sums"
	[ -f "$release_json" ] || die "Missing release JSON: $release_json"

	# 1. The checksum file on the release is the one we generated.
	if ! cmp -s "$local_sums" "$published_sums"; then
		echo "::error::Published $SUMS_NAME differs from the one generated in this run"
		diff "$local_sums" "$published_sums" || true
		fail=1
	fi

	# name<TAB>digest for every asset GitHub stored, SHA256SUMS excluded.
	local assets
	assets=$(jq -r --arg s "$SUMS_NAME" \
		'.assets[] | select(.name != $s) | [.name, (.digest // "")] | @tsv' "$release_json")
	[ -n "$assets" ] || die "Release has no assets besides $SUMS_NAME"

	jq -e --arg s "$SUMS_NAME" '[.assets[].name] | index($s) != null' "$release_json" >/dev/null \
		|| { echo "::error::$SUMS_NAME is not an asset on the release"; fail=1; }

	# 2 and 3. Each stored asset has one line, and the hashes agree.
	local name digest expected count
	while IFS=$'\t' read -r name digest; do
		count=$(awk -v n="$name" '$2 == n || $2 == "*" n' "$local_sums" | wc -l)
		if [ "$count" -ne 1 ]; then
			echo "::error::$name has $count lines in $SUMS_NAME (expected 1)"
			fail=1
			continue
		fi
		expected=$(awk -v n="$name" '$2 == n || $2 == "*" n { print $1 }' "$local_sums")
		case "$digest" in
			sha256:*) digest="${digest#sha256:}" ;;
			*)
				echo "::error::GitHub reported no sha256 digest for $name (got '$digest')"
				fail=1
				continue
				;;
		esac
		if [ "$digest" = "$expected" ]; then
			echo "OK  $name  $expected"
		else
			echo "::error::$name: GitHub digest $digest != $SUMS_NAME $expected"
			fail=1
		fi
	done <<< "$assets"

	# And nothing is listed that the release does not carry.
	local listed
	while read -r _ listed; do
		listed="${listed#\*}"
		if ! printf '%s\n' "$assets" | cut -f1 | grep -qxF -- "$listed"; then
			echo "::error::$SUMS_NAME lists $listed, which is not an asset on the release"
			fail=1
		fi
	done < "$local_sums"

	[ "$fail" -eq 0 ] || exit 1
	echo "OK: every release asset matches $SUMS_NAME and GitHub's stored digest"
}

case "${1:-}" in
	generate)
		[ $# -eq 2 ] || die "usage: $0 generate <dist-dir>"
		generate "$2"
		;;
	verify-published)
		[ $# -eq 4 ] || die "usage: $0 verify-published <local-SHA256SUMS> <published-SHA256SUMS> <release.json>"
		verify_published "$2" "$3" "$4"
		;;
	*)
		die "usage: $0 {generate <dist-dir> | verify-published <local> <published> <release.json>}"
		;;
esac
