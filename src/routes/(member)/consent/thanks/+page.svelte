<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.consent_title()}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.consent_title()}</h1>
<p class="mt-4" role="status">
	{page.url.searchParams.has('given') ? m.consent_thanks_given() : m.consent_thanks_declined()}
</p>
