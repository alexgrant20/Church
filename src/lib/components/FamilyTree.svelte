<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import StatusPill from './StatusPill.svelte';
	import type { FamilyTree } from '$lib/server/modules/member/tree-service';

	let { tree }: { tree: FamilyTree } = $props();

	// rem, so the diagram grows with the OS text size.
	const W = 10;
	const H = 3.5;
	const COL = W + 1.5;
	const ROW = H + 3;

	const at = $derived(new Map(tree.nodes.map((n) => [n.id, n])));
	const width = $derived(Math.max(...tree.nodes.map((n) => n.col)) * COL + W);
	const height = $derived(Math.max(...tree.nodes.map((n) => n.row)) * ROW + H);
	const centre = (n: { col: number }) => n.col * COL + W / 2;

	const spouseLines = $derived(
		tree.links.flatMap((l) => {
			const [a, b] = [at.get(l.from), at.get(l.to)];
			if (l.kind !== 'spouse' || !a || !b || a.row !== b.row) return [];
			const [left, right] = a.col < b.col ? [a, b] : [b, a];
			const y = left.row * ROW + H / 2;
			return [
				{
					key: `${l.from}-${l.to}`,
					d: `M${left.col * COL + W} ${y}H${right.col * COL}`,
					ended: l.ended
				}
			];
		})
	);

	// One elbow per child, from the middle of its recorded parents down to the child.
	const childLines = $derived(
		tree.nodes.flatMap((child) => {
			const parents = tree.links
				.filter((l) => l.kind === 'parent' && l.to === child.id)
				.flatMap((l) => at.get(l.from) ?? []);
			if (!parents.length) return [];
			const x = parents.reduce((sum, p) => sum + centre(p), 0) / parents.length;
			const top = parents[0].row * ROW + (parents.length > 1 ? H / 2 : H);
			const childTop = child.row * ROW;
			const elbow = childTop - (ROW - H) / 2;
			return [{ key: child.id, d: `M${x} ${top}V${elbow}H${centre(child)}V${childTop}` }];
		})
	);

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
			{#each spouseLines as line (line.key)}
				<path
					d={line.d}
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					vector-effect="non-scaling-stroke"
					stroke-dasharray={line.ended ? '4 4' : undefined}
				/>
			{/each}
			{#each childLines as line (line.key)}
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
					</svelte:element>
				</li>
			{/each}
		</ul>
	</div>
</div>
