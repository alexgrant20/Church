import {
	pgTable,
	pgEnum,
	uuid,
	varchar,
	char,
	date,
	customType,
	smallint,
	integer,
	primaryKey,
	index,
	uniqueIndex,
	check,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, deletedAt } from './columns';
import { branches } from './branch';
import { cities } from './location';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const sexEnum = pgEnum('sex', ['male', 'female']);
export const relationshipKindEnum = pgEnum('relationship_kind', ['parent', 'spouse']);

export const households = pgTable('households', {
	id: id(),
	createdAt: createdAt(),
	deletedAt: deletedAt()
});

export const people = pgTable(
	'people',
	{
		id: id(),
		memberCode: varchar({ length: 20 }).notNull().unique(),
		fullName: varchar({ length: 255 }).notNull(),
		nickname: varchar({ length: 100 }),
		chineseName: varchar({ length: 50 }),
		sex: sexEnum().notNull(),
		birthDate: date({ mode: 'string' }).notNull(),
		birthCityId: uuid().references(() => cities.id, { onDelete: 'restrict' }),
		nikEncrypted: bytea(),
		nikHash: char({ length: 64 }),
		preferredLocale: varchar({ length: 7 }).notNull().default('id'),
		homeBranchId: uuid()
			.notNull()
			.references(() => branches.id, { onDelete: 'restrict' }),
		householdId: uuid()
			.notNull()
			.references(() => households.id, { onDelete: 'restrict' }),
		registeredByPersonId: uuid().references((): AnyPgColumn => people.id, {
			onDelete: 'restrict'
		}),
		addressLine: varchar({ length: 500 }).notNull(),
		postalCode: varchar({ length: 10 }),
		cityId: uuid()
			.notNull()
			.references(() => cities.id, { onDelete: 'restrict' }),
		deletedAt: deletedAt(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index().on(t.homeBranchId, t.id),
		index().on(t.householdId),
		index().on(t.cityId),
		uniqueIndex('people_nik_hash_uniq')
			.on(t.nikHash)
			.where(sql`${t.nikHash} is not null and ${t.deletedAt} is null`),
		check('people_nik_hash_hex', sql`${t.nikHash} ~ '^[0-9a-f]{64}$'`),
		index('people_full_name_trgm_idx').using('gin', sql`${t.fullName} gin_trgm_ops`),
		index('people_nickname_trgm_idx').using('gin', sql`${t.nickname} gin_trgm_ops`),
		index('people_chinese_name_trgm_idx').using('gin', sql`${t.chineseName} gin_trgm_ops`)
	]
);

export const personRelationships = pgTable(
	'person_relationships',
	{
		id: id(),
		kind: relationshipKindEnum().notNull(),
		personId: uuid()
			.notNull()
			.references(() => people.id, { onDelete: 'restrict' }),
		relatedPersonId: uuid()
			.notNull()
			.references(() => people.id, { onDelete: 'restrict' }),
		startedOn: date({ mode: 'string' }),
		endedOn: date({ mode: 'string' }),
		createdAt: createdAt(),
		deletedAt: deletedAt()
	},
	(t) => [
		check('person_relationships_not_self', sql`${t.personId} <> ${t.relatedPersonId}`),
		check(
			'person_relationships_spouse_order',
			sql`${t.kind} <> 'spouse' or ${t.personId} < ${t.relatedPersonId}`
		),
		uniqueIndex('person_relationships_uniq')
			.on(t.kind, t.personId, t.relatedPersonId)
			.where(sql`${t.deletedAt} is null`),
		index().on(t.personId),
		index().on(t.relatedPersonId)
	]
);

export const memberCodeCounters = pgTable(
	'member_code_counters',
	{
		branchId: uuid()
			.notNull()
			.references(() => branches.id, { onDelete: 'restrict' }),
		year: smallint().notNull(),
		lastNumber: integer().notNull()
	},
	(t) => [primaryKey({ columns: [t.branchId, t.year] })]
);
