<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<div class="flex min-h-screen bg-slate-50">
	<aside class="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
		<p class="mb-6 text-sm font-semibold text-slate-900">{m.app_name()}</p>
		<nav class="space-y-1 text-sm">
			<a
				href={resolve('/dashboard')}
				class="block rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100"
			>
				{m.nav_dashboard()}
			</a>
			<a
				href={resolve('/branches')}
				class="block rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100"
			>
				{m.nav_branches()}
			</a>
		</nav>
	</aside>

	<main class="flex-1 p-6">
		{@render children()}
	</main>
</div>
