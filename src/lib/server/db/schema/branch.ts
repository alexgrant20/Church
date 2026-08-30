import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const branches = pgTable('branches', {
	id: uuid().primaryKey().defaultRandom(),
	name: varchar({ length: 255 }).notNull(),
	address: varchar({ length: 500 }),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

// Stub only — owned by the future Worship module, which will extend this table.
export const groups = pgTable('groups', {
	id: uuid().primaryKey().defaultRandom(),
	branchId: uuid()
		.notNull()
		.references(() => branches.id, { onDelete: 'cascade' }),
	name: varchar({ length: 255 }).notNull()
});
