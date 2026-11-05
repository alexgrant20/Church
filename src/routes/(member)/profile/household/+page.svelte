<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button/index.js';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const done = {
		'moved-out': m.household_done_moved_out,
		'passed-away': m.household_done_passed_away,
		married: m.household_done_married
	} as const;

	// The toast reports the change made on the previous screen, then the URL forgets it.
	onMount(() => {
		const key = page.url.searchParams.get('done') as keyof typeof done | null;
		if (key && key in done) {
			toast.success(done[key]());
			replaceState(resolve('/profile/household'), {});
		}
	});
</script>

<svelte:head><title>{m.household_title()}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.household_title()}</h1>
<ul class="mt-4 flex flex-col">
	{#each data.people as p (p.id)}
		<li class="flex flex-col gap-2 border-b border-rule py-4 last:border-0">
			<p class="text-lg font-medium break-words">
				{p.fullName}{#if p.isSelf}<span class="text-[0.9375rem] text-muted">
						· {m.household_you()}</span
					>{/if}
			</p>
			{#if p.deceased}<div><StatusPill tone="neutral" label={m.members_deceased()} /></div>{/if}
			{#if p.canRecordDeath || p.canMoveOut || p.canMarry}
				<div class="flex flex-wrap gap-2">
					{#if p.canMarry}
						<Button
							variant="outline"
							size="member"
							href={resolve(`/profile/household/${p.id}/married`)}
							aria-label={m.household_married_named({ name: p.fullName })}
							>{m.member_married()}</Button
						>
					{/if}
					{#if p.canMoveOut}
						<Button
							variant="outline"
							size="member"
							href={resolve(`/profile/household/${p.id}/moved-out`)}
							aria-label={m.household_move_out_named({ name: p.fullName })}
							>{m.member_moved_out()}</Button
						>
					{/if}
					{#if p.canRecordDeath}
						<Button
							variant="outline"
							size="member"
							href={resolve(`/profile/household/${p.id}/passed-away`)}
							aria-label={m.household_passed_away_named({ name: p.fullName })}
							>{m.member_passed_away()}</Button
						>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>
