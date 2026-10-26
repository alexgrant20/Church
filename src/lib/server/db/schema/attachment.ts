import {
	pgTable,
	pgEnum,
	uuid,
	varchar,
	char,
	smallint,
	integer,
	uniqueIndex,
	check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, createdAt, deletedAt } from './columns';
import { people } from './people';

export const attachmentOwnerEnum = pgEnum('attachment_owner', ['person', 'branch']);
export const attachmentPurposeEnum = pgEnum('attachment_purpose', [
	'profile_photo',
	'church_photo'
]);

// owner_id has no foreign key (polymorphic); the attachment registry checks the owner on write.
export const attachments = pgTable(
	'attachments',
	{
		id: id(),
		ownerType: attachmentOwnerEnum().notNull(),
		ownerId: uuid().notNull(),
		purpose: attachmentPurposeEnum().notNull(),
		position: smallint().notNull().default(0),
		storageKey: varchar({ length: 255 }).notNull().unique(),
		contentType: varchar({ length: 100 }).notNull(),
		sizeBytes: integer().notNull(),
		sha256: char({ length: 64 }).notNull(),
		uploadedByPersonId: uuid()
			.notNull()
			.references(() => people.id, { onDelete: 'restrict' }),
		createdAt: createdAt(),
		deletedAt: deletedAt()
	},
	(t) => [
		// Doubles as the owner lookup index: same columns, so a second index would be redundant.
		uniqueIndex('attachments_owner_position_uniq')
			.on(t.ownerType, t.ownerId, t.purpose, t.position)
			.where(sql`${t.deletedAt} is null`),
		uniqueIndex('attachments_profile_photo_uniq')
			.on(t.ownerId)
			.where(sql`${t.purpose} = 'profile_photo' and ${t.deletedAt} is null`),
		check(
			'attachments_content_type_allowed',
			sql`${t.contentType} in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')`
		)
	]
);
