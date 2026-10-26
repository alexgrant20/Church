import { pgTable, uuid, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, deletedAt } from './columns';
import { cities } from './location';

export const branches = pgTable(
	'branches',
	{
		id: id(),
		code: varchar({ length: 8 }).notNull(),
		name: varchar({ length: 255 }).notNull(),
		addressLine: varchar({ length: 500 }).notNull(),
		postalCode: varchar({ length: 10 }),
		cityId: uuid()
			.notNull()
			.references(() => cities.id, { onDelete: 'restrict' }),
		timezone: varchar({ length: 50 }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt()
	},
	(t) => [
		uniqueIndex('branches_code_uniq')
			.on(t.code)
			.where(sql`${t.deletedAt} is null`),
		index().on(t.cityId)
	]
);

// Stub only — owned by the future Worship module, which will extend this table.
export const groups = pgTable(
	'groups',
	{
		id: id(),
		branchId: uuid()
			.notNull()
			.references(() => branches.id, { onDelete: 'restrict' }),
		name: varchar({ length: 255 }).notNull(),
		deletedAt: deletedAt()
	},
	(t) => [index().on(t.branchId)]
);
