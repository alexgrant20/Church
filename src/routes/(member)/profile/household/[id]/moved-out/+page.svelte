<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import AddressFields from '$lib/components/AddressFields.svelte';
	import { translateError } from '$lib/components/person-errors';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The member never retypes what the app knows: the current address is the starting point.
	// svelte-ignore state_referenced_locally
	const start = data.person.address;
	let address = $state({
		line: start.line,
		postalCode: start.postalCode ?? '',
		cityId: start.cityId
	});
	const names = { [start.cityId]: start.city };
	let busy = $state(false);
</script>

<svelte:head><title>{data.person.fullName}</title></svelte:head>

<h1 class="text-2xl font-semibold break-words">{data.person.fullName}</h1>
<p class="mt-1 text-[0.9375rem] text-muted">
	{m.member_moved_out_description({ name: data.person.fullName })}
</p>

<form
	method="POST"
	class="mt-6 flex flex-col gap-4"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<AddressFields id="move" bind:address {names} />
	<input type="hidden" name="line" value={address.line} />
	<input type="hidden" name="postalCode" value={address.postalCode} />
	<input type="hidden" name="cityId" value={address.cityId} />
	{#if form?.error}
		<p role="alert" class="text-[0.9375rem] text-negative">{translateError(form.error)}</p>
	{/if}
	<Button type="submit" size="member" class="mt-4 h-14 w-full" disabled={busy}>
		{m.member_moved_out_submit()}
	</Button>
</form>
