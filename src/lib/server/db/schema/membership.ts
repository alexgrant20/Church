import { pgTable, pgEnum, uuid, varchar, boolean, date, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, updatedAt } from './columns';
import { people } from './people';

export const occupationEnum = pgEnum('occupation', [
	'none',
	'student',
	'employee',
	'civil_servant',
	'entrepreneur',
	'professional',
	'homemaker',
	'retired',
	'other'
]);
export const educationEnum = pgEnum('education', [
	'none',
	'primary',
	'junior_high',
	'senior_high',
	'diploma',
	'bachelor',
	'master',
	'doctorate'
]);

export const memberProfiles = pgTable(
	'member_profiles',
	{
		personId: uuid()
			.primaryKey()
			.references(() => people.id, { onDelete: 'restrict' }),
		occupation: occupationEnum().notNull(),
		education: educationEnum().notNull(),
		// Null means the person had no previous church.
		previousChurch: varchar({ length: 255 }),
		baptized: boolean().notNull(),
		baptismDate: date({ mode: 'string' }),
		baptismChurch: varchar({ length: 255 }),
		sidi: boolean().notNull(),
		sidiDate: date({ mode: 'string' }),
		sidiChurch: varchar({ length: 255 }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		check(
			'member_profiles_baptism_details',
			sql`${t.baptized} = (${t.baptismDate} is not null) and ${t.baptized} = (${t.baptismChurch} is not null)`
		),
		check(
			'member_profiles_sidi_details',
			sql`${t.sidi} = (${t.sidiDate} is not null) and ${t.sidi} = (${t.sidiChurch} is not null)`
		)
	]
);
