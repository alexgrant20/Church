import { config } from '$lib/server/config';
import type { Locale } from '$lib/paraglide/runtime';
import { DeliveryError, type MessageTemplate, type OutgoingMessage } from './sender';

const metaLanguage: Record<Locale, string> = {
	en: 'en',
	id: 'id',
	'zh-Hans': 'zh_CN',
	'zh-Hant': 'zh_TW'
};

// Body variables in the order the Meta template declares them. needs_fix omits the reason:
// free text from staff does not belong in a utility template.
const bodyParams: Record<MessageTemplate, string[]> = {
	otp: ['code'],
	registration_approved: ['name', 'activateUrl', 'someoneNotAdded'],
	registration_needs_fix: ['name', 'fixUrl'],
	consent_request: ['registrantName', 'consentUrl']
};

function components(msg: OutgoingMessage) {
	const body = {
		type: 'body',
		parameters: bodyParams[msg.template].map((k) => ({ type: 'text', text: msg.params[k] }))
	};
	if (msg.template !== 'otp') return [body];
	const code = msg.params.code;
	// Meta's authentication template: the code fills both the body and the copy-code button.
	return [
		body,
		{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }
	];
}

export function buildWhatsAppTemplate(msg: OutgoingMessage): object {
	return {
		messaging_product: 'whatsapp',
		to: msg.to.replace(/^\+/, ''),
		type: 'template',
		template: {
			name: msg.template,
			language: { code: metaLanguage[msg.locale] },
			components: components(msg)
		}
	};
}

export async function sendWhatsApp(msg: OutgoingMessage): Promise<void> {
	let res: Response;
	try {
		res = await fetch(
			`https://graph.facebook.com/v23.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(buildWhatsAppTemplate(msg)),
				// A hung connection must throw so the caller can fall back to email.
				signal: AbortSignal.timeout(10_000)
			}
		);
	} catch (cause) {
		throw new DeliveryError('WhatsApp unreachable', { cause });
	}
	if (!res.ok) throw new DeliveryError(`WhatsApp rejected the message (${res.status})`);
}
