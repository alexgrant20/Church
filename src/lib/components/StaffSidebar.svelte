<script lang="ts" module>
	import { m } from '$lib/paraglide/messages';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Building2 from '@lucide/svelte/icons/building-2';

	export const navItems = [
		{ href: '/dashboard', label: m.nav_dashboard, icon: LayoutDashboard },
		{ href: '/branches', label: m.nav_branches, icon: Building2 }
	] as const;
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import BrandMark from './BrandMark.svelte';
</script>

<nav
	aria-label={m.nav_main()}
	class="sticky top-0 hidden h-dvh w-57 shrink-0 flex-col gap-3 p-2 min-[1100px]:flex"
>
	<BrandMark height={32} class="w-full" />
	<ul class="flex flex-col gap-0.5">
		{#each navItems as item (item.href)}
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
				</a>
			</li>
		{/each}
	</ul>
</nav>
