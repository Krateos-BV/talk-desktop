/**
 * SPDX-FileCopyrightText: 2026 Krateos BV
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// XEN-398: the built-in Talk has one source of truth, the @nextcloud/talk pin in package.json.
// Every platform packages node_modules/@nextcloud/talk. This check fails the build when the
// installed package does not match the pinned tag, or when TALK_PATH would override it, so a
// drift between platforms cannot come back silently (the Windows packaging spinner hides the
// "Packaged with built-in Nextcloud Talk" line).

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

const spec = packageJson.dependencies?.['@nextcloud/talk'] ?? ''
const match = spec.match(/#v(.+)$/)
if (!match) {
	console.error(`::error::Cannot read a version tag from the @nextcloud/talk pin "${spec}"`)
	process.exit(1)
}
const pinned = match[1]

if (process.env.TALK_PATH) {
	console.error(`::error::TALK_PATH is set (${process.env.TALK_PATH}); release builds must package the pinned @nextcloud/talk`)
	process.exit(1)
}

const installedPath = require.resolve('@nextcloud/talk/package.json')
const installed = JSON.parse(readFileSync(installedPath, 'utf8')).version

if (installed !== pinned) {
	console.error(`::error::Built-in Talk mismatch: package.json pins v${pinned}, node_modules has v${installed} (${installedPath})`)
	process.exit(1)
}

console.log(`Built-in Nextcloud Talk v${installed} matches the package.json pin (${installedPath})`)
