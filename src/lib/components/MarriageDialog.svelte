<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import AddressFields from './AddressFields.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import MemberSelect from './MemberSelect.svelte';
	import { createDecider } from './decider.svelte';

	type Address = { line: string; postalCode: string | null; cityId: string; city: string };

	let { name, address }: { name: string; address: Address } = $props();

	const decider = createDecider();
	let open = $state(false);
	let confirming = $state(false);
	let mode = $state<'new' | 'existing'>('new');
	let spouseId = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	let draft = $state({
		line: address.line,
		postalCode: address.postalCode ?? '',
		cityId: address.cityId
	});
	// svelte-ignore state_referenced_locally
	const names = { [address.cityId]: address.city };
	const field = 'flex flex-col gap-1';
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline">{m.member_married()}</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{m.member_married_title()}</Dialog.Title>
		</Dialog.Header>
		<form
			id="marriage-form"
			method="POST"
			action={mode === 'new' ? '?/married' : '?/marriedMember'}
			use:enhance={(event) => {
				// Close the confirmation first, so a refusal's toast is not hidden behind it.
				confirming = false;
				return decider.submit(m.common_saved(), false, undefined, () => (open = false))(event);
			}}
			class="flex flex-col gap-3"
		>
			<fieldset class="flex flex-wrap gap-4">
				<legend class="mb-1 font-semibold">{m.member_married_who()}</legend>
				<label class="flex items-center gap-2">
					<input type="radio" bind:group={mode} value="new" />
					{m.member_married_new()}
				</label>
				<label class="flex items-center gap-2">
					<input type="radio" bind:group={mode} value="existing" />
					{m.member_married_existing()}
				</label>
			</fieldset>
			{#if mode === 'new'}
				<label class={field}>{m.field_full_name()}<Input name="fullName" required /></label>
				<label class={field}>{m.field_nickname()}<Input name="nickname" required /></label>
				<fieldset class="flex gap-4">
					<legend class="mb-1">{m.field_sex()}</legend>
					<label class="flex items-center gap-2"
						><input type="radio" name="sex" value="male" required /> {m.sex_male()}</label
					>
					<label class="flex items-center gap-2"
						><input type="radio" name="sex" value="female" /> {m.sex_female()}</label
					>
				</fieldset>
				<label class={field}
					>{m.field_birth_date()}<Input name="birthDate" type="date" required /></label
				>
				<p class="text-xs text-muted">{m.member_married_new_note()}</p>
			{:else}
				<MemberSelect name="spouse" label={m.member_married_spouse()} bind:value={spouseId} />
				<input type="hidden" name="spouseId" value={spouseId ?? ''} />
			{/if}
			<label class={field}
				>{m.member_married_wedding_on()}<Input name="weddingOn" type="date" required /></label
			>
			<AddressFields id="marriage" bind:address={draft} {names} />
			<input type="hidden" name="line" value={draft.line} />
			<input type="hidden" name="postalCode" value={draft.postalCode} />
			<input type="hidden" name="cityId" value={draft.cityId} />
			<div class="mt-2 flex justify-end">
				<ConfirmDialog
					label={m.member_married_submit()}
					title={m.member_married_confirm_title()}
					description={m.member_married_confirm_description({ name })}
					confirm={m.member_married_submit()}
					form="marriage-form"
					bind:open={confirming}
					disabled={decider.busy}
				/>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
