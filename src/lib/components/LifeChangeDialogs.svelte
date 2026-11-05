<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import AddressFields from './AddressFields.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { createDecider } from './decider.svelte';

	type Address = { line: string; postalCode: string | null; cityId: string; city: string };

	let {
		name,
		deceased,
		canUndoMoveOut,
		address
	}: { name: string; deceased: boolean; canUndoMoveOut: boolean; address: Address } = $props();

	const decider = createDecider();
	let deathOpen = $state(false);
	let moveOpen = $state(false);
	let deceasedOn = $state('');
	// svelte-ignore state_referenced_locally
	let draft = $state({
		line: address.line,
		postalCode: address.postalCode ?? '',
		cityId: address.cityId
	});
	// svelte-ignore state_referenced_locally
	const names = { [address.cityId]: address.city };
	const saved = m.common_saved();
</script>

{#if deceased}
	<form
		id="undo-passed-away"
		method="POST"
		action="?/undoPassedAway"
		use:enhance={decider.submit(saved)}
	></form>
	<ConfirmDialog
		label={m.member_undo_passed_away()}
		title={m.member_undo_passed_away()}
		description={m.member_undo_passed_away_description({ name })}
		confirm={m.member_undo_passed_away()}
		form="undo-passed-away"
		disabled={decider.busy}
	/>
{:else}
	<Dialog.Root bind:open={deathOpen}>
		<Dialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline">{m.member_passed_away()}</Button>
			{/snippet}
		</Dialog.Trigger>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{m.member_passed_away_title()}</Dialog.Title>
				<Dialog.Description>{name}</Dialog.Description>
			</Dialog.Header>
			<form
				method="POST"
				action="?/passedAway"
				use:enhance={decider.submit(saved, false, undefined, () => (deathOpen = false))}
				class="flex flex-col gap-2"
			>
				<label for="deceased-on" class="font-semibold">{m.member_passed_away_date()}</label>
				<Input id="deceased-on" name="deceasedOn" type="date" required bind:value={deceasedOn} />
				<div class="mt-2 flex justify-end">
					<Button type="submit" variant="destructive" disabled={decider.busy}>
						{m.member_passed_away_confirm({ name })}
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Root>
	{#if canUndoMoveOut}
		<form
			id="undo-moved-out"
			method="POST"
			action="?/undoMovedOut"
			use:enhance={decider.submit(saved)}
		></form>
		<ConfirmDialog
			label={m.member_move_back()}
			title={m.member_move_back()}
			description={m.member_move_back_description({ name })}
			confirm={m.member_move_back()}
			form="undo-moved-out"
			disabled={decider.busy}
		/>
	{:else}
		<Dialog.Root bind:open={moveOpen}>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline">{m.member_moved_out()}</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.member_moved_out_title()}</Dialog.Title>
					<Dialog.Description>{m.member_moved_out_description({ name })}</Dialog.Description>
				</Dialog.Header>
				<form
					method="POST"
					action="?/movedOut"
					use:enhance={decider.submit(saved, false, undefined, () => (moveOpen = false))}
					class="flex flex-col gap-3"
				>
					<AddressFields id="move" bind:address={draft} {names} />
					<input type="hidden" name="line" value={draft.line} />
					<input type="hidden" name="postalCode" value={draft.postalCode} />
					<input type="hidden" name="cityId" value={draft.cityId} />
					<div class="mt-2 flex justify-end">
						<Button type="submit" disabled={decider.busy}>{m.member_moved_out_submit()}</Button>
					</div>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
{/if}
