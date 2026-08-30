import { pgTable, uuid, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'suspended']);

export const users = pgTable('users', {
	id: uuid().primaryKey().defaultRandom(),
	email: varchar({ length: 255 }).unique(),
	phone: varchar({ length: 32 }).unique(),
	passwordHash: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	status: userStatusEnum().notNull().default('active'),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
	id: varchar({ length: 255 }).primaryKey(),
	userId: uuid()
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp({ withTimezone: true }).notNull()
});
