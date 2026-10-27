<script lang="ts" generics="T extends { id: string; name: string }">
	import { untrack, type Snippet } from 'svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import XIcon from '@lucide/svelte/icons/x';
	import { m } from '$lib/paraglide/messages';
	import { createInfiniteList } from './infinite-list.svelte';
	import { fetchJsonPage } from './fetch-page';

	let {
		id,
		label,
		endpoint,
		value = $bindable(),
		names,
		describedby,
		invalid = false,
		option,
		onchange
	}: {
		id: string;
		label: string;
		endpoint: string;
		value: string | null;
		names: Record<string, string>;
		describedby?: string;
		invalid?: boolean;
		option: Snippet<[T]>;
		onchange?: (item: T) => void;
	} = $props();

	const ROW = 48;
	let open = $state(false);
	let query = $state('');
	let active = $state(-1);
	let list = $state(createInfiniteList<T>(async () => ({ items: [], nextCursor: null })));
	let scroller = $state<HTMLDivElement | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const shown = $derived(open ? query : value ? (names[value] ?? '') : '');
	const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: 0,
		getScrollElement: () => scroller,
		estimateSize: () => ROW,
		overscan: 6
	});

	$effect(() => {
		const count = list.items.length;
		untrack(() => $virtualizer.setOptions({ count }));
	});

	$effect(() => {
		const last = $virtualizer.getVirtualItems().at(-1);
		if (open && last && last.index >= list.items.length - 1) list.loadMore();
	});

	function search(q: string) {
		list = createInfiniteList<T>(fetchJsonPage(endpoint, { q }));
		active = -1;
		list.loadMore();
	}

	function openList() {
		if (open) return;
		open = true;
		query = '';
		search('');
	}

	function close() {
		open = false;
		clearTimeout(timer);
	}

	function pick(item: T) {
		names[item.id] = item.name;
		value = item.id;
		close();
		onchange?.(item);
	}

	function move(step: number) {
		const count = list.items.length;
		if (!count) return;
		active = Math.max(0, Math.min(count - 1, active + step));
		$virtualizer.scrollToIndex(active);
	}

	function oninput(event: Event) {
		query = (event.currentTarget as HTMLInputElement).value;
		open = true;
		clearTimeout(timer);
		// Old results go at once, so Enter can never pick a match for the previous text.
		const next = createInfiniteList<T>(fetchJsonPage(endpoint, { q: query }));
		list = next;
		active = -1;
		timer = setTimeout(() => next.loadMore(), 250);
	}

	function onkeydown(event: KeyboardEvent) {
		const keys: Record<string, () => void> = {
			ArrowDown: () => (open ? move(1) : openList()),
			ArrowUp: () => move(-1),
			Enter: () => open && active >= 0 && pick(list.items[active]),
			Escape: () => close()
		};
		if (!keys[event.key] || (event.key !== 'ArrowDown' && !open)) return;
		event.preventDefault();
		keys[event.key]();
	}

	function onfocusout(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!next || !(event.currentTarget as HTMLElement).contains(next)) close();
	}
</script>

<div
	class="relative {open
		? 'max-[640px]:fixed max-[640px]:inset-0 max-[640px]:z-50 max-[640px]:flex max-[640px]:flex-col max-[640px]:gap-3 max-[640px]:bg-surface max-[640px]:p-4'
		: ''}"
	{onfocusout}
>
	{#if open}
		<div class="flex items-center justify-between min-[641px]:hidden">
			<span class="font-semibold">{label}</span>
			<button
				type="button"
				class="flex size-12 items-center justify-center rounded-md hover:bg-raised"
				aria-label={m.common_close()}
				onclick={close}
			>
				<XIcon class="size-6 text-muted" />
			</button>
		</div>
	{/if}
	<input
		{id}
		type="text"
		role="combobox"
		autocomplete="off"
		aria-expanded={open}
		aria-controls="{id}-list"
		aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
		aria-describedby={describedby}
		aria-invalid={invalid}
		value={shown}
		onclick={openList}
		{oninput}
		{onkeydown}
		class="h-12 w-full min-w-0 rounded-[10px] border border-control bg-surface px-3 text-text in-[.density-staff]:h-10 aria-invalid:border-negative"
	/>
	<div
		bind:this={scroller}
		hidden={!open}
		class="z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-[10px] border border-border bg-surface max-[640px]:max-h-none max-[640px]:flex-1 min-[641px]:absolute"
	>
		<div
			id="{id}-list"
			role="listbox"
			aria-label={label}
			class="relative w-full"
			style="height: {$virtualizer.getTotalSize()}px"
		>
			{#each $virtualizer.getVirtualItems() as row (row.key)}
				{@const item = list.items[row.index]}
				<!-- The row count lags one tick behind a new search, so a row can briefly have no item. -->
				{#if item}
					<div
						id="{id}-opt-{row.index}"
						role="option"
						aria-selected={row.index === active}
						tabindex="-1"
						class="absolute left-0 flex w-full cursor-pointer items-center px-3 hover:bg-raised {row.index ===
						active
							? 'bg-active'
							: ''}"
						style="top: {row.start}px; height: {ROW}px"
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => pick(item)}
						onkeydown={() => {}}
					>
						{@render option(item)}
					</div>
				{/if}
			{/each}
		</div>
		{#if list.failed}
			<p class="flex items-center gap-3 p-3 text-muted">
				{m.select_error()}
				<button type="button" class="underline" onclick={() => list.loadMore()}
					>{m.common_retry()}</button
				>
			</p>
		{:else if list.done && list.items.length === 0}
			<p class="p-3 text-muted">{m.select_no_results()}</p>
		{/if}
	</div>
</div>
