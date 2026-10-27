<script lang="ts" module>
	import { m } from '$lib/paraglide/messages';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Building2 from '@lucide/svelte/icons/building-2';
	import Inbox from '@lucide/svelte/icons/inbox';

	// A queue item shows its count, and only to staff who work that queue (count is not null).
	export const navItems = [
		{ href: '/dashboard', label: m.nav_dashboard, icon: LayoutDashboard, queue: false },
		{ href: '/registrations', label: m.nav_registrations, icon: Inbox, queue: true },
		{ href: '/branches', label: m.nav_branches, icon: Building2, queue: false }
	] as const;

	export const visibleNav = (pendingCount: number | null) =>
		navItems.filter((i) => !i.queue || pendingCount !== null);
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import BrandMark from './BrandMark.svelte';
	import NavCount from './NavCount.svelte';

	let { pendingCount }: { pendingCount: number | null } = $props();
</script>

<nav
	aria-label={m.nav_main()}
	class="sticky top-0 hidden h-dvh w-57 shrink-0 flex-col gap-3 p-2 min-[1100px]:flex"
>
	<BrandMark height={32} class="w-full" />
	<ul class="flex flex-col gap-0.5">
		{#each visibleNav(pendingCount) as item (item.href)}
			{@const active = page.url.pathname.startsWith(item.href)}
			<li>
				<a
					href={resolve(item.href)}
					aria-current={active ? 'page' : undefined}
					class="flex h-[2.125rem] items-center gap-2 rounded-md px-2 hover:bg-raised {active
						? 'bg-active'
						: ''}"
				>
					<item.icon class="size-4 text-muted" />
					{item.label()}
					{#if item.queue}<NavCount count={pendingCount} />{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>
