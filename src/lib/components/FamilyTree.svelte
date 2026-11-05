<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import StatusPill from './StatusPill.svelte';
	import { getLocale } from '$lib/paraglide/runtime';
	import { COL, H, ROW, W, relationsOf, treeLines, type FamilyTree } from '$lib/family-tree';

	let { tree }: { tree: FamilyTree } = $props();

	const width = $derived(Math.max(...tree.nodes.map((n) => n.col)) * COL + W);
	const height = $derived(Math.max(...tree.nodes.map((n) => n.row)) * ROW + H);
	const lines = $derived(treeLines(tree));

	// The lines are hidden from screen readers, so each person also carries them as words.
	function describe(id: string) {
		const list = new Intl.ListFormat(getLocale(), { type: 'conjunction' });
		const r = relationsOf(tree, id);
		return [
			r.parents.length ? m.member_tree_child_of({ names: list.format(r.parents) }) : '',
			r.spouses.length ? m.member_tree_spouse_of({ names: list.format(r.spouses) }) : '',
			r.formerSpouses.length
				? m.member_tree_former_spouse_of({ names: list.format(r.formerSpouses) })
				: '',
			r.children.length ? m.member_tree_parent_of({ names: list.format(r.children) }) : ''
		]
			.filter(Boolean)
			.join('. ');
	}

	// Opens on the highlighted person; 'nearest' keeps the page itself from jumping down.
	function scrollToRoot(node: HTMLElement, isRoot: boolean) {
		if (isRoot) node.scrollIntoView({ block: 'nearest', inline: 'center' });
	}
</script>

<div class="overflow-auto rounded-2xl border border-border p-4">
	<div class="relative" style:width="{width}rem" style:height="{height}rem">
		<svg
			aria-hidden="true"
			class="absolute inset-0 overflow-visible text-control"
			style:width="{width}rem"
			style:height="{height}rem"
			viewBox="0 0 {width} {height}"
		>
			{#each lines.spouses as line (line.key)}
				<path
					d={line.d}
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					vector-effect="non-scaling-stroke"
					stroke-dasharray={line.ended ? '4 4' : undefined}
				/>
			{/each}
			{#each lines.families as line (line.key)}
				<path
					d={line.d}
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					vector-effect="non-scaling-stroke"
				/>
			{/each}
		</svg>
		<ul aria-label={m.member_family_tree()}>
			{#each tree.nodes as n (n.id)}
				{@const root = n.id === tree.rootId}
				<li
					class="absolute"
					style:left="{n.col * COL}rem"
					style:top="{n.row * ROW}rem"
					style:width="{W}rem"
					style:min-height="{H}rem"
				>
					<svelte:element
						this={n.linkable ? 'a' : 'div'}
						href={n.linkable ? resolve(`/members/${n.id}`) : undefined}
						aria-current={root ? 'true' : undefined}
						use:scrollToRoot={root}
						class="flex min-h-12 flex-col justify-center rounded-lg bg-surface px-2 py-1 {root
							? 'border-2 border-brand'
							: 'border border-border'} {n.linkable ? 'hover:bg-raised' : ''}"
					>
						<span class="truncate text-sm font-medium">{n.fullName}</span>
						<span class="flex flex-wrap items-center gap-1">
							{#if n.memberCode}
								<span class="font-mono text-xs text-muted">{n.memberCode}</span>
							{:else}
								<StatusPill tone="neutral" label={m.member_not_member()} />
							{/if}
							{#if n.deceased}<StatusPill tone="neutral" label={m.members_deceased()} />{/if}
						</span>
						<span class="sr-only">{describe(n.id)}</span>
					</svelte:element>
				</li>
			{/each}
		</ul>
	</div>
</div>
