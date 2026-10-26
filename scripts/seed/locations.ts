import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { count } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/lib/server/db/schema';

const { cities, countries, regions } = schema;

export type SeedDb = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

const CACHE_DIR = join(process.cwd(), '.seed-cache');
const BATCH_SIZE = 1000;
const WILAYAH_URL =
	'https://raw.githubusercontent.com/cahyadsn/wilayah/be9d3e301c962b46e1a5ef2275424cfa0b53a7ef/db/wilayah.sql';
const DR5HN_RAW =
	'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/v5.0.0/csv';
// cities.csv is too big for the repo tree; the project publishes it only as a release asset.
const DR5HN_CITIES_GZ =
	'https://github.com/dr5hn/countries-states-cities-database/releases/download/v5.0.0-export.1/csv-cities.csv.gz';

const ACRONYMS = new Set(['DKI', 'DI', 'NTB', 'NTT']);
const WILAYAH_ROW = /\('(\d{2}(?:\.\d{2})?)','((?:[^']|'')*)'\)/g;

export function titleCase(name: string): string {
	if (name !== name.toUpperCase()) return name;
	return name
		.split(' ')
		.map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
		.join(' ');
}

export function parseWilayahSql(sql: string) {
	const provinces: { code: string; name: string }[] = [];
	const cityRows: { code: string; provinceCode: string; name: string }[] = [];
	for (const [, code, raw] of sql.matchAll(WILAYAH_ROW)) {
		const name = titleCase(raw.replaceAll("''", "'").trim());
		if (code.length === 2) provinces.push({ code, name });
		else cityRows.push({ code, provinceCode: code.slice(0, 2), name });
	}
	return { provinces, cities: cityRows };
}

export function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c !== '"') field += c;
			else if (text[i + 1] === '"') field += text[++i];
			else quoted = false;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
		} else field += c;
	}
	if (field || row.length) rows.push([...row, field]);
	const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
	return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

async function download(name: string, url: string, gzipped = false): Promise<string> {
	const path = join(CACHE_DIR, name);
	if (!existsSync(path)) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
		const bytes = Buffer.from(await res.arrayBuffer());
		await mkdir(CACHE_DIR, { recursive: true });
		await writeFile(path, gzipped ? gunzipSync(bytes) : bytes);
	}
	return readFile(path, 'utf8');
}

async function inBatches<T, R>(rows: T[], insert: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
	const out: R[] = [];
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		out.push(...(await insert(rows.slice(i, i + BATCH_SIZE))));
	}
	return out;
}

async function seedIndonesia(db: SeedDb) {
	const parsed = parseWilayahSql(await download('wilayah.sql', WILAYAH_URL));
	const [country] = await db
		.insert(countries)
		.values({ iso2: 'ID', name: 'Indonesia' })
		.returning({ id: countries.id });
	const regionRows = await db
		.insert(regions)
		.values(parsed.provinces.map((p) => ({ countryId: country.id, code: p.code, name: p.name })))
		.returning({ id: regions.id, code: regions.code });
	const regionByCode = new Map(regionRows.map((r) => [r.code, r.id]));
	await inBatches(parsed.cities, (chunk) =>
		db
			.insert(cities)
			.values(
				chunk.map((c) => ({
					regionId: regionByCode.get(c.provinceCode)!,
					code: c.code,
					name: c.name
				}))
			)
			.onConflictDoNothing()
			.returning({ id: cities.id })
	);
}

async function seedWorld(db: SeedDb) {
	const countryCsv = parseCsv(await download('countries.csv', `${DR5HN_RAW}/countries.csv`));
	const stateCsv = parseCsv(await download('states.csv', `${DR5HN_RAW}/states.csv`));
	const cityCsv = parseCsv(await download('cities.csv', DR5HN_CITIES_GZ, true));

	const countryRows = await db
		.insert(countries)
		.values(
			countryCsv
				.filter((c) => c.iso2 !== 'ID')
				.map((c) => ({ iso2: c.iso2, name: c.name.slice(0, 100) }))
		)
		.returning({ id: countries.id, iso2: countries.iso2 });
	const countryByIso = new Map(countryRows.map((c) => [c.iso2, c.id]));
	const countryByDrId = new Map(countryCsv.map((c) => [c.id, countryByIso.get(c.iso2)]));

	const states = stateCsv.filter((s) => countryByDrId.get(s.country_id));
	const regionRows = await inBatches(states, (chunk) =>
		db
			.insert(regions)
			.values(
				chunk.map((s) => ({
					countryId: countryByDrId.get(s.country_id)!,
					code: s.iso2 && s.iso2.length <= 10 ? s.iso2 : null,
					name: s.name.slice(0, 150)
				}))
			)
			.onConflictDoNothing()
			.returning({ id: regions.id, countryId: regions.countryId, name: regions.name })
	);
	const regionByKey = new Map(regionRows.map((r) => [`${r.countryId}|${r.name}`, r.id]));
	const regionByDrState = new Map(
		states.map((s) => [
			s.id,
			regionByKey.get(`${countryByDrId.get(s.country_id)}|${s.name.slice(0, 150)}`)
		])
	);

	await inBatches(
		cityCsv.filter((c) => regionByDrState.get(c.state_id)),
		(chunk) =>
			db
				.insert(cities)
				.values(
					chunk.map((c) => ({
						regionId: regionByDrState.get(c.state_id)!,
						name: c.name.slice(0, 150)
					}))
				)
				.onConflictDoNothing()
				.returning({ id: cities.id })
	);
}

export async function seedLocations(db: SeedDb) {
	const [{ n }] = await db.select({ n: count() }).from(countries);
	if (n > 0) return false;
	await seedIndonesia(db);
	await seedWorld(db);
	return true;
}
