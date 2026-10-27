<script lang="ts">
	import * as AlertDialog from './ui/alert-dialog/index.js';
	import { Button } from './ui/button/index.js';
	import { m } from '$lib/paraglide/messages';

	// The confirm button submits the form named by `form`, so the action runs through that form.
	let {
		label,
		title,
		description,
		confirm,
		form,
		disabled = false
	}: {
		label: string;
		title: string;
		description: string;
		confirm: string;
		form: string;
		disabled?: boolean;
	} = $props();
</script>

<AlertDialog.Root>
	<AlertDialog.Trigger {disabled}>
		{#snippet child({ props })}
			<Button {...props} variant="destructive">{label}</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action type="submit" {form} variant="destructive">{confirm}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
