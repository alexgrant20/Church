<script lang="ts">
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Theme } from '$lib/theme';

	let { current, size = 'staff' }: { current: Theme; size?: 'staff' | 'member' } = $props();

	// With no cookie the server can't know the OS theme, so resolve it in the browser only;
	// a $derived would run matchMedia during SSR and mismatch on hydration.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let dark = $state(false);
	$effect(() => {
		dark =
			current === 'system'
				? matchMedia('(prefers-color-scheme: dark)').matches
				: current === 'dark';
	});

	async function toggle() {
		dark = !dark;
		const theme = dark ? 'dark' : 'light';
		document.documentElement.dataset.theme = theme;
		await fetch('/theme', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ theme })
		});
	}
</script>

<Button
	variant="ghost"
	size={size === 'member' ? 'icon-member' : 'icon-staff'}
	aria-label={m.theme_dark()}
	aria-pressed={dark}
	title={m.theme_dark()}
	onclick={toggle}
>
	<!-- CSS picks the icon so it is right in the first paint, before the effect runs. -->
	<MoonIcon class="dark:hidden" aria-hidden="true" />
	<SunIcon class="hidden dark:block" aria-hidden="true" />
</Button>
