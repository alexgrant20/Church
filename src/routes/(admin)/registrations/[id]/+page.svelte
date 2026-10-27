<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import RegistrationPeople from '$lib/components/RegistrationPeople.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { submittedLabel } from '$lib/registration/submitted';
	import FixDialog from './FixDialog.svelte';
	import { createDecider } from './decider.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const decider = createDecider();
	const reg = $derived(data.registration);
	const registrant = $derived(reg.people[0]);
	const [day, time] = $derived(submittedLabel(new Date(reg.submittedAt)).split(' ', 2));
	const open = $derived(reg.status === 'pending');
	const waiting = $derived(
		reg.people.some((p) => p.consent === 'waiting' || p.consent === 'in_person_needed')
	);
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
	{#if open}
		<div class="flex flex-col items-end gap-1">
			<div class="flex flex-wrap gap-2">
				<form
					method="POST"
					action="?/approve"
					use:enhance={decider.submit(m.registration_approved(), true)}
				>
					<Button type="submit" disabled={waiting || decider.busy}>
						{m.registration_approve()}
					</Button>
				</form>
				<FixDialog
					disabled={decider.busy}
					submit={(check) => decider.submit(m.registration_sent_back(), true, check)}
				/>
				<ConfirmDialog
					label={m.registration_spam()}
					title={m.registration_spam_title({ name: registrant.fullName })}
					description={m.registration_spam_body()}
					confirm={m.registration_spam_confirm()}
					form="spam-form"
					disabled={decider.busy}
				/>
			</div>
			{#if waiting}
				<p class="text-xs text-muted">{m.registration_approve_blocked()}</p>
			{/if}
		</div>
	{/if}
</section>

<form
	id="spam-form"
	method="POST"
	action="?/spam"
	hidden
	use:enhance={decider.submit(m.registration_marked_spam(), true)}
></form>

{#if reg.fixReason}
	<div class="mt-4 rounded-lg bg-raised p-4">
		<h2 class="font-semibold">{m.register_fix_reason()}</h2>
		<p class="break-words whitespace-pre-line">{reg.fixReason}</p>
	</div>
{/if}

<h2 class="mt-6 mb-2 font-semibold">{m.registration_people_heading()}</h2>
<RegistrationPeople people={reg.people}>
	{#snippet actions(person, i)}
		{#if open && (person.consent === 'waiting' || person.consent === 'in_person_needed')}
			<form
				method="POST"
				action="?/consentInPerson"
				use:enhance={decider.submit(m.registration_consent_recorded())}
			>
				<input type="hidden" name="personIndex" value={i} />
				<Button type="submit" variant="outline" disabled={decider.busy}>
					{m.registration_consent_in_person()}
				</Button>
			</form>
		{/if}
		{#if open && !person.consent}
			{#each person.warnings as w (w.personId)}
				<form
					method="POST"
					action="?/consentRequest"
					use:enhance={decider.submit(m.registration_consent_requested())}
				>
					<input type="hidden" name="personIndex" value={i} />
					<input type="hidden" name="memberId" value={w.personId} />
					<Button
						type="submit"
						variant="outline"
						disabled={decider.busy}
						aria-label={m.registration_ask_consent({ code: w.memberCode })}
					>
						{m.registration_ask_consent_short()}
					</Button>
				</form>
			{/each}
		{/if}
	{/snippet}
</RegistrationPeople>
