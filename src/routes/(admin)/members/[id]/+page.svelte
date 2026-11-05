<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { formatDate, formatMissing } from '$lib/format';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import UnderlineTabs from '$lib/components/UnderlineTabs.svelte';
	import LifeChangeDialogs from '$lib/components/LifeChangeDialogs.svelte';
	import FamilyList from './FamilyList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tab = $derived(page.url.searchParams.get('tab') === 'family' ? 'family' : 'profile');

	const r = $derived(data.record);
	const p = $derived(r.person);
	const date = (d: string | null) => (d ? formatDate(d, getLocale()) : formatMissing(null));
	const sacrament = (s: { date: string; church: string } | null) =>
		s ? `${date(s.date)} · ${s.church}` : m.common_no();
	const tabs = $derived([
		{ href: '?tab=profile', label: m.member_tab_profile(), current: tab === 'profile' },
		{ href: '?tab=family', label: m.member_tab_family(), current: tab === 'family' }
	]);
	const cards = $derived([
		{
			title: m.member_card_personal(),
			rows: [
				[m.field_nickname(), formatMissing(p.nickname)],
				[m.field_chinese_name(), formatMissing(p.chineseName)],
				[m.field_sex(), p.sex === 'male' ? m.sex_male() : m.sex_female()],
				[m.field_birth_date(), date(p.birthDate)],
				[m.field_birth_city(), formatMissing(p.birthCity)],
				[m.field_nik(), formatMissing(p.nikMasked)],
				...(p.deceasedOn ? [[m.members_deceased(), date(p.deceasedOn)]] : [])
			]
		},
		{
			title: m.member_card_address(),
			rows: [
				[m.field_address_line(), p.address.line],
				[m.field_postal_code(), formatMissing(p.address.postalCode)],
				[m.field_city(), `${p.address.city}, ${p.address.region}`],
				[m.field_branch(), p.homeBranch]
			]
		},
		...(r.profile
			? [
					{
						title: m.member_card_church(),
						rows: [
							[m.field_occupation(), m[`occupation_${r.profile.occupation}`]()],
							[m.field_education(), m[`education_${r.profile.education}`]()],
							[m.field_previous_church(), r.profile.previousChurch ?? m.field_no_previous_church()],
							[m.field_baptized(), sacrament(r.profile.baptism)],
							[m.field_sidi(), sacrament(r.profile.sidi)]
						]
					}
				]
			: []),
		{
			title: m.member_card_login(),
			rows: r.login
				? [
						[m.field_email(), formatMissing(r.login.email)],
						[m.field_phone(), formatMissing(r.login.phone)],
						[
							m.member_login_status(),
							r.login.activated ? m.member_login_activated() : m.member_login_not_activated()
						]
					]
				: [[m.member_login_status(), m.member_login_none()]]
		}
	]);
</script>

<svelte:head><title>{p.fullName}</title></svelte:head>

<header
	class="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border p-4"
>
	<div class="min-w-0">
		<h1 class="text-lg font-semibold">{p.fullName}</h1>
		<p class="text-xs text-muted">
			{[p.memberCode, p.homeBranch, p.address.city].filter(Boolean).join(' · ')}
		</p>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		{#if r.changes.canChange}
			<LifeChangeDialogs
				name={p.fullName}
				deceased={p.deceasedOn !== null}
				canUndoMoveOut={r.changes.canUndoMoveOut}
				address={p.address}
			/>
		{/if}
		{#if r.treeEnabled}
			<Button variant="outline" href={resolve(`/members/${p.id}/tree`)}>
				{m.member_family_tree()}
			</Button>
		{/if}
		{#if r.access === 'cross'}<StatusPill tone="warning" label={m.member_view_only()} />{/if}
		{#if !p.isMember}<StatusPill tone="neutral" label={m.member_not_member()} />{/if}
		{#if p.deceasedOn}<StatusPill tone="neutral" label={m.members_deceased()} />{/if}
	</div>
</header>

<UnderlineTabs label={p.fullName} {tabs} />

{#if tab === 'profile'}
	<div class="grid grid-cols-1 gap-4 py-4 min-[1100px]:grid-cols-6">
		{#each cards as card (card.title)}
			<section class="rounded-2xl border border-border p-4 min-[1100px]:col-span-3">
				<h2 class="mb-2 font-semibold">{card.title}</h2>
				<dl class="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2">
					{#each card.rows as [label, value] (label)}
						<dt class="text-muted">{label}</dt>
						<dd class="min-w-0 break-words">{value}</dd>
					{/each}
				</dl>
			</section>
		{/each}
	</div>
{:else}
	<div class="grid grid-cols-1 gap-4 py-4 min-[1100px]:grid-cols-6">
		<div class="min-[1100px]:col-span-3">
			<FamilyList title={m.member_family_household()} people={r.family.household} />
		</div>
		<div class="min-[1100px]:col-span-3">
			<FamilyList title={m.member_family_outside()} people={r.family.outside} />
		</div>
	</div>
{/if}
