<script lang="ts">
	import type { Snippet } from 'svelte';
	import { translateError } from './person-errors';

	let {
		id,
		label,
		error,
		hint,
		children
	}: {
		id: string;
		label: string;
		error?: string;
		hint?: string;
		children: Snippet<[{ describedby?: string; invalid: boolean }]>;
	} = $props();

	const describedby = $derived(
		[error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="flex min-w-0 flex-col gap-2">
	<label for={id} class="font-semibold">{label}</label>
	{@render children({ describedby, invalid: !!error })}
	{#if error}
		<p id="{id}-error" class="text-[0.9375rem] text-negative">{translateError(error)}</p>
	{/if}
	{#if hint}
		<p id="{id}-hint" class="text-[0.9375rem] text-muted">{hint}</p>
	{/if}
</div>
