import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import { formatDay, formatTime } from '$lib/format';

// shortcut: every branch is on WIB today; use the branch's timezone once a branch outside WIB exists.
const TIME_ZONE = 'Asia/Jakarta';

export function submittedLabel(date: Date): string {
	const locale = getLocale();
	const labels = { today: m.common_today(), yesterday: m.common_yesterday() };
	return `${formatDay(date, locale, TIME_ZONE, labels)} ${formatTime(date, locale, TIME_ZONE)}`;
}
