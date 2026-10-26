import { describe, it, expect } from 'vitest';
import { parseCsv, parseWilayahSql, titleCase } from './locations';

describe('parseWilayahSql', () => {
	it('keeps 2-digit province and 5-character city codes only', () => {
		const sql = "('31','DKI JAKARTA'),('31.71','KOTA ADM. JAKARTA PUSAT'),('31.71.01','GAMBIR')";
		expect(parseWilayahSql(sql)).toEqual({
			provinces: [{ code: '31', name: 'DKI Jakarta' }],
			cities: [{ code: '31.71', provinceCode: '31', name: 'Kota Adm. Jakarta Pusat' }]
		});
	});
	it('unescapes quotes and trims names', () => {
		const { cities } = parseWilayahSql("('11.01','Kabupaten Ba''u '),");
		expect(cities[0].name).toBe("Kabupaten Ba'u");
	});
});

describe('titleCase', () => {
	it('title-cases words but keeps known acronyms', () => {
		expect(titleCase('DKI JAKARTA')).toBe('DKI Jakarta');
	});
	it('leaves already mixed-case names alone', () => {
		expect(titleCase('Kota Administrasi Jakarta Pusat')).toBe('Kota Administrasi Jakarta Pusat');
	});
});

describe('parseCsv', () => {
	it('handles quoted commas, doubled quotes and newlines', () => {
		const rows = parseCsv('id,name\n1,"A, ""B"""\n2,"line\nbreak"\n');
		expect(rows).toEqual([
			{ id: '1', name: 'A, "B"' },
			{ id: '2', name: 'line\nbreak' }
		]);
	});
});
