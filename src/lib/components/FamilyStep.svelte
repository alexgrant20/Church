<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { blankPerson, type Person, type Relation } from '$lib/registration/blank';
	import PersonFields from './PersonFields.svelte';
	import StatusPill from './StatusPill.svelte';
	import { Button } from './ui/button/index.js';
	import type { PersonErrors } from './person-errors';

	const MAX_PEOPLE = 15;

	let {
		people = $bindable(),
		editing = $bindable(),
		errors,
		names,
		onDone,
		onRemove
	}: {
		people: Person[];
		editing: number | null;
		errors?: Record<string, PersonErrors | undefined>;
		names: Record<string, string>;
		onDone: (index: number) => void;
		onRemove: (index: number) => void;
	} = $props();

	const relationLabel = (r: Relation | undefined) =>
		r ? (m as unknown as Record<string, () => string>)[`relation_${r}`]() : '';

	function add() {
		// The registrant's address is the usual answer, so it starts filled in.
		people.push(blankPerson(undefined as unknown as Relation, people[0].address));
		editing = people.length - 1;
	}
</script>

{#if editing !== null}
	<section class="flex flex-col gap-6" aria-labelledby="person-heading">
		<h2 id="person-heading" class="text-xl font-semibold">
			{m.register_person_heading({ number: editing + 1 })}
		</h2>
		<PersonFields
			bind:person={people[editing]}
			errors={errors?.[editing]}
			index={editing}
			isRegistrant={false}
			{names}
		/>
		<div class="flex flex-col gap-2">
			<Button size="member" class="h-14 w-full" onclick={() => onDone(editing!)}>
				{m.common_done()}
			</Button>
			<Button size="member" variant="destructive" class="w-full" onclick={() => onRemove(editing!)}>
				{m.register_remove_person()}
			</Button>
		</div>
	</section>
{:else}
	<section class="flex flex-col gap-4" aria-labelledby="family-heading">
		<h2 id="family-heading" class="text-xl font-semibold">{m.register_step_family()}</h2>
		<p>{m.register_family_intro()}</p>
		<ul class="flex flex-col gap-2">
			{#each people.slice(1) as person, i (i)}
				{@const name = person.fullName || m.register_unnamed()}
				<li class="flex min-h-16 items-center gap-3 rounded-lg bg-surface px-4 py-2">
					<div class="min-w-0 flex-1">
						<p class="font-semibold break-words">{name}</p>
						<p class="text-[0.9375rem] text-muted">{relationLabel(person.relation)}</p>
					</div>
					{#if errors?.[i + 1]}
						<StatusPill tone="warning" size="member" label={m.register_needs_check()} />
					{/if}
					<Button
						size="member"
						variant="outline"
						aria-label={m.register_edit_person({ name })}
						onclick={() => (editing = i + 1)}
					>
						{m.common_edit()}
					</Button>
				</li>
			{:else}
				<li class="text-muted">{m.register_family_empty()}</li>
			{/each}
		</ul>
		<Button
			size="member"
			variant="outline"
			class="w-full"
			disabled={people.length >= MAX_PEOPLE}
			onclick={add}
		>
			{m.register_add_person()}
		</Button>
	</section>
{/if}
