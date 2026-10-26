<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatCount } from '$lib/format';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PageTitle title={m.branches_title()} />

<p class="tabular mt-4 mb-2 text-right text-muted">
	{m.branches_count({ count: formatCount(data.branches.length, getLocale()) })}
</p>

<table class="w-full text-left">
	<thead>
		<tr class="border-b border-rule text-xs text-muted">
			<th scope="col" class="h-8 w-32 font-normal">{m.branches_col_code()}</th>
			<th scope="col" class="h-8 font-normal">{m.branches_col_name()}</th>
		</tr>
	</thead>
	<tbody>
		{#each data.branches as branch (branch.id)}
			<tr class="h-12 border-b border-rule">
				<td class="font-mono">{branch.code}</td>
				<td>{branch.name}</td>
			</tr>
		{:else}
			<tr class="h-12">
				<td colspan="2" class="text-muted">{m.branches_empty()}</td>
			</tr>
		{/each}
	</tbody>
</table>
