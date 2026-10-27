import { sql } from 'drizzle-orm';
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

export const id = () =>
	uuid()
		.primaryKey()
		.default(sql`uuidv7()`);
export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
	timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());
export const deletedAt = () => timestamp({ withTimezone: true });
export const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
