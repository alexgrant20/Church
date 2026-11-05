<script lang="ts">
	import Field from './Field.svelte';
	import SearchSelect from './SearchSelect.svelte';

	type Member = { id: string; name: string; memberCode: string };

	let {
		value = $bindable(),
		label,
		name
	}: { value: string | null; label: string; name: string } = $props();
	const names: Record<string, string> = $state({});
</script>

<Field id={name} {label}>
	{#snippet children({ describedby, invalid })}
		<SearchSelect
			id={name}
			{label}
			endpoint="/api/members"
			bind:value
			{names}
			{describedby}
			{invalid}
		>
			{#snippet option(member: Member)}
				<span class="truncate">{member.name}</span>
				<span class="ml-2 font-mono text-xs text-muted">{member.memberCode}</span>
			{/snippet}
		</SearchSelect>
	{/snippet}
</Field>
