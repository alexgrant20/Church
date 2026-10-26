<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1 class="text-2xl font-semibold text-slate-900">{m.branches_title()}</h1>

<ul class="mt-4 space-y-2">
	{#each data.branches as branch (branch.id)}
		<li class="rounded-md border border-slate-200 bg-white p-3 text-sm">
			<p class="font-medium text-slate-900">{branch.name}</p>
			<p class="text-slate-500">{branch.code}</p>
		</li>
	{:else}
		<li class="text-sm text-slate-500">{m.branches_empty()}</li>
	{/each}
</ul>
