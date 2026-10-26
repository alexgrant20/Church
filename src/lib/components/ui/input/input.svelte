<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'h-10 w-full min-w-0 rounded-[10px] border border-control bg-surface px-3 text-text transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'h-10 w-full min-w-0 rounded-[10px] border border-control bg-surface px-3 text-text transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
