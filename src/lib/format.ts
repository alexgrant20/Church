// Rupiah always prints in id-ID, whatever the UI language: en and zh would print "IDR 1,250,000".
const rupiah = new Intl.NumberFormat('id-ID', {
	style: 'currency',
	currency: 'IDR',
	maximumFractionDigits: 0
});

export const formatRupiah = (amount: number) => rupiah.format(amount);

export const formatCount = (n: number, locale: string) => new Intl.NumberFormat(locale).format(n);

export const formatTime = (date: Date, locale: string, timeZone: string) =>
	new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone
	}).format(date);

export const formatMissing = (value: string | number | null | undefined) =>
	value == null ? '—' : String(value);

const dayKey = (date: Date, timeZone: string) =>
	new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date);

// Lists say "Today" and "Yesterday", then "Sun 3 Nov" (DESIGN.md section 4).
export function formatDay(
	date: Date,
	locale: string,
	timeZone: string,
	labels: { today: string; yesterday: string },
	now = new Date()
) {
	const key = dayKey(date, timeZone);
	if (key === dayKey(now, timeZone)) return labels.today;
	if (key === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) return labels.yesterday;
	return new Intl.DateTimeFormat(locale, {
		timeZone,
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(date);
}
