<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { m } from '$lib/paraglide/messages';
	import BranchSelect from './BranchSelect.svelte';
	import CitySelect from './CitySelect.svelte';
	import { Input } from './ui/input/index.js';
	import Field from './Field.svelte';

	type Filters = { q?: string; cityId?: string; branchId?: string; status: string };

	let {
		filters,
		names,
		showBranch
	}: { filters: Filters; names: Record<string, string>; showBranch: boolean } = $props();

	let timer: ReturnType<typeof setTimeout> | undefined;

	// Filters live in the URL, so a reload, the back button and the export link all see them.
	function set(key: string, value: string | null) {
		const query = new SvelteURLSearchParams(page.url.searchParams);
		if (value) query.set(key, value);
		else query.delete(key);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus its query
		goto(`${resolve('/members')}?${query}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function search(value: string) {
		clearTimeout(timer);
		timer = setTimeout(() => set('q', value.trim() || null), 250);
	}

	const filtered = $derived(Boolean(filters.q || filters.cityId || filters.branchId));
</script>

<div class="flex flex-wrap items-end gap-3">
	<div class="w-full min-[641px]:w-70">
		<Field id="member-search" label={m.members_search_label()}>
			{#snippet children({ describedby })}
				<Input
					id="member-search"
					type="search"
					aria-describedby={describedby}
					value={filters.q ?? ''}
					oninput={(e) => search(e.currentTarget.value)}
				/>
			{/snippet}
		</Field>
	</div>
	<div class="w-full min-[641px]:w-60">
		<CitySelect
			name="cityId"
			label={m.field_city()}
			value={filters.cityId ?? null}
			{names}
			onchange={(city) => set('cityId', city.id)}
		/>
	</div>
	{#if showBranch}
		<div class="w-full min-[641px]:w-60">
			<BranchSelect
				name="branchId"
				value={filters.branchId ?? null}
				{names}
				onchange={(branch) => set('branchId', branch.id)}
			/>
		</div>
	{/if}
	{#if filtered}
		<a
			href="{resolve('/members')}?status={filters.status}"
			class="h-9 content-center text-muted underline"
		>
			{m.members_clear_filters()}
		</a>
	{/if}
</div>
