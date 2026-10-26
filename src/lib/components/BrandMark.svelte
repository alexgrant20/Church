<script lang="ts">
	let { height, class: className = '' }: { height: 24 | 32; class?: string } = $props();

	// Logo 32 sits in the 56px desktop tile; logo 24 in the 40px phone tile.
	const tile = $derived(height === 32 ? 3.5 : 2.5);
	const inset = $derived(height === 32 ? 1 : 0.5);
</script>

<span
	class="inline-flex shrink-0 items-center rounded-lg bg-logo-field {className}"
	style:height="{tile}rem"
	style:padding-inline="{inset}rem"
>
	<img
		src="/brand/grii-logo-source.png"
		alt="GRII"
		style:height="{height / 16}rem"
		class="w-auto"
	/>
</span>
