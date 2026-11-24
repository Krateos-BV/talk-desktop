<!--
  - SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import { onMounted } from 'vue'
import { appData } from '../../../app/AppData.js'
import { subscribeBroadcast } from '../../../shared/broadcast.service.ts'
import { registerTalkDesktopSettingsSection } from '../Settings/index.ts'
import { onTalkHashDirty, onTalkHashUpdate, openConversation, setTalkHash } from './talk.service.ts'
import { useBadgeCountIntegration } from './useBadgeCountIntegration.ts'

// The Talk reference widget (upstream 42fd3c61) needs built-in Talk v25.0.8 or later
// (src/integrations/reference). We pin v25.0.6 until the v25.0.8 pin is compat-tested in its
// own PR (XEN-398, after the XEN-385 plan step 8); restore this import together with that pin change.
// import '@nextcloud/talk/src/integrations/reference/reference.ts'

const emit = defineEmits<{
	ready: []
}>()

onMounted(async () => {
	// Importing the main Talk entry point mounts a Vue app to the #content
	await import('@nextcloud/talk/src/main.js')

	// Additional integrations
	registerTalkDesktopSettingsSection()
	subscribeBroadcast('talk:conversation:open', ({ token, directCall }) => openConversation(token, { directCall }))
	useBadgeCountIntegration()

	// If there is a talkHash - set it initially
	if (appData.talkHash) {
		setTalkHash(appData.talkHash)
	}
	// Handle Talk Hash updates
	onTalkHashUpdate((hash: string) => {
		appData.setTalkHash(hash).persist()
	})
	onTalkHashDirty(() => {
		appData.setTalkHashDirty(true).persist()
	})

	// Ready
	emit('ready')
})
</script>

<template>
	<div id="content" />
</template>
