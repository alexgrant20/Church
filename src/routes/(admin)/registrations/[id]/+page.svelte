<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import RegistrationPeople from '$lib/components/RegistrationPeople.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { submittedLabel } from '$lib/registration/submitted';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const reg = $derived(data.registration);
	const registrant = $derived(reg.people[0]);
	const [day, time] = $derived(submittedLabel(new Date(reg.submittedAt)).split(' ', 2));
</script>

<svelte:head><title>{registrant.fullName}</title></svelte:head>

<a href={resolve('/registrations')} class="text-muted hover:underline">{m.registration_back()}</a>

<section class="mt-3 flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-raised p-4">
	<div class="min-w-0">
		<h1 class="text-[1.125rem] font-semibold break-words">{registrant.fullName}</h1>
		<p class="text-muted">
			{m.registration_people_count({ count: reg.people.length })} ·
			<span class="tabular">{m.registration_submitted_at({ day, time })}</span> · {reg.branchName}
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<Button disabled>{m.registration_approve()}</Button>
		<Button variant="outline" disabled>{m.registration_needs_fix()}</Button>
		<Button variant="destructive" disabled>{m.registration_spam()}</Button>
	</div>
</section>

{#if reg.fixReason}
	<div class="mt-4 rounded-lg bg-raised p-4">
		<h2 class="font-semibold">{m.register_fix_reason()}</h2>
		<p class="break-words whitespace-pre-line">{reg.fixReason}</p>
	</div>
{/if}

<h2 class="mt-6 mb-2 font-semibold">{m.registration_people_heading()}</h2>
<RegistrationPeople people={reg.people} />
