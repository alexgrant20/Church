import {
	pgTable,
	pgEnum,
	uuid,
	varchar,
	char,
	smallint,
	timestamp,
	index,
	uniqueIndex,
	check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt } from './columns';
import { people } from './people';

export const accountStatusEnum = pgEnum('account_status', ['active', 'suspended']);
export const otpPurposeEnum = pgEnum('otp_purpose', ['login', 'activation', 'password_reset']);
export const otpChannelEnum = pgEnum('otp_channel', ['whatsapp', 'email']);

export const accounts = pgTable(
	'accounts',
	{
		personId: uuid()
			.primaryKey()
			.references(() => people.id, { onDelete: 'restrict' }),
		email: varchar({ length: 255 }),
		phone: varchar({ length: 20 }).unique(),
		passwordHash: varchar({ length: 255 }),
		activatedAt: timestamp({ withTimezone: true }),
		lastLoginAt: timestamp({ withTimezone: true }),
		status: accountStatusEnum().notNull().default('active'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		uniqueIndex('accounts_email_uniq')
			.on(sql`lower(${t.email})`)
			.where(sql`${t.email} is not null`),
		check('accounts_email_or_phone', sql`${t.email} is not null or ${t.phone} is not null`)
	]
);

export const loginThrottles = pgTable('login_throttles', {
	identifierHash: char({ length: 64 }).primaryKey(),
	failedCount: smallint().notNull().default(0),
	lockedUntil: timestamp({ withTimezone: true }),
	updatedAt: updatedAt()
});

export const otpCodes = pgTable(
	'otp_codes',
	{
		id: id(),
		personId: uuid()
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		purpose: otpPurposeEnum().notNull(),
		channel: otpChannelEnum().notNull(),
		codeHash: char({ length: 64 }).notNull(),
		challengeHash: char({ length: 64 }).notNull().unique(),
		attempts: smallint().notNull().default(0),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		consumedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt()
	},
	(t) => [index().on(t.personId, t.purpose, t.createdAt)]
);

export const sessions = pgTable(
	'sessions',
	{
		id: char({ length: 64 }).primaryKey(),
		personId: uuid()
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		actingAsPersonId: uuid().references(() => people.id, { onDelete: 'set null' }),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		createdAt: createdAt()
	},
	(t) => [index().on(t.personId)]
);
