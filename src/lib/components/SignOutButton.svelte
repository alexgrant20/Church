<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button/index.js';

	let { size = 'staff' }: { size?: 'staff' | 'member' } = $props();
</script>

<form method="POST" action="/logout">
	<Button type="submit" variant="outline" {size} class={size === 'member' ? 'w-full' : ''}>
		{m.sign_out()}
	</Button>
</form>
