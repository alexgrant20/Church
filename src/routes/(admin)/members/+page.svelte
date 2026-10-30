<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatCount } from '$lib/format';
	import MemberFilters from '$lib/components/MemberFilters.svelte';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import UnderlineTabs from '$lib/components/UnderlineTabs.svelte';
	import VirtualTable from '$lib/components/VirtualTable.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { createInfiniteList } from '$lib/components/infinite-list.svelte';
	import { fetchJsonPage } from '$lib/components/fetch-page';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = PageData['first']['items'][number];

	const phone = new MediaQuery('max-width: 640px');
	const params = $derived(
		Object.fromEntries(Object.entries(data.filters).filter(([, v]) => v)) as Record<string, string>
	);
	const list = $derived(createInfiniteList<Row>(fetchJsonPage('/api/members', params), data.first));
	const deceased = $derived(data.filters.status === 'deceased');
	const tabs = $derived([
		{ href: '?status=active', label: m.members_tab_active(), current: !deceased },
		{ href: '?status=deceased', label: m.members_tab_deceased(), current: deceased }
	]);
	const exportHref = $derived(`${resolve('/members/export')}${page.url.search}`);
	const cols = $derived(
		`grid h-full items-center gap-x-4 px-2 grid-cols-[minmax(0,1fr)_auto] ${
			data.isSuperadmin
				? 'min-[641px]:grid-cols-[minmax(0,1fr)_10rem_12rem_12rem_6rem]'
				: 'min-[641px]:grid-cols-[minmax(0,1fr)_10rem_12rem_6rem]'
		}`
	);
</script>

<svelte:head><title>{m.members_title()}</title></svelte:head>

<PageTitle title={m.members_title()}>
	{#snippet actions()}
		{#if data.canExport && !deceased}
			{#if data.exportTooLarge}
				<p id="export-too-large" class="max-w-80 text-xs text-muted">
					{m.error_export_too_large()}
				</p>
				<Button variant="outline" disabled aria-describedby="export-too-large">
					{m.members_export()}
				</Button>
			{:else}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved above, plus the query -->
				<Button variant="outline" href={exportHref} data-sveltekit-reload
					>{m.members_export()}</Button
				>
			{/if}
		{/if}
	{/snippet}
</PageTitle>

<UnderlineTabs label={m.members_tabs()} {tabs} />

<div class="flex flex-wrap items-end justify-between gap-3 py-4">
	<MemberFilters filters={data.filters} names={data.names} showBranch={data.isSuperadmin} />
	<p class="tabular text-muted">
		{m.members_count({ count: formatCount(data.total, getLocale()) })}
	</p>
</div>

{#if list.items.length === 0 && list.done}
	<p class="py-6 text-muted">
		{data.filters.q || data.filters.cityId || data.filters.branchId
			? m.members_empty_search()
			: m.members_empty()}
	</p>
{:else}
	<VirtualTable
		rows={list.items}
		rowHeight={phone.current ? 64 : 48}
		onEnd={list.loadMore}
		label={m.members_title()}
	>
		{#snippet header()}
			<div role="row" class="{cols} h-8 border-b border-rule text-xs text-muted">
				<span role="columnheader">{m.members_col_name()}</span>
				<span role="columnheader">{m.members_col_member_id()}</span>
				<span role="columnheader" class="max-[640px]:hidden">{m.members_col_city()}</span>
				{#if data.isSuperadmin}
					<span role="columnheader" class="max-[640px]:hidden">{m.members_col_branch()}</span>
				{/if}
				<span role="columnheader" class="max-[640px]:hidden">{m.members_col_status()}</span>
			</div>
		{/snippet}
		{#snippet row(r: Row)}
			<div class={cols}>
				<div role="cell" class="min-w-0">
					<a href={resolve(`/members/${r.id}`)} class="block truncate font-medium hover:underline"
						>{r.fullName}</a
					>
					<p class="truncate text-xs text-muted">
						{[r.nickname, phone.current ? r.cityName : null].filter(Boolean).join(' · ')}
					</p>
				</div>
				<span role="cell" class="tabular font-mono">{r.memberCode}</span>
				<span role="cell" class="truncate max-[640px]:hidden">{r.cityName}</span>
				{#if data.isSuperadmin}
					<span role="cell" class="truncate max-[640px]:hidden">{r.branchName}</span>
				{/if}
				<span role="cell" class="max-[640px]:hidden">
					{#if r.deceasedOn}<StatusPill tone="neutral" label={m.members_deceased()} />{/if}
				</span>
			</div>
		{/snippet}
	</VirtualTable>
	{#if list.failed}
		<p class="flex items-center gap-3 py-3 text-negative">
			{m.members_load_error()}
			<Button variant="outline" onclick={list.loadMore}>{m.common_retry()}</Button>
		</p>
	{/if}
{/if}
