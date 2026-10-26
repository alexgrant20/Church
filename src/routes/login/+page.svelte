<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-slate-50 px-4">
	<form
		method="POST"
		class="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
	>
		<h1 class="text-xl font-semibold text-slate-900">{m.login_title()}</h1>

		{#if form?.error}
			<p class="text-sm text-red-600">{m[form.error]()}</p>
		{/if}

		<div class="space-y-1">
			<label for="identifier" class="text-sm font-medium text-slate-700">
				{m.login_identifier_label()}
			</label>
			<input
				id="identifier"
				name="identifier"
				type="text"
				required
				class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
			/>
		</div>

		<div class="space-y-1">
			<label for="password" class="text-sm font-medium text-slate-700">
				{m.login_password_label()}
			</label>
			<input
				id="password"
				name="password"
				type="password"
				required
				class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
			/>
		</div>

		<button
			type="submit"
			class="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
		>
			{m.login_submit()}
		</button>
	</form>
</div>
