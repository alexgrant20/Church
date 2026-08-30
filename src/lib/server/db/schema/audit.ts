import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { branches } from './branch';

export const auditLogs = pgTable(
	'audit_logs',
	{
		id: uuid().primaryKey().defaultRandom(),
		actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
		action: varchar({ length: 100 }).notNull(),
		entityType: varchar({ length: 100 }).notNull(),
		entityId: uuid().notNull(),
		branchId: uuid().references(() => branches.id, { onDelete: 'set null' }),
		diff: jsonb(),
		metadata: jsonb(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('audit_logs_entity_idx').on(table.entityType, table.entityId),
		index('audit_logs_actor_created_idx').on(table.actorUserId, table.createdAt)
	]
);
