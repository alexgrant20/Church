// KTP age: the age at which a person counts as an adult in the church app.
export const ADULT_AGE = 17;

const partsIn = (timeZone: string, now: Date) => {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)!.value;
	return { year: get('year'), month: get('month'), day: get('day') };
};

// Dates follow the branch's calendar, not the server's.
export const yearIn = (timeZone: string, now = new Date()) => Number(partsIn(timeZone, now).year);

export function todayIn(timeZone: string, now = new Date()): string {
	const { year, month, day } = partsIn(timeZone, now);
	return `${year}-${month}-${day}`;
}

// Compares month-day strings, so a 29 February birthday counts from 1 March in other years.
export function ageOn(birthDate: string, today: string): number {
	const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
	return today.slice(5) >= birthDate.slice(5) ? years : years - 1;
}
