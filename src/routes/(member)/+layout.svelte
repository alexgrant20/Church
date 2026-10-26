<script lang="ts">
	import { page } from '$app/state';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import MemberBottomBar, { destinations } from '$lib/components/MemberBottomBar.svelte';

	let { children } = $props();

	const title = $derived(destinations.find((d) => page.url.pathname.startsWith(d.href))?.label());
</script>

<div
	class="density-member min-h-dvh bg-ground pb-[calc(4rem+env(safe-area-inset-bottom))] text-text"
>
	<div class="mx-auto max-w-160">
		<header class="flex h-12 items-center gap-3 px-4">
			<BrandMark height={24} />
			<span class="truncate font-semibold">{title}</span>
		</header>

		<main class="px-4 py-4">
			{@render children()}
		</main>
	</div>

	<MemberBottomBar />
</div>
