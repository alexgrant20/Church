<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import SignOutButton from '$lib/components/SignOutButton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1 class="text-2xl font-semibold">{m.profile_title()}</h1>
<p class="mt-2">{data.person.fullName}</p>

{#if data.canOpenHousehold}
	<a
		href={resolve('/profile/household')}
		class="mt-6 flex min-h-12 items-center rounded-md border border-control px-4 text-lg hover:bg-raised"
		>{m.household_link()}</a
	>
{/if}

<div class="mt-8">
	<SignOutButton size="member" />
</div>
