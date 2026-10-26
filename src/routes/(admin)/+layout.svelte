<script lang="ts">
	import { page } from '$app/state';
	import CircleUserIcon from '@lucide/svelte/icons/circle-user';
	import { m } from '$lib/paraglide/messages';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import AccountPanel from '$lib/components/AccountPanel.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import StaffMenuSheet from '$lib/components/StaffMenuSheet.svelte';
	import StaffSidebar, { navItems } from '$lib/components/StaffSidebar.svelte';

	let { data, children } = $props();

	const title = $derived(navItems.find((i) => page.url.pathname.startsWith(i.href))?.label());
</script>

<div class="density-staff flex min-h-dvh bg-ground text-text">
	<StaffSidebar />

	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="flex h-12 shrink-0 items-center gap-3 px-4 min-[1100px]:justify-end min-[1100px]:px-2"
		>
			<div class="flex min-w-0 items-center gap-3 min-[1100px]:hidden">
				<BrandMark height={24} />
				<span class="truncate font-semibold">{title}</span>
			</div>
			<div class="ml-auto min-[1100px]:hidden">
				<StaffMenuSheet fullName={data.person.fullName} theme={data.theme} />
			</div>
			<div class="hidden min-[1100px]:block">
				<Dialog.Root>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="icon-staff" aria-label={m.account_label()}>
								<CircleUserIcon />
							</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>{m.account_label()}</Dialog.Title>
						</Dialog.Header>
						<AccountPanel fullName={data.person.fullName} theme={data.theme} />
					</Dialog.Content>
				</Dialog.Root>
			</div>
		</header>

		<main
			class="min-w-0 flex-1 bg-surface px-4 py-4 min-[1100px]:mr-2 min-[1100px]:mb-2 min-[1100px]:rounded-2xl min-[1100px]:border min-[1100px]:border-border min-[1100px]:p-6"
		>
			{@render children()}
		</main>
	</div>
</div>
