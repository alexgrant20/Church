<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { m } from '$lib/paraglide/messages';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		disabled,
		submit
	}: {
		disabled: boolean;
		submit: (check: () => boolean) => SubmitFunction;
	} = $props();

	let reason = $state('');
	let missing = $state(false);
	const check = () => !(missing = reason.trim() === '');
</script>

<Dialog.Root>
	<Dialog.Trigger {disabled}>
		{#snippet child({ props })}
			<Button {...props} variant="outline">{m.registration_needs_fix()}</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.registration_fix_title()}</Dialog.Title>
			<Dialog.Description>{m.registration_fix_body()}</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/fix" use:enhance={submit(check)} class="flex flex-col gap-2">
			<label for="fix-reason" class="font-semibold">{m.registration_fix_reason_label()}</label>
			<textarea
				id="fix-reason"
				name="reason"
				rows="4"
				maxlength="1000"
				bind:value={reason}
				aria-invalid={missing}
				aria-describedby={missing ? 'fix-reason-error' : undefined}
				class="rounded-[10px] border border-control bg-surface p-3 text-text aria-invalid:border-negative"
			></textarea>
			{#if missing}
				<p id="fix-reason-error" class="text-xs text-negative">{m.error_required()}</p>
			{/if}
			<div class="mt-2 flex justify-end">
				<Button type="submit" variant="outline">{m.registration_fix_send()}</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
