import { pgTable, uuid, pgEnum, timestamp } from 'drizzle-orm/pg-core';
import { people } from './people';
import { branches, groups } from './branch';

export const roleEnum = pgEnum('role', ['superadmin', 'pastor', 'branch_admin', 'group_admin']);

export const roleAssignments = pgTable('role_assignments', {
	id: uuid().primaryKey().defaultRandom(),
	personId: uuid()
		.notNull()
		.references(() => people.id, { onDelete: 'restrict' }),
	role: roleEnum().notNull(),
	branchId: uuid().references(() => branches.id, { onDelete: 'cascade' }),
	groupId: uuid().references(() => groups.id, { onDelete: 'cascade' }),
	assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});
