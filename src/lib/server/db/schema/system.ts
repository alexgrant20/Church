import { pgTable, uuid, varchar, text, jsonb, index } from 'drizzle-orm/pg-core';
import { id, createdAt, updatedAt } from './columns';
import { people } from './people';

export const systemSettings = pgTable('system_settings', {
	id: id(),
	key: varchar({ length: 100 }).notNull().unique(),
	value: jsonb().notNull(),
	updatedByPersonId: uuid().references(() => people.id, { onDelete: 'restrict' }),
	updatedAt: updatedAt()
});

export const errorLogs = pgTable(
	'error_logs',
	{
		id: id(),
		message: text().notNull(),
		stack: text(),
		route: varchar({ length: 255 }),
		method: varchar({ length: 10 }),
		personId: uuid().references(() => people.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [index().on(t.createdAt)]
);
