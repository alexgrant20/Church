<script lang="ts" generics="T">
	import { untrack, type Snippet } from 'svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';

	let {
		rows,
		rowHeight,
		onEnd,
		row,
		header,
		label
	}: {
		rows: T[];
		rowHeight: number;
		onEnd: () => void;
		row: Snippet<[T]>;
		header: Snippet;
		label: string;
	} = $props();

	let scroller = $state<HTMLDivElement | null>(null);
	const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: 0,
		getScrollElement: () => scroller,
		estimateSize: () => 48,
		overscan: 8
	});

	$effect(() => {
		const count = rows.length;
		const height = rowHeight;
		untrack(() => {
			$virtualizer.setOptions({ count, estimateSize: () => height });
			$virtualizer.measure();
		});
	});

	$effect(() => {
		const last = $virtualizer.getVirtualItems().at(-1);
		if (last && last.index >= rows.length - 1) untrack(onEnd);
	});
</script>

<div
	bind:this={scroller}
	role="table"
	aria-label={label}
	aria-rowcount={rows.length + 1}
	class="max-h-[calc(100dvh-15rem)] min-h-40 overflow-y-auto"
>
	<div role="rowgroup" class="sticky top-0 z-10 bg-surface">
		{@render header()}
	</div>
	<div role="rowgroup" class="relative" style:height="{$virtualizer.getTotalSize()}px">
		{#each $virtualizer.getVirtualItems() as item (item.key)}
			{@const data = rows[item.index]}
			{#if data}
				<div
					role="row"
					aria-rowindex={item.index + 2}
					class="absolute inset-x-0 border-b border-rule"
					style:top="{item.start}px"
					style:height="{rowHeight}px"
				>
					{@render row(data)}
				</div>
			{/if}
		{/each}
	</div>
</div>
