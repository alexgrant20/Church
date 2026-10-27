import { config } from '$lib/server/config';
import type { Locale } from '$lib/paraglide/runtime';
import { DeliveryError, type OutgoingMessage } from './sender';

const metaLanguage: Record<Locale, string> = {
	en: 'en',
	id: 'id',
	'zh-Hans': 'zh_CN',
	'zh-Hant': 'zh_TW'
};

export function buildWhatsAppTemplate(msg: OutgoingMessage): object {
	const code = msg.params.code;
	return {
		messaging_product: 'whatsapp',
		to: msg.to.replace(/^\+/, ''),
		type: 'template',
		template: {
			name: msg.template,
			language: { code: metaLanguage[msg.locale] },
			// Meta's authentication template: the code fills both the body and the copy-code button.
			components: [
				{ type: 'body', parameters: [{ type: 'text', text: code }] },
				{
					type: 'button',
					sub_type: 'url',
					index: '0',
					parameters: [{ type: 'text', text: code }]
				}
			]
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
