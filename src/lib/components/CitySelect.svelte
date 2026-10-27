<script lang="ts">
	import Field from './Field.svelte';
	import SearchSelect from './SearchSelect.svelte';

	type City = { id: string; name: string; region: string };

	let {
		value = $bindable(),
		names,
		label,
		name,
		error,
		onchange
	}: {
		value: string | null;
		names: Record<string, string>;
		label: string;
		name: string;
		error?: string;
		onchange?: (city: City) => void;
	} = $props();
</script>

<Field id={name} {label} {error}>
	{#snippet children({ describedby, invalid })}
		<SearchSelect
			id={name}
			{label}
			endpoint="/api/cities"
			bind:value
			{names}
			{describedby}
			{invalid}
			{onchange}
		>
			{#snippet option(city: City)}
				<span class="truncate">{city.name}</span>
				<span class="ml-2 truncate text-[0.9375rem] text-muted in-[.density-staff]:text-xs">
					{city.region}
				</span>
			{/snippet}
		</SearchSelect>
	{/snippet}
</Field>
