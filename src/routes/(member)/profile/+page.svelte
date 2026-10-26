<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1 class="text-lg font-semibold text-slate-900">Profile</h1>
<p class="mt-2 text-sm text-slate-600">{data.person.fullName}</p>
