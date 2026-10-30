import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import * as m from '$lib/paraglide/messages';
import { membersXlsxStream } from './xlsx';
import type { ExportRow } from './export-service';

const row: ExportRow = {
	memberCode: 'JKT-2026-00001',
	fullName: 'Budi Santoso',
	nickname: 'Budi',
	sex: 'male',
	birthDate: '1990-05-17',
	household: 'JKT-2026-00001',
	phone: '+6281234567890',
	email: 'budi@mail.test',
	city: 'Kota Adm. Jakarta Pusat',
	homeBranch: 'GRII Pusat',
	baptized: true,
	sidi: false
};

async function read(stream: ReadableStream<Uint8Array>) {
	const book = new ExcelJS.Workbook();
	await book.xlsx.load(await new Response(stream).arrayBuffer());
	return book.worksheets[0];
}

describe('members xlsx', () => {
	it('writes the header and one row per member', async () => {
		const sheet = await read(membersXlsxStream([row, { ...row, memberCode: 'X' }], 'en'));
		expect(sheet.getCell('A1').value).toBe(m.members_export_col_member_id({}, { locale: 'en' }));
		expect(sheet.getRow(1).cellCount).toBe(12);
		expect(sheet.rowCount).toBe(3);
		expect(sheet.getCell('B2').value).toBe('Budi Santoso');
		expect(sheet.getCell('D2').value).toBe(m.sex_male({}, { locale: 'en' }));
		expect(sheet.getCell('L2').value).toBe(m.common_no({}, { locale: 'en' }));
	});

	it('writes headers in the requested language', async () => {
		const sheet = await read(membersXlsxStream([row], 'id'));
		expect(sheet.getCell('A1').value).toBe(m.members_export_col_member_id({}, { locale: 'id' }));
	});
});
