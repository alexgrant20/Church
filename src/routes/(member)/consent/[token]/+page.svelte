<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button/index.js';
	import { translateError } from '$lib/components/person-errors';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let sending = $state(false);
</script>

<svelte:head><title>{m.consent_title()}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.consent_title()}</h1>

<p class="mt-4">
	{m.consent_body({ name: data.consent.registrantName, branch: data.consent.branchName })}
</p>
{#if form?.error}
	<p role="alert" class="mt-4 text-negative">{translateError(String(form.error))}</p>
{/if}
<form
	method="POST"
	class="mt-6 flex flex-col gap-2"
	use:enhance={() => {
		sending = true;
		return async ({ update }) => {
			await update();
			sending = false;
		};
	}}
>
	<Button
		type="submit"
		name="decision"
		value="given"
		size="member"
		class="h-14 w-full"
		disabled={sending}
	>
		{m.consent_yes()}
	</Button>
	<Button
		type="submit"
		name="decision"
		value="declined"
		size="member"
		variant="outline"
		class="h-14 w-full"
		disabled={sending}
	>
		{m.consent_no()}
	</Button>
</form>
