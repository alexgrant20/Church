<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, finding, actions }: { title: string; finding?: string; actions?: Snippet } =
		$props();
</script>

<div class="flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0">
		<h1 class="text-[1.375rem] font-semibold">{title}</h1>
		{#if finding}
			<p class="text-xs text-muted">{finding}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex items-center gap-2">{@render actions()}</div>
	{/if}
</div>
