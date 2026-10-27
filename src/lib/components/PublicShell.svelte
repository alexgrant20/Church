<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import BrandMark from './BrandMark.svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="density-member min-h-dvh bg-ground text-text">
	<div class="mx-auto max-w-160">
		<header class="flex min-h-12 items-center gap-3 px-4 py-1">
			<BrandMark height={24} />
			<span class="flex-1"></span>
			<ThemeSwitch current={page.data.theme} size="member" />
		</header>
		<main class="px-4 py-4 pb-10">
			{@render children()}
		</main>
	</div>
</div>
