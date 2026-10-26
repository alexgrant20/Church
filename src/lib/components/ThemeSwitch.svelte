<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { themes, type Theme } from '$lib/theme';

	let { current }: { current: Theme } = $props();

	let chosen = $state<Theme | null>(null);
	const value = $derived(chosen ?? current);

	const labels: Record<Theme, () => string> = {
		light: m.theme_light,
		dark: m.theme_dark,
		system: m.theme_system
	};

	async function choose(theme: Theme) {
		chosen = theme;
		await fetch('/theme', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ theme })
		});
		if (theme === 'system') document.documentElement.removeAttribute('data-theme');
		else document.documentElement.dataset.theme = theme;
	}
</script>

<div
	role="radiogroup"
	aria-label={m.theme_label()}
	class="inline-flex gap-1 rounded-lg bg-raised p-1"
>
	{#each themes as theme (theme)}
		<label
			class="flex h-12 cursor-pointer items-center rounded-md px-4 font-medium has-checked:bg-surface has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus {value ===
			theme
				? ''
				: 'text-muted'}"
		>
			<input
				type="radio"
				name="theme"
				value={theme}
				checked={value === theme}
				onchange={() => choose(theme)}
				class="sr-only"
			/>
			{labels[theme]()}
		</label>
	{/each}
</div>
