<script lang="ts">
	import PersonFields from '../PersonFields.svelte';
	import { blankPerson } from '$lib/registration/blank';
	import type { PersonErrors } from '../person-errors';

	let { errors = {} }: { errors?: PersonErrors } = $props();
	let person = $state(blankPerson('self'));
	const names: Record<string, string> = $state({});
</script>

<PersonFields bind:person {errors} index={0} isRegistrant {names} />
