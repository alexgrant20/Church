<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<h1 class="text-2xl font-semibold text-slate-900">Branches</h1>

{#if form?.message}
	<p class="mt-2 text-sm text-red-600">{form.message}</p>
{/if}

<ul class="mt-4 space-y-2">
	{#each data.branches as branch (branch.id)}
		<li class="rounded-md border border-slate-200 bg-white p-3 text-sm">
			<p class="font-medium text-slate-900">{branch.name}</p>
			{#if branch.address}
				<p class="text-slate-500">{branch.address}</p>
			{/if}
		</li>
	{:else}
		<li class="text-sm text-slate-500">No branches yet.</li>
	{/each}
</ul>

<form method="POST" class="mt-6 max-w-sm space-y-3">
	<div class="space-y-1">
		<label for="name" class="text-sm font-medium text-slate-700">Name</label>
		<input
			id="name"
			name="name"
			type="text"
			required
			class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
		/>
	</div>
	<div class="space-y-1">
		<label for="address" class="text-sm font-medium text-slate-700">Address</label>
		<input
			id="address"
			name="address"
			type="text"
			class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
		/>
	</div>
	<button type="submit" class="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white">
		Add branch
	</button>
</form>
