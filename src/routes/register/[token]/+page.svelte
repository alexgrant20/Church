<script lang="ts">
	import PublicShell from '$lib/components/PublicShell.svelte';
	import RegistrationForm from '$lib/components/RegistrationForm.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{m.register_title()}</title></svelte:head>

<PublicShell>
	<RegistrationForm form={data.form} branchName={data.branchName} />
</PublicShell>
