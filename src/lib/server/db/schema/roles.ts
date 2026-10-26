import { pgTable, uuid, pgEnum, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, deletedAt } from './columns';
import { people } from './people';
import { branches, groups } from './branch';

export const roleEnum = pgEnum('role', ['superadmin', 'pastor', 'branch_admin', 'group_admin']);

const NIL_UUID = sql`'00000000-0000-0000-0000-000000000000'`;

export const roleAssignments = pgTable(
	'role_assignments',
	{
		id: id(),
		personId: uuid()
			.notNull()
			.references(() => people.id, { onDelete: 'restrict' }),
		role: roleEnum().notNull(),
		branchId: uuid().references(() => branches.id, { onDelete: 'restrict' }),
		groupId: uuid().references(() => groups.id, { onDelete: 'restrict' }),
		assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		deletedAt: deletedAt()
	},
	(t) => [
		index().on(t.personId),
		check(
			'role_assignments_scope',
			sql`(${t.role} = 'superadmin' and ${t.branchId} is null and ${t.groupId} is null)
				or (${t.role} in ('pastor', 'branch_admin') and ${t.branchId} is not null and ${t.groupId} is null)
				or (${t.role} = 'group_admin' and ${t.groupId} is not null and ${t.branchId} is null)`
		),
		// coalesce stands in for NULLS NOT DISTINCT, which Drizzle's partial index builder cannot express
		uniqueIndex('role_assignments_uniq')
			.on(
				t.personId,
				t.role,
				sql`coalesce(${t.branchId}, ${NIL_UUID})`,
				sql`coalesce(${t.groupId}, ${NIL_UUID})`
			)
			.where(sql`${t.deletedAt} is null`)
	]
);
