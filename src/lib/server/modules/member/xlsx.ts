import { PassThrough, Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import * as m from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
import type { ExportRow } from './export-service';

const headers = (o: { locale: Locale }) => [
	m.members_export_col_member_id({}, o),
	m.members_export_col_full_name({}, o),
	m.members_export_col_nickname({}, o),
	m.members_export_col_sex({}, o),
	m.members_export_col_birth_date({}, o),
	m.members_export_col_household({}, o),
	m.members_export_col_phone({}, o),
	m.members_export_col_email({}, o),
	m.members_export_col_city({}, o),
	m.members_export_col_home_branch({}, o),
	m.members_export_col_baptism({}, o),
	m.members_export_col_sidi({}, o)
];

function cells(r: ExportRow, o: { locale: Locale }) {
	const yesNo = (v: boolean) => (v ? m.common_yes({}, o) : m.common_no({}, o));
	return [
		r.memberCode,
		r.fullName,
		r.nickname,
		r.sex === 'male' ? m.sex_male({}, o) : m.sex_female({}, o),
		new Date(`${r.birthDate}T00:00:00Z`),
		r.household,
		r.phone,
		r.email,
		r.city,
		r.homeBranch,
		yesNo(r.baptized),
		yesNo(r.sidi)
	];
}

// Rows are committed as written, so the workbook never sits whole in memory.
export function membersXlsxStream(rows: ExportRow[], locale: Locale): ReadableStream<Uint8Array> {
	const out = new PassThrough();
	const book = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out });
	const sheet = book.addWorksheet(m.members_export_sheet({}, { locale }));
	sheet.getColumn(5).numFmt = 'yyyy-mm-dd';
	sheet.addRow(headers({ locale })).commit();
	for (const r of rows) sheet.addRow(cells(r, { locale })).commit();
	sheet.commit();
	book.commit().catch((err) => out.destroy(err));
	return Readable.toWeb(out) as ReadableStream<Uint8Array>;
}
