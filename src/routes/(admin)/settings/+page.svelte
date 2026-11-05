<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { m } from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button/index.js';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import YesNo from '$lib/components/YesNo.svelte';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, enhance, submitting } = superForm(data.form, {
		dataType: 'json',
		resetForm: false,
		taintedMessage: null,
		onUpdated: ({ form }) => {
			if (form.message === 'saved') toast.success(m.common_saved());
		}
	});
</script>

<svelte:head><title>{m.settings_title()}</title></svelte:head>

<div class="mx-auto flex max-w-[72rem] flex-col gap-8">
	<PageTitle title={m.settings_title()} />
	<section
		class="grid grid-cols-1 gap-4 border-t border-rule pt-8 min-[1100px]:grid-cols-[28rem_minmax(0,44rem)]"
	>
		<div>
			<h2 class="text-base font-medium">{m.settings_family_tree_title()}</h2>
			<p class="text-sm text-muted">{m.settings_family_tree_description()}</p>
		</div>
		<form method="POST" use:enhance class="flex flex-col gap-4 rounded-2xl bg-raised p-4">
			<YesNo
				name="familyTreeEnabled"
				legend={m.settings_family_tree_enabled()}
				bind:value={$form.familyTreeEnabled}
			/>
			<div>
				<Button type="submit" disabled={$submitting}>{m.settings_save()}</Button>
			</div>
		</form>
	</section>
</div>
