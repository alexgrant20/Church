<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	onMount(() => {
		if (page.url.searchParams.has('activated')) toast.success(m.activate_done());
	});
</script>

<div class="density-member min-h-dvh bg-surface text-text min-[1100px]:flex">
	<div
		class="flex justify-center bg-logo-field px-4 py-10 min-[1100px]:w-1/2 min-[1100px]:items-center"
	>
		<img src="/brand/grii-logo-source.png" alt="GRII" class="h-20 w-auto" />
	</div>

	<main class="mx-auto w-full max-w-md px-4 py-10 min-[1100px]:flex min-[1100px]:items-center">
		<form method="POST" class="flex w-full flex-col gap-5">
			<h1 class="text-2xl font-semibold">{m.login_title()}</h1>

			{#if form?.error}
				<p role="alert" class="text-negative">{m[form.error]()}</p>
			{/if}

			<div class="flex flex-col gap-2">
				<Label for="identifier" class="text-[length:inherit] font-semibold">
					{m.login_identifier_label()}
				</Label>
				<Input id="identifier" name="identifier" type="text" required class="h-12" />
			</div>

			<div class="flex flex-col gap-2">
				<Label for="password" class="text-[length:inherit] font-semibold">
					{m.login_password_label()}
				</Label>
				<Input id="password" name="password" type="password" required class="h-12" />
			</div>

			<Button type="submit" size="member" class="h-14 w-full">{m.login_submit()}</Button>
			<a href={resolve('/activate')} class="py-3 text-center font-semibold underline"
				>{m.activate_link()}</a
			>
		</form>
	</main>
</div>
