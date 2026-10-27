<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import PublicShell from './PublicShell.svelte';
</script>

<svelte:head><title>{m.register_done_title()}</title></svelte:head>

<PublicShell>
	<h1 class="text-2xl font-semibold">{m.register_done_title()}</h1>
	<p class="mt-2">{m.register_done_body()}</p>
</PublicShell>
