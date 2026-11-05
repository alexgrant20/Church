<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import { tick } from 'svelte';
	import AddressFields from '$lib/components/AddressFields.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { translateError } from '$lib/components/person-errors';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// svelte-ignore state_referenced_locally
	const start = data.person.address;
	let address = $state({
		line: start.line,
		postalCode: start.postalCode ?? '',
		cityId: start.cityId
	});
	const names = { [start.cityId]: start.city };
	let step = $state(1);
	let busy = $state(false);
	let confirming = $state(false);
	let stepOne: HTMLFieldSetElement;

	// The browser checks step 1's fields before the member moves on, one message at a time.
	async function next() {
		const fields = [...stepOne.querySelectorAll('input')];
		if (!fields.every((f) => f.reportValidity())) return;
		step = 2;
		await tick();
		// The Next button just vanished; put the member on the first field of the new step.
		document.getElementById('marriage-line')?.focus();
	}
	const field = 'flex flex-col gap-1 text-lg';
</script>

<svelte:head><title>{data.person.fullName}</title></svelte:head>

<h1 class="text-2xl font-semibold break-words">{data.person.fullName}</h1>
<p class="mt-1 text-[0.9375rem] text-muted" aria-live="polite">
	{m.household_married_step({ step })}
</p>

{#snippet refusal()}
	{#if form?.error}
		<p role="alert" class="text-[0.9375rem] text-negative">{translateError(form.error)}</p>
	{/if}
{/snippet}

<form
	id="marriage-form"
	method="POST"
	class="mt-6 flex flex-col gap-4"
	use:enhance={({ cancel }) => {
		// Enter (or a phone's Go key) on step 1 must not save before the address was seen.
		if (step === 1) {
			cancel();
			next();
			return;
		}
		confirming = false;
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<fieldset
		bind:this={stepOne}
		class="flex flex-col gap-4"
		hidden={step !== 1}
		onkeydown={(e) => {
			// Enter (or a phone's Go key) in a field moves on, as a one-step form would submit.
			if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
				e.preventDefault();
				next();
			}
		}}
	>
		<label class={field}>{m.field_full_name()}<Input name="fullName" required class="h-12" /></label
		>
		<label class={field}>{m.field_nickname()}<Input name="nickname" required class="h-12" /></label>
		<fieldset class="flex flex-wrap gap-2">
			<legend class="mb-2 text-lg font-semibold">{m.field_sex()}</legend>
			{#each [['male', m.sex_male()], ['female', m.sex_female()]] as [value, label] (value)}
				<label
					class="flex h-12 min-w-24 items-center gap-3 rounded-md border border-control px-4 text-lg"
				>
					<input type="radio" name="sex" {value} required class="size-5" />{label}
				</label>
			{/each}
		</fieldset>
		<label class={field}
			>{m.field_birth_date()}<Input name="birthDate" type="date" required class="h-12" /></label
		>
		<label class={field}
			>{m.member_married_wedding_on()}<Input
				name="weddingOn"
				type="date"
				required
				class="h-12"
			/></label
		>
		{@render refusal()}
		<Button type="button" size="member" class="mt-4 h-14 w-full" onclick={next}>
			{m.common_next()}
		</Button>
	</fieldset>
	<div class="flex flex-col gap-4" hidden={step !== 2}>
		<AddressFields id="marriage" bind:address {names} />
		<input type="hidden" name="line" value={address.line} />
		<input type="hidden" name="postalCode" value={address.postalCode} />
		<input type="hidden" name="cityId" value={address.cityId} />
		{@render refusal()}
		<div class="mt-4">
			<ConfirmDialog
				size="member"
				label={m.member_married_submit()}
				title={m.member_married_confirm_title()}
				description={m.member_married_confirm_description({ name: data.person.fullName })}
				confirm={m.member_married_submit()}
				form="marriage-form"
				bind:open={confirming}
				disabled={busy}
			/>
		</div>
		<Button type="button" variant="outline" size="member" class="w-full" onclick={() => (step = 1)}>
			{m.common_back()}
		</Button>
	</div>
</form>
