<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { EDUCATIONS, OCCUPATIONS } from '$lib/registration/options';
	import type { Person } from '$lib/registration/blank';
	import CitySelect from './CitySelect.svelte';
	import Field from './Field.svelte';
	import SacramentFields from './SacramentFields.svelte';
	import { Input } from './ui/input/index.js';
	import { errorAt, errorsUnder, translateError, type PersonErrors } from './person-errors';

	type TextKey = 'fullName' | 'nickname' | 'chineseName' | 'nik' | 'email' | 'phone' | 'birthDate';

	let {
		person = $bindable(),
		errors,
		index,
		isRegistrant,
		names
	}: {
		person: Person;
		errors?: PersonErrors;
		index: number;
		isRegistrant: boolean;
		names: Record<string, string>;
	} = $props();

	const id = $derived(`people-${index}`);
	const control =
		'h-12 w-full min-w-0 rounded-[10px] border border-control bg-surface px-3 text-text aria-invalid:border-negative';
	const relations = ['spouse', 'child', 'parent', 'sibling'] as const;
	const contactHint = $derived(
		isRegistrant ? m.field_contact_hint_self() : m.field_contact_hint_other()
	);
	const enumLabel = (prefix: string, key: string) =>
		(m as unknown as Record<string, () => string>)[`${prefix}_${key}`]();
</script>

{#snippet text(key: TextKey, label: string, type = 'text', hint?: string)}
	<Field id="{id}-{key}" {label} {hint} error={errorAt(errors, key)}>
		{#snippet children({ describedby, invalid })}
			<Input
				id="{id}-{key}"
				{type}
				bind:value={person[key]}
				aria-describedby={describedby}
				aria-invalid={invalid}
				class="h-12"
			/>
		{/snippet}
	</Field>
{/snippet}

{#snippet choice(
	key: 'relation' | 'occupation' | 'education',
	label: string,
	options: readonly string[],
	prefix: string
)}
	<Field id="{id}-{key}" {label} error={errorAt(errors, key)}>
		{#snippet children({ describedby, invalid })}
			<select
				id="{id}-{key}"
				bind:value={person[key]}
				aria-describedby={describedby}
				aria-invalid={invalid}
				class={control}
			>
				<option value={undefined} disabled>{m.common_choose()}</option>
				{#each options as option (option)}
					<option value={option}>{enumLabel(prefix, option)}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
{/snippet}

<div class="flex flex-col gap-6">
	{#if !isRegistrant}
		{@render choice('relation', m.field_relation(), relations, 'relation')}
	{/if}
	{@render text('fullName', m.field_full_name())}
	{@render text('nickname', m.field_nickname())}
	{@render text('chineseName', m.field_chinese_name(), 'text', m.common_optional())}

	<fieldset id="{id}-sex" class="min-w-0">
		<legend class="mb-2 font-semibold">{m.field_sex()}</legend>
		<div class="flex flex-wrap gap-2">
			{#each ['male', 'female'] as const as sex (sex)}
				<label
					class="flex h-12 min-w-28 cursor-pointer items-center gap-3 rounded-md border border-control px-4 hover:bg-raised has-checked:bg-active"
				>
					<input
						type="radio"
						name="{id}-sex"
						value={sex}
						bind:group={person.sex}
						class="size-5 accent-text"
					/>
					{sex === 'male' ? m.sex_male() : m.sex_female()}
				</label>
			{/each}
		</div>
		{#if errorAt(errors, 'sex')}
			<p class="mt-2 text-[0.9375rem] text-negative">{translateError(errorAt(errors, 'sex')!)}</p>
		{/if}
	</fieldset>

	{@render text('birthDate', m.field_birth_date(), 'date')}
	<CitySelect
		name="{id}-birthCityId"
		label={m.field_birth_city()}
		bind:value={person.birthCityId}
		{names}
		error={errorAt(errors, 'birthCityId')}
	/>
	{@render text('nik', m.field_nik(), 'text', m.field_nik_hint())}
	{@render text('email', m.field_email(), 'email', contactHint)}
	{@render text('phone', m.field_phone(), 'tel', contactHint)}

	<Field
		id="{id}-address-line"
		label={m.field_address_line()}
		error={errorAt(errors, 'address.line')}
	>
		{#snippet children({ describedby, invalid })}
			<Input
				id="{id}-address-line"
				bind:value={person.address.line}
				aria-describedby={describedby}
				aria-invalid={invalid}
				class="h-12"
			/>
		{/snippet}
	</Field>
	<Field
		id="{id}-address-postalCode"
		label={m.field_postal_code()}
		error={errorAt(errors, 'address.postalCode')}
	>
		{#snippet children({ describedby, invalid })}
			<Input
				id="{id}-address-postalCode"
				inputmode="numeric"
				bind:value={person.address.postalCode}
				aria-describedby={describedby}
				aria-invalid={invalid}
				class="h-12"
			/>
		{/snippet}
	</Field>
	<CitySelect
		name="{id}-address-cityId"
		label={m.field_city()}
		bind:value={person.address.cityId}
		{names}
		error={errorAt(errors, 'address.cityId')}
	/>

	{@render choice('occupation', m.field_occupation(), OCCUPATIONS, 'occupation')}
	{@render choice('education', m.field_education(), EDUCATIONS, 'education')}

	<Field
		id="{id}-previousChurch"
		label={m.field_previous_church()}
		error={errorAt(errors, 'previousChurch')}
	>
		{#snippet children({ describedby, invalid })}
			<Input
				id="{id}-previousChurch"
				value={person.previousChurch ?? ''}
				oninput={(e) => (person.previousChurch = e.currentTarget.value)}
				disabled={person.previousChurch === null}
				aria-describedby={describedby}
				aria-invalid={invalid}
				class="h-12"
			/>
		{/snippet}
	</Field>
	<label class="-mt-4 flex min-h-12 cursor-pointer items-center gap-3">
		<input
			type="checkbox"
			checked={person.previousChurch === null}
			onchange={(e) => (person.previousChurch = e.currentTarget.checked ? null : '')}
			class="size-5 accent-text"
		/>
		{m.field_no_previous_church()}
	</label>

	<SacramentFields
		bind:value={person.baptism}
		flag="baptized"
		id="{id}-baptism"
		errors={errorsUnder(errors, 'baptism')}
		labels={{
			legend: m.field_baptized(),
			date: m.field_baptism_date(),
			church: m.field_baptism_church()
		}}
	/>
	<SacramentFields
		bind:value={person.sidi}
		flag="sidi"
		id="{id}-sidi"
		errors={errorsUnder(errors, 'sidi')}
		labels={{ legend: m.field_sidi(), date: m.field_sidi_date(), church: m.field_sidi_church() }}
	/>

	{#if person.relation === 'child'}
		<label class="flex min-h-12 cursor-pointer items-center gap-3">
			<input type="checkbox" bind:checked={person.notChildOfSpouse} class="size-5 accent-text" />
			{m.field_not_child_of_spouse()}
		</label>
	{/if}
</div>
