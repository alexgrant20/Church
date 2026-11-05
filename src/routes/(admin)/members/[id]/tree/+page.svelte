<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button/index.js';
	import FamilyTree from '$lib/components/FamilyTree.svelte';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tree = $derived(data.tree);
	const finding = $derived(
		tree.truncated ? m.member_family_tree_truncated({ count: tree.nodes.length }) : tree.rootName
	);
</script>

<svelte:head><title>{m.member_family_tree()} · {tree.rootName}</title></svelte:head>

<div class="flex flex-col gap-4">
	<PageTitle title={m.member_family_tree()} {finding}>
		{#snippet actions()}
			<Button variant="outline" href={resolve(`/members/${tree.rootId}`)}>
				{m.member_back_to_record()}
			</Button>
		{/snippet}
	</PageTitle>
	<FamilyTree {tree} />
</div>
