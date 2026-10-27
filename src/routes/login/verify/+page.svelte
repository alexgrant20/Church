<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let seconds = $state(60);

	// The server enforces the wait; the countdown only tells the user about it.
	onMount(() => {
		const timer = setInterval(() => (seconds = Math.max(0, seconds - 1)), 1000);
		return () => clearInterval(timer);
	});
</script>

<div class="density-member min-h-dvh bg-surface text-text min-[1100px]:flex">
	<div
		class="flex justify-center bg-logo-field px-4 py-10 min-[1100px]:w-1/2 min-[1100px]:items-center"
	>
		<img src="/brand/grii-logo-source.png" alt="GRII" class="h-20 w-auto" />
	</div>

	<main class="mx-auto w-full max-w-md px-4 py-10 min-[1100px]:flex min-[1100px]:items-center">
		<div class="flex w-full flex-col gap-5">
			<h1 class="text-2xl font-semibold">{m.login_code_title()}</h1>

			{#if form?.error}
				<p role="alert" class="text-negative">{m[form.error]()}</p>
			{/if}

			<form method="POST" action="?/verify" class="flex flex-col gap-5">
				<div class="flex flex-col gap-2">
					<Label for="code" class="text-[length:inherit] font-semibold">
						{m.login_code_label()}
					</Label>
					<Input
						id="code"
						name="code"
						type="text"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength={6}
						required
						class="h-12"
					/>
				</div>
				<Button type="submit" size="member" class="h-14 w-full">{m.login_code_submit()}</Button>
			</form>

			<form method="POST" action="?/resend">
				<Button type="submit" variant="outline" size="member" class="w-full" disabled={seconds > 0}>
					{seconds > 0 ? m.login_code_resend_in({ seconds }) : m.login_code_resend()}
				</Button>
			</form>
		</div>
	</main>
</div>
