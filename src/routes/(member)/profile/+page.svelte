<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1 class="text-2xl font-semibold">{m.profile_title()}</h1>
<p class="mt-2">{data.person.fullName}</p>
