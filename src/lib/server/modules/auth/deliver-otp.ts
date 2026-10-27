import { ValidationError } from '$lib/server/errors';
import { baseLocale, isLocale } from '$lib/paraglide/runtime';
import { DeliveryError, sendMessage, type Channel } from '$lib/server/modules/messaging/sender';

type Contact = { email: string | null; phone: string | null; preferredLocale: string };

export const otpChannel = (c: Pick<Contact, 'phone'>): Channel => (c.phone ? 'whatsapp' : 'email');

export async function deliverOtp(account: Contact, code: string): Promise<void> {
	const locale = isLocale(account.preferredLocale) ? account.preferredLocale : baseLocale;
	const send = (channel: Channel, to: string) =>
		sendMessage({ channel, to, template: 'otp', locale, params: { code } });

	if (account.phone) {
		try {
			return await send('whatsapp', account.phone);
		} catch (err) {
			if (!(err instanceof DeliveryError)) throw err;
		}
	}
	if (!account.email) throw new ValidationError('error_code_not_sent');
	try {
		await send('email', account.email);
	} catch (err) {
		if (err instanceof DeliveryError) throw new ValidationError('error_code_not_sent');
		throw err;
	}
}
