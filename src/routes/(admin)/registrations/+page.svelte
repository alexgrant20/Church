<script lang="ts">
	import { resolve } from '$app/paths';
	import { MediaQuery } from 'svelte/reactivity';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatCount } from '$lib/format';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import UnderlineTabs from '$lib/components/UnderlineTabs.svelte';
	import VirtualTable from '$lib/components/VirtualTable.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { createInfiniteList } from '$lib/components/infinite-list.svelte';
	import { fetchJsonPage } from '$lib/components/fetch-page';
	import { submittedLabel } from '$lib/registration/submitted';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = PageData['first']['items'][number];

	const phone = new MediaQuery('max-width: 640px');
	const list = $derived(
		createInfiniteList<Row>(
			fetchJsonPage('/api/registrations', { status: data.status }),
			data.first
		)
	);
	const tabs = $derived([
		{
			href: '?status=pending',
			label: m.registrations_tab_pending(),
			current: data.status === 'pending'
		},
		{
			href: '?status=needs_fix',
			label: m.registrations_tab_needs_fix(),
			current: data.status === 'needs_fix'
		}
	]);
	const cols =
		'grid h-full items-center gap-x-4 px-2 grid-cols-[minmax(0,1fr)_auto] min-[641px]:grid-cols-[minmax(0,1fr)_5rem_11rem_12rem]';
</script>

<svelte:head><title>{m.registrations_title()}</title></svelte:head>

<PageTitle
	title={m.registrations_title()}
	finding={m.registrations_waiting({ count: formatCount(data.pendingCount ?? 0, getLocale()) })}
>
	{#snippet actions()}
		<Button variant="outline" href={resolve('/registrations/link')}>
			{m.registrations_link_button()}
		</Button>
	{/snippet}
</PageTitle>

<UnderlineTabs label={m.registrations_tabs()} {tabs} />

{#if list.items.length === 0 && list.done}
	<p class="py-6 text-muted">
		{data.status === 'pending'
			? m.registrations_empty_pending()
			: m.registrations_empty_needs_fix()}
	</p>
{:else}
	<VirtualTable
		rows={list.items}
		rowHeight={phone.current ? 64 : 48}
		onEnd={list.loadMore}
		label={m.registrations_title()}
	>
		{#snippet header()}
			<div role="row" class="{cols} h-8 border-b border-rule text-xs text-muted">
				<span role="columnheader">{m.registrations_col_registrant()}</span>
				<span role="columnheader" class="text-right">{m.registrations_col_people()}</span>
				<span role="columnheader" class="max-[640px]:hidden">{m.registrations_col_submitted()}</span
				>
				<span role="columnheader" class="max-[640px]:hidden">{m.registrations_col_status()}</span>
			</div>
		{/snippet}
		{#snippet row(r: Row)}
			{@const submitted = submittedLabel(new Date(r.submittedAt))}
			<div class={cols}>
				<div role="cell" class="min-w-0">
					<a
						href={resolve(`/registrations/${r.id}`)}
						class="block truncate font-medium hover:underline">{r.registrantName}</a
					>
					<p class="truncate text-xs text-muted min-[641px]:hidden">
						{[submitted, r.waitingConsents ? m.consent_waiting() : null]
							.filter(Boolean)
							.join(' · ')}
					</p>
				</div>
				<span role="cell" class="tabular text-right">{formatCount(r.peopleCount, getLocale())}</span
				>
				<span role="cell" class="tabular max-[640px]:hidden">{submitted}</span>
				<span role="cell" class="max-[640px]:hidden">
					{#if r.waitingConsents}<StatusPill tone="warning" label={m.consent_waiting()} />{/if}
				</span>
			</div>
		{/snippet}
	</VirtualTable>
	{#if list.failed}
		<p class="flex items-center gap-3 py-3 text-negative">
			{m.registrations_load_error()}
			<Button variant="outline" onclick={list.loadMore}>{m.common_retry()}</Button>
		</p>
	{/if}
{/if}
