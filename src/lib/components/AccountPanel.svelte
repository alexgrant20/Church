<script lang="ts">
	import SignOutButton from './SignOutButton.svelte';

	let { fullName }: { fullName: string } = $props();
</script>

<div class="flex flex-col items-start gap-4">
	<p class="font-semibold">{fullName}</p>
	<SignOutButton />
</div>
