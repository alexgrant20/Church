<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { Person } from '$lib/registration/blank';

	let { people }: { people: Person[] } = $props();

	const relationLabel = (p: Person) =>
		p.relation ? (m as unknown as Record<string, () => string>)[`relation_${p.relation}`]() : '';
	const birth = (iso: string) =>
		iso
			? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeZone: 'UTC' }).format(
					new Date(iso)
				)
			: '—';
</script>

<section class="flex flex-col gap-4" aria-labelledby="review-heading">
	<h2 id="review-heading" class="text-xl font-semibold">{m.register_step_review()}</h2>
	<p>{m.register_review_intro()}</p>
	<ul class="flex flex-col gap-2">
		{#each people as person, i (i)}
			<li class="rounded-lg bg-surface px-4 py-3">
				<p class="font-semibold break-words">{person.fullName || m.register_unnamed()}</p>
				<p class="text-[0.9375rem] text-muted">
					{relationLabel(person)} · <span class="tabular">{birth(person.birthDate)}</span>
				</p>
			</li>
		{/each}
	</ul>
</section>
