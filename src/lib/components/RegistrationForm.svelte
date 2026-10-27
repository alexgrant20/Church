<script lang="ts">
	import { tick } from 'svelte';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { m } from '$lib/paraglide/messages';
	import { blankPerson } from '$lib/registration/blank';
	import type { RegistrationInput } from '$lib/registration/schema';
	import {
		firstPersonWithError,
		validateAll,
		validatePeople,
		type FormErrors
	} from '$lib/registration/form-errors';
	import FamilyStep from './FamilyStep.svelte';
	import PersonFields from './PersonFields.svelte';
	import ReviewStep from './ReviewStep.svelte';
	import { Button } from './ui/button/index.js';
	import { translateError, type PersonErrors } from './person-errors';

	let {
		form: initial,
		branchName,
		reason,
		names: knownNames = {}
	}: {
		form: SuperValidated<RegistrationInput>;
		branchName: string;
		reason?: string;
		names?: Record<string, string>;
	} = $props();

	// svelte-ignore state_referenced_locally
	const sf = superForm(initial, {
		dataType: 'json',
		resetForm: false,
		taintedMessage: null,
		onSubmit: ({ cancel, jsonData }) => {
			const found = validateAll(draft);
			if (!found) return jsonData($state.snapshot(draft));
			cancel();
			show(found);
		},
		onUpdated: ({ form }) => {
			if (!form.valid) jump(form.errors as FormErrors);
		}
	});
	const { errors, message, enhance, submitting } = sf;

	// The draft lives in deep $state: superforms' store hands children the same object after a
	// change, which Svelte sees as no change, so conditional fields would never appear.
	// svelte-ignore state_referenced_locally
	const draft = $state({
		...initial.data,
		people: initial.data.people.length ? initial.data.people : [blankPerson('self')]
	});

	// svelte-ignore state_referenced_locally
	const names: Record<string, string> = $state({ ...knownNames });
	let step = $state(1);
	let editing = $state<number | null>(null);
	let alerting = $state(false);

	const peopleErrors = $derived(($errors as FormErrors).people as Record<string, PersonErrors>);
	const formError = $derived(
		$message ?? ((($errors as FormErrors).people as FormErrors | undefined)?._errors?.[0] || null)
	);

	function show(found: FormErrors) {
		$errors = found as typeof $errors;
		jump(found);
	}

	// Takes the person to the first answer that needs a fix, on whichever step holds it.
	async function jump(found: FormErrors) {
		const index = firstPersonWithError(found);
		alerting = true;
		if (index === null) return;
		step = index === 0 ? 1 : 2;
		editing = index === 0 ? null : index;
		await tick();
		const invalid = document.querySelector<HTMLElement>(
			'#registration [aria-invalid="true"], #registration [data-invalid]'
		);
		const target = invalid?.matches('fieldset') ? invalid.querySelector('input') : invalid;
		target?.focus();
	}

	function goTo(next: number) {
		alerting = false;
		$errors = {};
		step = next;
		window.scrollTo(0, 0);
	}

	function check(indexes: number[], then: () => void) {
		const found = validatePeople(draft.people, indexes);
		if (found) show(found);
		else then();
	}

	const familyIndexes = () => draft.people.map((_, i) => i).slice(1);
	function onDone(i: number) {
		check([i], () => {
			editing = null;
			goTo(2);
		});
	}
	function onRemove(i: number) {
		draft.people.splice(i, 1);
		editing = null;
		goTo(2);
	}
</script>

<form id="registration" method="POST" use:enhance class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.register_title()}</h1>
		<p class="text-[0.9375rem] text-muted">
			{branchName} · {m.register_step({ current: step, total: 3 })}
		</p>
	</div>

	{#if reason}
		<div class="rounded-lg bg-raised p-4">
			<h2 class="font-semibold">{m.register_fix_reason()}</h2>
			<p class="break-words whitespace-pre-line">{reason}</p>
		</div>
	{/if}

	<p role="alert" class="text-negative empty:hidden">
		{#if formError}{translateError(formError)}{:else if alerting}{m.register_check_fields()}{/if}
	</p>

	{#if step === 1}
		<section class="flex flex-col gap-6" aria-labelledby="you-heading">
			<h2 id="you-heading" class="text-xl font-semibold">{m.register_step_you()}</h2>
			<PersonFields
				bind:person={draft.people[0]}
				errors={peopleErrors?.[0]}
				index={0}
				isRegistrant
				{names}
			/>
		</section>
		<Button size="member" class="h-14 w-full" onclick={() => check([0], () => goTo(2))}>
			{m.common_next()}
		</Button>
	{:else if step === 2}
		<FamilyStep
			bind:people={draft.people}
			bind:editing
			errors={peopleErrors}
			{names}
			{onDone}
			{onRemove}
		/>
		{#if editing === null}
			<div class="flex flex-col gap-2">
				<Button
					size="member"
					class="h-14 w-full"
					onclick={() => check(familyIndexes(), () => goTo(3))}
				>
					{m.common_next()}
				</Button>
				<Button size="member" variant="outline" class="w-full" onclick={() => goTo(1)}>
					{m.common_back()}
				</Button>
			</div>
		{/if}
	{:else}
		<ReviewStep people={draft.people} />
		<div class="flex flex-col gap-2">
			<Button type="submit" size="member" class="h-14 w-full" disabled={$submitting}>
				{m.register_submit()}
			</Button>
			<Button size="member" variant="outline" class="w-full" onclick={() => goTo(2)}>
				{m.common_back()}
			</Button>
		</div>
	{/if}
</form>
