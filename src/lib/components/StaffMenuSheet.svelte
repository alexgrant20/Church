<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { afterNavigate } from '$app/navigation';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import { m } from '$lib/paraglide/messages';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import AccountPanel from './AccountPanel.svelte';
	import NavCount from './NavCount.svelte';
	import { visibleNav } from './StaffSidebar.svelte';

	let { fullName, pendingCount }: { fullName: string; pendingCount: number | null } = $props();

	let open = $state(false);
	afterNavigate(() => (open = false));
</script>

<Sheet.Root bind:open>
	<Sheet.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-staff" aria-label={m.nav_menu()}>
				<MenuIcon />
			</Button>
		{/snippet}
	</Sheet.Trigger>
	<Sheet.Content side="bottom" class="h-dvh gap-6 overflow-y-auto p-4">
		<Sheet.Header class="p-0">
			<Sheet.Title class="text-[1.375rem] font-semibold">{m.nav_menu()}</Sheet.Title>
		</Sheet.Header>
		<nav aria-label={m.nav_main()}>
			<ul class="flex flex-col gap-1">
				{#each visibleNav(pendingCount) as item (item.href)}
					{@const active = page.url.pathname.startsWith(item.href)}
					<li>
						<a
							href={resolve(item.href)}
							aria-current={active ? 'page' : undefined}
							class="flex h-12 items-center gap-3 rounded-md px-3 hover:bg-raised {active
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
		<AccountPanel {fullName} />
	</Sheet.Content>
</Sheet.Root>
