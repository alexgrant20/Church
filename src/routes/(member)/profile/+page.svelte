<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import ThemeSwitch from '$lib/components/ThemeSwitch.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1 class="text-2xl font-semibold">{m.profile_title()}</h1>
<p class="mt-2">{data.person.fullName}</p>

<div class="mt-6 flex flex-col gap-2">
	<p class="font-semibold">{m.theme_label()}</p>
	<ThemeSwitch current={data.theme} />
</div>
