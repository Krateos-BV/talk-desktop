/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Awaitable } from '../shared/utils.types.ts'

import { version } from '../../package.json' with { type: 'json' }
import { getAppConfig, setAppConfig } from './AppConfig.ts'
import { isOlderOrEqualVersionTag } from './githubRelease.service.ts'
import { migrations } from './migrations/migrations.ts'
import { relaunchApp } from './system.utils.ts'

export type Migration = {
	/** Migration name for logging purposes */
	name: string

	/** Whether to run this migration on the first start of the application after installation */
	onFirstStart?: boolean

	/** Whether to run this migration on application upgrade */
	onUpgrade?: boolean

	/** Whether the application requires a relaunch after this migration */
	requiresRelaunch?: boolean

	/** Determine whether the migration should run if it is only needed in certain conditions */
	validator?: () => Awaitable<boolean>

	/** Migration execution */
	up(): Awaitable<void>
}

let relaunchRequired = false

/**
 * Whether the running version is newer than the version the app last ran as.
 *
 * Must never throw: this runs inside `await runMigrations()` during startup, so a
 * rejection here prevents the app from opening a window. This fork's CalVer version
 * (YY.M.D.ID) is not valid semver, so `semver.gt()` throws on it, and the stored
 * `lastAppVersion` of an older install may be a different shape again (for example
 * a semver prerelease tag). When the two cannot be compared, treat any difference
 * as an upgrade.
 *
 * @param lastAppVersion - Version the application last ran as
 */
function isUpgradeFrom(lastAppVersion: string): boolean {
	try {
		return !isOlderOrEqualVersionTag(version, lastAppVersion)
	} catch {
		return version !== lastAppVersion
	}
}

/**
 * Run migration
 *
 * @param migration - Migration
 */
async function runMigration(migration: Migration): Promise<void> {
	const lastAppVersion = getAppConfig('lastAppVersion')

	const matchesFirstStart = migration.onFirstStart && !lastAppVersion
	const matchesUpgrade = migration.onUpgrade && lastAppVersion && isUpgradeFrom(lastAppVersion)
	if (!matchesFirstStart && !matchesUpgrade) {
		return
	}

	const matchesValidator = await migration.validator?.() ?? true
	if (!matchesValidator) {
		return
	}

	try {
		console.log(`Running migration "${migration.name}"`)
		await migration.up()

		if (migration.requiresRelaunch) {
			console.log(`Migration "${migration.name}" requires relaunch`)
			relaunchRequired = true
		}
	} catch (error) {
		console.error(`Unexpected exception during migration "${migration.name}":`, (error as Error).message)
	}
}

/**
 * Run all migrations and update last version
 */
export async function runMigrations() {
	for (const migration of migrations) {
		await runMigration(migration)
	}

	// Migrations are complete - now the app is on the new version
	setAppConfig('lastAppVersion', version)

	if (relaunchRequired) {
		relaunchApp()
	}
}
