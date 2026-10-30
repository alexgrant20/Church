<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import type { PageData } from './$types';

	type Relative = PageData['record']['family']['household'][number];

	let { title, people }: { title: string; people: Relative[] } = $props();

	const relation = {
		spouse: m.member_relation_spouse,
		parent: m.member_relation_parent,
		child: m.member_relation_child,
		household: m.member_relation_household
	};
</script>

<section class="rounded-2xl border border-border p-4">
	<h2 class="mb-2 font-semibold">{title}</h2>
	{#if people.length === 0}
		<p class="text-muted">{m.member_family_empty()}</p>
	{:else}
		<ul>
			{#each people as p (p.id)}
				<li class="flex min-h-12 flex-wrap items-center gap-x-3 border-b border-rule last:border-0">
					{#if p.linkable}
						<a
							href={resolve(`/members/${p.id}`)}
							data-sveltekit-preload-data="tap"
							class="font-medium hover:underline">{p.fullName}</a
						>
					{:else}
						<span class="font-medium">{p.fullName}</span>
					{/if}
					<span class="text-xs text-muted">{relation[p.relation]()}</span>
					{#if p.memberCode}
						<span class="font-mono text-xs text-muted">{p.memberCode}</span>
					{:else}
						<StatusPill tone="neutral" label={m.member_not_member()} />
					{/if}
					{#if p.deceased}<StatusPill tone="neutral" label={m.members_deceased()} />{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
