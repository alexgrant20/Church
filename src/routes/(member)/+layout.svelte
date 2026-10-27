<script lang="ts">
	import { page } from '$app/state';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import MemberBottomBar, { destinations } from '$lib/components/MemberBottomBar.svelte';
	import ThemeSwitch from '$lib/components/ThemeSwitch.svelte';

	let { data, children } = $props();

	const title = $derived(destinations.find((d) => page.url.pathname.startsWith(d.href))?.label());
</script>

<div
	class="density-member min-h-dvh bg-ground pb-[calc(4rem+env(safe-area-inset-bottom))] text-text"
>
	<div class="mx-auto max-w-160">
		<header class="flex min-h-12 items-center gap-3 px-4 py-1">
			<BrandMark height={24} />
			<span class="min-w-0 flex-1 truncate font-semibold">{title}</span>
			<ThemeSwitch current={data.theme} size="member" />
		</header>

		<main class="px-4 py-4">
			{@render children()}
		</main>
	</div>

	<MemberBottomBar />
</div>
