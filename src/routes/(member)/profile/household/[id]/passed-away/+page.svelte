<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { translateError } from '$lib/components/person-errors';
	import { Input } from '$lib/components/ui/input/index.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);
	let confirming = $state(false);
	let deceasedOn = $state('');
	const today = new Date().toISOString().slice(0, 10);
</script>

<svelte:head><title>{data.person.fullName}</title></svelte:head>

<h1 class="text-2xl font-semibold break-words">{data.person.fullName}</h1>
<p class="mt-1 text-[0.9375rem] text-muted">{m.member_passed_away_title()}</p>

<form
	id="passed-away"
	method="POST"
	class="mt-6 flex flex-col gap-2"
	use:enhance={() => {
		// Close the confirmation so a refusal shows on the screen, not behind the overlay.
		confirming = false;
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<label for="deceased-on" class="text-lg font-semibold">{m.member_passed_away_date()}</label>
	<Input
		id="deceased-on"
		name="deceasedOn"
		type="date"
		required
		max={today}
		bind:value={deceasedOn}
		aria-invalid={form?.error ? true : undefined}
		aria-describedby={form?.error ? 'deceased-on-error' : undefined}
		class="h-12 text-lg"
	/>
	{#if form?.error}
		<p id="deceased-on-error" role="alert" class="text-[0.9375rem] text-negative">
			{translateError(form.error)}
		</p>
	{/if}
</form>
<div class="mt-8">
	<ConfirmDialog
		size="member"
		label={m.household_passed_away_submit()}
		title={m.household_passed_away_confirm({ name: data.person.fullName })}
		description={m.household_passed_away_description()}
		confirm={m.household_passed_away_submit()}
		form="passed-away"
		bind:open={confirming}
		disabled={busy || !deceasedOn}
	/>
</div>
