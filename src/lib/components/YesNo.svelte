<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { translateError } from './person-errors';

	let {
		name,
		value = $bindable(),
		legend,
		error
	}: { name: string; value: boolean | null; legend: string; error?: string } = $props();
</script>

<fieldset
	id={name}
	data-invalid={error ? true : undefined}
	aria-describedby={error ? `${name}-error` : undefined}
	class="min-w-0"
>
	<legend class="mb-2 font-semibold">{legend}</legend>
	<div class="flex flex-wrap gap-2">
		{#each [true, false] as option (option)}
			<label
				class="flex h-12 min-w-24 cursor-pointer items-center gap-3 rounded-md border border-control px-4 hover:bg-raised has-checked:bg-active"
			>
				<input
					type="radio"
					{name}
					checked={value === option}
					onchange={() => (value = option)}
					class="size-5 accent-text"
				/>
				{option ? m.common_yes() : m.common_no()}
			</label>
		{/each}
	</div>
	{#if error}
		<p id="{name}-error" class="mt-2 text-[0.9375rem] text-negative">{translateError(error)}</p>
	{/if}
</fieldset>
