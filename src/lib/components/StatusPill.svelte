<script lang="ts">
	type Tone = 'positive' | 'negative' | 'warning' | 'neutral';

	let {
		tone,
		label,
		size = 'staff'
	}: { tone: Tone; label: string; size?: 'staff' | 'member' } = $props();

	const tones: Record<Tone, string> = {
		positive: 'bg-pill-positive-bg text-pill-positive-ink',
		negative: 'bg-pill-negative-bg text-pill-negative-ink',
		warning: 'bg-pill-warning-bg text-pill-warning-ink',
		neutral: 'bg-pill-neutral-bg text-pill-neutral-ink'
	};
</script>

<span
	class="inline-flex shrink-0 items-center rounded-full px-2 font-medium whitespace-nowrap {tones[
		tone
	]} {size === 'staff' ? 'h-5 text-xs' : 'h-6 text-[0.9375rem]'}"
>
	{label}
</span>
