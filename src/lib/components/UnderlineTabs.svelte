<script lang="ts">
	/* eslint svelte/no-navigation-without-resolve: "off" -- callers pass resolved or query-only hrefs */
	let {
		label,
		tabs
	}: { label: string; tabs: { href: string; label: string; current: boolean }[] } = $props();
</script>

<nav aria-label={label} class="mt-4 flex gap-6 border-b border-rule">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			aria-current={tab.current ? 'page' : undefined}
			class="-mb-px flex h-10 items-center border-b-2 hover:text-text {tab.current
				? 'border-tab font-semibold'
				: 'border-transparent text-muted'}">{tab.label}</a
		>
	{/each}
</nav>
