<script lang="ts" module>
	import { m } from '$lib/paraglide/messages';
	import UserIcon from '@lucide/svelte/icons/user';

	// Home, Worship and Events join this array when their modules ship.
	export const destinations = [{ href: '/profile', label: m.nav_me, icon: UserIcon }] as const;
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<nav
	aria-label={m.nav_main()}
	class="fixed inset-x-0 bottom-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
>
	<ul class="mx-auto flex h-16 max-w-160">
		{#each destinations as item (item.href)}
			{@const active = page.url.pathname.startsWith(item.href)}
			<li class="flex-1">
				<a
					href={resolve(item.href)}
					aria-current={active ? 'page' : undefined}
					class="flex h-full flex-col items-center justify-center gap-0.5 text-sm {active
						? 'text-text'
						: 'text-muted'}"
				>
					<item.icon class="size-6" />
					{item.label()}
				</a>
			</li>
		{/each}
	</ul>
</nav>
