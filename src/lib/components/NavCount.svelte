<script lang="ts">
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatCount } from '$lib/format';

	let { count }: { count: number | null } = $props();
</script>

{#if count}
	<span class="tabular ml-auto text-muted">{formatCount(count, getLocale())}</span>
{/if}
