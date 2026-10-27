<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { m } from '$lib/paraglide/messages';
	import BranchSelect from '$lib/components/BranchSelect.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const names = $derived(data.branch ? { [data.branch.id]: data.branch.name } : {});
	const download = $derived(
		data.link ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.link.qrSvg)}` : ''
	);

	async function copy(url: string) {
		await navigator.clipboard.writeText(url);
		toast.success(m.link_copied());
	}
</script>

<svelte:head><title>{m.link_title()}</title></svelte:head>

<PageTitle title={m.link_title()} finding={data.branch?.name} />

{#if data.canChooseBranch}
	<div class="mt-4 max-w-sm">
		<BranchSelect
			name="branch"
			value={data.branch?.id ?? null}
			{names}
			onchange={(b) => goto(`?branch=${b.id}`, { replaceState: true })}
		/>
	</div>
{/if}

{#if data.link && data.branch}
	<div class="mt-6 flex flex-col gap-6 min-[641px]:flex-row min-[641px]:items-start">
		<!-- The QR keeps a white backing in dark mode so it still scans (DESIGN.md). -->
		<div class="w-fit shrink-0 rounded-lg bg-white p-3">
			<div role="img" aria-label={m.link_qr_alt()} class="size-60 [&_svg]:size-full">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- the server renders this SVG from our own URL -->
				{@html data.link.qrSvg}
			</div>
		</div>
		<div class="flex min-w-0 flex-col gap-4">
			<p class="max-w-prose">{m.link_intro()}</p>
			<p data-testid="registration-url" class="font-mono break-all">{data.link.url}</p>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" onclick={() => copy(data.link!.url)}>{m.link_copy()}</Button>
				<Button variant="outline" href={download} download="registration-{data.branch.code}.svg"
					>{m.link_download()}</Button
				>
				<ConfirmDialog
					label={m.link_replace()}
					title={m.link_replace_title({ branch: data.branch.name })}
					description={m.link_replace_body()}
					confirm={m.link_replace()}
					form="rotate-link"
				/>
			</div>
		</div>
	</div>
	<form
		id="rotate-link"
		method="POST"
		action="?/rotate"
		hidden
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') toast.success(m.link_replaced());
			}}
	>
		<input type="hidden" name="branchId" value={data.branch.id} />
	</form>
{:else}
	<p class="mt-6 text-muted">{m.link_choose_branch()}</p>
{/if}
