import {
	pgTable,
	pgEnum,
	uuid,
	varchar,
	char,
	text,
	jsonb,
	smallint,
	timestamp,
	index,
	uniqueIndex,
	check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, updatedAt, deletedAt } from './columns';
import { otpChannelEnum } from './auth';
import { branches } from './branch';
import { households, people } from './people';

export const registrationStatusEnum = pgEnum('registration_status', [
	'pending',
	'needs_fix',
	'approved',
	'spam'
]);
export const consentDecisionEnum = pgEnum('consent_decision', ['waiting', 'given', 'declined']);
export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'sent', 'failed']);

export const registrationLinks = pgTable(
	'registration_links',
	{
		id: id(),
		tokenHash: char({ length: 64 }).notNull().unique(),
		branchId: uuid()
			.notNull()
			.references(() => branches.id, { onDelete: 'restrict' }),
		createdByPersonId: uuid()
			.notNull()
			.references(() => people.id, { onDelete: 'restrict' }),
		revokedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
		deletedAt: deletedAt()
	},
	(t) => [
		uniqueIndex('registration_links_live_branch_uniq')
			.on(t.branchId)
			.where(sql`${t.revokedAt} is null and ${t.deletedAt} is null`)
	]
);

export const registrations = pgTable(
	'registrations',
	{
		id: id(),
		registrationLinkId: uuid()
			.notNull()
			.references(() => registrationLinks.id, { onDelete: 'restrict' }),
		branchId: uuid()
			.notNull()
			.references(() => branches.id, { onDelete: 'restrict' }),
		status: registrationStatusEnum().notNull().default('pending'),
		payload: jsonb().notNull(),
		locale: varchar({ length: 7 }).notNull(),
		contactEmail: varchar({ length: 255 }),
		contactPhone: varchar({ length: 20 }),
		fixReason: text(),
		fixTokenHash: char({ length: 64 }).unique(),
		submittedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		decidedByPersonId: uuid().references(() => people.id, { onDelete: 'restrict' }),
		decidedAt: timestamp({ withTimezone: true }),
		householdId: uuid().references(() => households.id, { onDelete: 'restrict' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index().on(t.branchId, t.status, t.submittedAt, t.id),
		check(
			'registrations_contact',
			sql`${t.contactEmail} is not null or ${t.contactPhone} is not null`
		)
	]
);

export const registrationConsents = pgTable(
	'registration_consents',
	{
		id: id(),
		registrationId: uuid()
			.notNull()
			.references(() => registrations.id, { onDelete: 'restrict' }),
		// Position of the person in the registration payload.
		personIndex: smallint().notNull(),
		matchedPersonId: uuid()
			.notNull()
			.references(() => people.id, { onDelete: 'restrict' }),
		// Null when only in-person consent is possible.
		tokenHash: char({ length: 64 }).unique(),
		decision: consentDecisionEnum().notNull().default('waiting'),
		decidedAt: timestamp({ withTimezone: true }),
		recordedByPersonId: uuid().references(() => people.id, { onDelete: 'restrict' })
	},
	(t) => [uniqueIndex('registration_consents_person_uniq').on(t.registrationId, t.personIndex)]
);

export const registrationThrottles = pgTable('registration_throttles', {
	keyHash: char({ length: 64 }).primaryKey(),
	count: smallint().notNull(),
	windowStartedAt: timestamp({ withTimezone: true }).notNull()
});

export const outboxMessages = pgTable(
	'outbox_messages',
	{
		id: id(),
		channel: otpChannelEnum().notNull(),
		recipient: varchar({ length: 255 }).notNull(),
		template: varchar({ length: 50 }).notNull(),
		locale: varchar({ length: 7 }).notNull(),
		params: jsonb().notNull(),
		status: outboxStatusEnum().notNull().default('pending'),
		attempts: smallint().notNull().default(0),
		lastError: text(),
		nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		createdAt: createdAt(),
		sentAt: timestamp({ withTimezone: true })
	},
	(t) => [index().on(t.status, t.nextAttemptAt)]
);
