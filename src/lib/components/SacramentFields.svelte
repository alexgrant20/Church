<script lang="ts">
	import Field from './Field.svelte';
	import YesNo from './YesNo.svelte';
	import { Input } from './ui/input/index.js';
	import { errorAt, type PersonErrors } from './person-errors';

	type Sacrament = { date?: string; church?: string } & Record<string, unknown>;

	let {
		value = $bindable(),
		flag,
		id,
		errors,
		labels
	}: {
		value: Sacrament;
		flag: 'baptized' | 'sidi';
		id: string;
		errors?: PersonErrors;
		labels: { legend: string; date: string; church: string };
	} = $props();

	// Answering yes adds the two follow-up fields; no removes them, as the schema's union expects.
	const answer = {
		get: () => value[flag] as boolean | null,
		set: (yes: boolean | null) =>
			(value = yes ? { [flag]: true, date: '', church: '' } : { [flag]: false })
	};
</script>

<div class="flex flex-col gap-4">
	<YesNo
		name="{id}-{flag}"
		bind:value={answer.get, answer.set}
		legend={labels.legend}
		error={errorAt(errors, flag)}
	/>
	{#if value[flag] === true}
		<Field id="{id}-date" label={labels.date} error={errorAt(errors, 'date')}>
			{#snippet children({ describedby, invalid })}
				<Input
					id="{id}-date"
					type="date"
					bind:value={value.date}
					aria-describedby={describedby}
					aria-invalid={invalid}
					class="h-12"
				/>
			{/snippet}
		</Field>
		<Field id="{id}-church" label={labels.church} error={errorAt(errors, 'church')}>
			{#snippet children({ describedby, invalid })}
				<Input
					id="{id}-church"
					bind:value={value.church}
					aria-describedby={describedby}
					aria-invalid={invalid}
					class="h-12"
				/>
			{/snippet}
		</Field>
	{/if}
</div>
