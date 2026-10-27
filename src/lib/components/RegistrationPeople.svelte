<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatMissing } from '$lib/format';
	import StatusPill from './StatusPill.svelte';

	type Consent = 'waiting' | 'given' | 'declined' | 'in_person_needed';
	type Person = {
		relation: string;
		fullName: string;
		birthDate: string;
		email?: string;
		phone?: string;
		nikMasked?: string;
		consent?: Consent;
		warnings: { personId: string; memberCode: string; fullName: string }[];
		otherBranchMatch: boolean;
	};

	let { people, actions }: { people: Person[]; actions?: Snippet<[Person, number]> } = $props();

	const tone = {
		waiting: 'warning',
		in_person_needed: 'warning',
		given: 'positive',
		declined: 'negative'
	} as const;
	const consentLabel = (c: Consent) =>
		(m as unknown as Record<string, () => string>)[`consent_${c}`]();
	const relationLabel = (r: string) =>
		(m as unknown as Record<string, () => string>)[`relation_${r}`]();
	const birth = (iso: string) =>
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(
			new Date(iso)
		);
	const contact = (p: Person) => formatMissing(p.email ?? p.phone);
</script>

<table class="w-full table-fixed text-left">
	<thead>
		<tr class="border-b border-rule text-xs text-muted">
			<th scope="col" class="h-8 font-normal">{m.registration_col_name()}</th>
			<th scope="col" class="h-8 w-40 font-normal max-[640px]:hidden">{m.registration_col_nik()}</th
			>
			<th scope="col" class="h-8 w-56 font-normal max-[1099px]:hidden"
				>{m.registration_col_contact()}</th
			>
			<th scope="col" class="h-8 w-48 font-normal max-[640px]:w-auto"
				>{m.registration_col_consent()}</th
			>
		</tr>
	</thead>
	<tbody>
		{#each people as person, i (i)}
			<tr class="border-b border-rule align-top">
				<td class="min-w-0 py-3 pr-4">
					<p class="font-medium break-words">{person.fullName}</p>
					<p class="text-xs text-muted">
						{relationLabel(person.relation)} ·
						<span class="tabular">{birth(person.birthDate)}</span>
					</p>
					{#if person.nikMasked || person.email || person.phone}
						<p class="text-xs break-all text-muted min-[641px]:hidden">
							{#if person.nikMasked}<span class="font-mono">{person.nikMasked}</span>{/if}
							{#if person.nikMasked && (person.email || person.phone)}·{/if}
							{person.email ?? person.phone ?? ''}
						</p>
					{/if}
					<p class="text-xs break-all text-muted max-[640px]:hidden min-[1100px]:hidden">
						{contact(person)}
					</p>
					{#each person.warnings as w (w.personId)}
						<p class="text-xs text-warning">
							{m.registration_warning_same({ code: w.memberCode, name: w.fullName })}
						</p>
					{/each}
					{#if person.otherBranchMatch}
						<p class="text-xs text-warning">{m.registration_warning_other_branch()}</p>
					{/if}
				</td>
				<td class="py-3 pr-4 font-mono max-[640px]:hidden">{formatMissing(person.nikMasked)}</td>
				<td class="py-3 pr-4 break-all max-[1099px]:hidden">{contact(person)}</td>
				<td class="py-3">
					<div class="flex flex-col items-start gap-2">
						{#if person.consent}
							<StatusPill tone={tone[person.consent]} label={consentLabel(person.consent)} />
						{/if}
						{@render actions?.(person, i)}
					</div>
				</td>
			</tr>
		{/each}
	</tbody>
</table>
