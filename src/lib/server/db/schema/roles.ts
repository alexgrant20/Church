import { pgTable, uuid, pgEnum, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { branches, groups } from './branch';

export const roleEnum = pgEnum('role', [
	'superadmin',
	'pastor',
	'branch_admin',
	'group_admin',
	'member'
]);

export const roleAssignments = pgTable('role_assignments', {
	id: uuid().primaryKey().defaultRandom(),
	userId: uuid()
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	role: roleEnum().notNull(),
	branchId: uuid().references(() => branches.id, { onDelete: 'cascade' }),
	groupId: uuid().references(() => groups.id, { onDelete: 'cascade' }),
	assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});
