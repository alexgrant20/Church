<script lang="ts">
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<div class="min-h-screen bg-slate-50 pb-16">
	<header class="border-b border-slate-200 bg-white p-4">
		<p class="text-sm font-semibold text-slate-900">ChurchApp</p>
	</header>

	<main class="p-4">
		{@render children()}
	</main>

	<nav
		class="fixed inset-x-0 bottom-0 flex justify-around border-t border-slate-200 bg-white py-2 text-sm"
	>
		<a href={resolve('/profile')} class="px-3 py-1 text-slate-700">Profile</a>
	</nav>
</div>
