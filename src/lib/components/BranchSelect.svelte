<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import Field from './Field.svelte';
	import SearchSelect from './SearchSelect.svelte';

	type Branch = { id: string; code: string; name: string };

	let {
		value = $bindable(),
		names,
		name,
		onchange
	}: {
		value: string | null;
		names: Record<string, string>;
		name: string;
		onchange?: (branch: Branch) => void;
	} = $props();
</script>

<Field id={name} label={m.field_branch()}>
	{#snippet children({ describedby, invalid })}
		<SearchSelect
			id={name}
			label={m.field_branch()}
			endpoint="/api/branches"
			bind:value
			{names}
			{describedby}
			{invalid}
			{onchange}
		>
			{#snippet option(branch: Branch)}
				<span class="truncate">{branch.name}</span>
				<span class="ml-2 font-mono text-xs text-muted">{branch.code}</span>
			{/snippet}
		</SearchSelect>
	{/snippet}
</Field>
