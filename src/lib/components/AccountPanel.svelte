<script lang="ts">
	import ThemeSwitch from './ThemeSwitch.svelte';
	import type { Theme } from '$lib/theme';

	let { fullName, theme }: { fullName: string; theme: Theme } = $props();
</script>

<div class="flex flex-col gap-4">
	<p class="font-semibold">{fullName}</p>
	<ThemeSwitch current={theme} />
</div>
