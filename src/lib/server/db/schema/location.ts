import { pgTable, uuid, varchar, char, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id } from './columns';

export const countries = pgTable('countries', {
	id: id(),
	iso2: char({ length: 2 }).notNull().unique(),
	name: varchar({ length: 100 }).notNull()
});

export const regions = pgTable(
	'regions',
	{
		id: id(),
		countryId: uuid()
			.notNull()
			.references(() => countries.id, { onDelete: 'restrict' }),
		code: varchar({ length: 10 }),
		name: varchar({ length: 150 }).notNull()
	},
	(t) => [unique('regions_country_name_uniq').on(t.countryId, t.name), index().on(t.countryId)]
);

export const cities = pgTable(
	'cities',
	{
		id: id(),
		regionId: uuid()
			.notNull()
			.references(() => regions.id, { onDelete: 'restrict' }),
		code: varchar({ length: 10 }),
		name: varchar({ length: 150 }).notNull()
	},
	(t) => [
		unique('cities_region_name_uniq').on(t.regionId, t.name),
		index().on(t.regionId),
		index('cities_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`)
	]
);
