/*!
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { BrowserWindow } from 'electron'
import rcompare from 'semver/functions/rcompare.js'
import valid from 'semver/functions/valid.js'
import { version } from '../../package.json'
import { BUILD_CONFIG } from '../shared/build.config.ts'
import { getAppConfig, onAppConfigChange } from './AppConfig.ts'
import { currentInstallerExt, isMac, platformTitle } from './system.utils.ts'

// A plain-numeric tag with 3 or 4 dot-separated segments and no prerelease/build
// suffix - e.g. "26.9.13" or "26.9.19.0" (this fork's CalVer YY.M.D[.ID] scheme,
// XNT-138). `semver.valid()` rejects the 4-segment shape outright, which would
// silently make every CalVer release invisible to the update checker (see
// isValidVersionTag/compareVersionTags below).
const CALVER_TAG_PATTERN = /^\d+(?:\.\d+){2,3}$/

/**
 * Whether a (possibly "v"-prefixed) tag is usable for update comparisons -
 * either real semver (upstream's tags, including prerelease/build suffixes)
 * or this fork's plain-numeric CalVer shape.
 */
function isValidVersionTag(tag: string): boolean {
	const bare = tag.replace(/^v/, '')
	return CALVER_TAG_PATTERN.test(bare) || valid(bare) !== null
}

/**
 * Compare two (possibly "v"-prefixed) version tags, as a comparator for a DESCENDING
 * sort: negative when `a` is newer than `b`.
 *
 * Never throws, whatever the shapes of the two tags. This runs inside the update
 * checker, where a throw is swallowed and silently switches update checks off for
 * every client, so every pair needs a defined answer:
 * - Two plain-numeric tags (3 or 4 segments, no suffix; this fork's CalVer, and the
 *   older 3-segment tags) compare as numeric tuples. For a non-prerelease X.Y.Z tag
 *   this is the same ordering semver itself would give.
 * - Two valid semver tags (a prerelease/build suffix, for upstream-style repositories)
 *   compare with semver.
 * - Any other pair has no common scheme, for example a four-segment CalVer tag against
 *   a semver prerelease tag (`semver.rcompare` throws on the CalVer tag), or a tag that
 *   is neither. These are ordered by shape instead: CalVer, then valid semver, then
 *   anything else. Mixed repositories are not expected; this only guarantees a
 *   deterministic answer instead of an exception.
 */
function compareVersionTags(a: string, b: string): number {
	const bareA = a.replace(/^v/, '')
	const bareB = b.replace(/^v/, '')
	const isCalVerA = CALVER_TAG_PATTERN.test(bareA)
	const isCalVerB = CALVER_TAG_PATTERN.test(bareB)
	if (isCalVerA && isCalVerB) {
		const partsA = bareA.split('.').map(Number)
		const partsB = bareB.split('.').map(Number)
		for (let i = 0; i < 4; i++) {
			const diff = (partsB[i] ?? 0) - (partsA[i] ?? 0)
			if (diff !== 0) {
				return diff
			}
		}
		return 0
	}

	const isSemverA = valid(bareA) !== null
	const isSemverB = valid(bareB) !== null
	if (isSemverA && isSemverB) {
		return rcompare(bareA, bareB)
	}

	const shapeRank = (isCalVer: boolean, isSemver: boolean) => isCalVer ? 2 : (isSemver ? 1 : 0)
	return shapeRank(isCalVerB, isSemverB) - shapeRank(isCalVerA, isSemverA)
}

/**
 * Whether tag `a` is older than or equal to tag `b`. Never throws (see compareVersionTags).
 */
export function isOlderOrEqualVersionTag(a: string, b: string): boolean {
	return compareVersionTags(a, b) >= 0
}

export type ReleaseInfo = {
	/** Version tag, e.g., "v1.0.0" */
	version: string
	/** Whether the release is a beta version, e.g., "v1.0.0-beta" */
	beta: boolean
	/** URL to the release page on GitHub */
	url: string
	/** New version installer if available for the current installation */
	installer?: {
		/** Filename of the installer, e.g., "Nextcloud.Talk-windows-x64.msi", if available */
		filename: string
		/** Direct download URL for the installer, if available */
		downloadUrl: string
	}
}

/**
 * Get the latest and stable releases
 */
async function getLatestRelease(): Promise<{ latest?: ReleaseInfo, stable?: ReleaseInfo }> {
	type GitHubReleaseResponse = {
		tag_name: string
		prerelease: boolean
		draft: boolean
		html_url: string
		assets: {
			name: string
			browser_download_url: string
		}[]
	}

	const mapGitHubReleaseToReleaseInfo = (release?: GitHubReleaseResponse): ReleaseInfo | undefined => (
		release && {
			version: release.tag_name,
			beta: release.prerelease,
			url: release.html_url,
			installer: release.assets
				.map((asset) => ({
					filename: asset.name,
					downloadUrl: asset.browser_download_url,
				}))
				.find((installer) => (
					installer.filename.startsWith(BUILD_CONFIG.applicationName.replace(/[^a-z0-9]/gi, '.'))
					&& installer.filename.includes(`-${platformTitle.toLowerCase()}-`)
					// We don't know to which architecture the app was build
					// But currently there are no alternatives, each OS has only one arch installer available
					// Checking it in case more installers are added in future (windows/linux arm64 or nor universal macOS)
					&& installer.filename.includes(isMac ? '-universal' : '-x64')
					&& installer.filename.endsWith(`.${currentInstallerExt}`))),
		})

	try {
		// Ref: https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28
		const response = await fetch(`https://api.github.com/repos/${BUILD_CONFIG.updateRepository}/releases`, {
			headers: {
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		})

		if (!response.ok) {
			// Without this a rate limit (403) or an outage looks exactly like "no update available"
			console.error(`Update check failed: ${BUILD_CONFIG.updateRepository} releases request returned HTTP ${response.status}`)
			return {
				latest: undefined,
				stable: undefined,
			}
		}

		if (response.ok) {
			const releases = (await response.json() as GitHubReleaseResponse[])
				// GitHub releases may include drafts which haven't been actually released yet
				.filter((release) => !release.draft)
				// Keep a tag that is not a version at all (say, "latest") out of the candidates,
				// so it can never be picked as the newest release. compareVersionTags() cannot
				// throw on such a tag, but it would still have to put it somewhere in the order.
				.filter((release) => isValidVersionTag(release.tag_name))
				// GitHub releases are ordered by date (ID), but we need the latest by semantic version
				.sort((a, b) => compareVersionTags(a.tag_name, b.tag_name))

			if (releases.length === 0) {
				console.warn(`Update check found no usable release tag in ${BUILD_CONFIG.updateRepository}`)
			}

			return {
				latest: mapGitHubReleaseToReleaseInfo(releases[0]),
				stable: mapGitHubReleaseToReleaseInfo(releases.find((release) => !release.prerelease)),
			}
		}
	} catch (e) {
		console.error('Update check failed:', e)
	}

	return {
		latest: undefined,
		stable: undefined,
	}
}

/**
 * Cached new version. If a new version was found we may stop requesting a new version.
 */
let cachedNewRelease: ReleaseInfo | null = null

/**
 * Check if there is a new Nextcloud Talk
 *
 * @param options - options
 * @param options.forceRequest - Force request even if there is a cached new version
 * @return true if there is a new version
 */
export async function checkForUpdate({ forceRequest = false }: { forceRequest?: boolean } = {}): Promise<ReleaseInfo | null> {
	// Every build checks its OWN release channel, configured as BUILD_CONFIG.updateRepository:
	// upstream builds check nextcloud-releases/talk-desktop, the Xenia build checks this fork.
	// This replaces the blanket isBranded guard added for XNT-77, which existed only because a
	// branded build had nowhere of its own to check: it would have contacted Nextcloud's release
	// infrastructure and, since upstream's asset filenames never match a branded applicationName,
	// come back with `installer` undefined and an "update" link pointing at Nextcloud's own
	// release page. A build with no release repository configured still checks nothing.
	// Guarding here covers every caller - including the renderer's main menu, which calls this
	// directly on every mount and never went through the scheduler's own !isBranded gate.
	if (!BUILD_CONFIG.updateRepository) {
		return null
	}

	if (cachedNewRelease && !forceRequest) {
		return cachedNewRelease
	}

	const latest = (await getLatestRelease())[getAppConfig('releaseChannel') === 'stable' ? 'stable' : 'latest']

	// Something went wrong...
	if (!latest) {
		return null
	}

	if (isOlderOrEqualVersionTag(latest.version, version)) {
		cachedNewRelease = null
		return null
	}

	cachedNewRelease = latest

	BrowserWindow.getAllWindows().forEach((window) => {
		window.webContents.send('app:update:available', latest)
	})

	return latest
}

onAppConfigChange('releaseChannel', () => checkForUpdate({ forceRequest: true }))

let schedulerIntervalId: NodeJS.Timeout | undefined

/**
 * Start scheduler with regular update checks
 *
 * @param intervalInMin - Checking interval in minutes
 */
export function setupReleaseNotificationScheduler(intervalInMin: number = 60) {
	if (schedulerIntervalId !== undefined) {
		stopReleaseNotificationScheduler()
	}

	checkForUpdate()

	const MS_IN_MIN = 60 * 1000
	schedulerIntervalId = setInterval(() => {
		checkForUpdate()
	}, intervalInMin * MS_IN_MIN)
}

/**
 * Stop the scheduler if any
 */
function stopReleaseNotificationScheduler() {
	if (schedulerIntervalId !== undefined) {
		clearInterval(schedulerIntervalId)
		schedulerIntervalId = undefined
	}
}
