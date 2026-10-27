<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { Person } from '$lib/registration/blank';
	import CitySelect from './CitySelect.svelte';
	import Field from './Field.svelte';
	import { Input } from './ui/input/index.js';
	import { errorAt, type PersonErrors } from './person-errors';

	let {
		address = $bindable(),
		id,
		errors,
		names
	}: {
		address: Person['address'];
		id: string;
		errors?: PersonErrors;
		names: Record<string, string>;
	} = $props();
</script>

<Field id="{id}-line" label={m.field_address_line()} error={errorAt(errors, 'line')}>
	{#snippet children({ describedby, invalid })}
		<Input
			id="{id}-line"
			bind:value={address.line}
			aria-describedby={describedby}
			aria-invalid={invalid}
			class="h-12"
		/>
	{/snippet}
</Field>
<Field id="{id}-postalCode" label={m.field_postal_code()} error={errorAt(errors, 'postalCode')}>
	{#snippet children({ describedby, invalid })}
		<Input
			id="{id}-postalCode"
			inputmode="numeric"
			bind:value={address.postalCode}
			aria-describedby={describedby}
			aria-invalid={invalid}
			class="h-12"
		/>
	{/snippet}
</Field>
<CitySelect
	name="{id}-cityId"
	label={m.field_city()}
	bind:value={address.cityId}
	{names}
	error={errorAt(errors, 'cityId')}
/>
