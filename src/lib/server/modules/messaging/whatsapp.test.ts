import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/config', () => ({
	config: { WHATSAPP_PHONE_NUMBER_ID: 'pid', WHATSAPP_ACCESS_TOKEN: 'tok' }
}));

import { DeliveryError, type OutgoingMessage } from './sender';
import { buildWhatsAppTemplate, sendWhatsApp } from './whatsapp';

const msg: OutgoingMessage = {
	channel: 'whatsapp',
	to: '+6281234567890',
	template: 'otp',
	locale: 'en',
	params: { code: '123456' }
};

describe('buildWhatsAppTemplate', () => {
	it('builds the authentication template with the code in body and copy button', () => {
		const body = buildWhatsAppTemplate({
			channel: 'whatsapp',
			to: '+6281234567890',
			template: 'otp',
			locale: 'zh-Hant',
			params: { code: '123456' }
		});
		expect(body).toMatchObject({
			messaging_product: 'whatsapp',
			to: '6281234567890',
			type: 'template',
			template: { name: 'otp', language: { code: 'zh_TW' } }
		});
		expect(JSON.stringify(body)).toContain('"123456"');
	});
});

describe('buildWhatsAppTemplate for registration templates', () => {
	it('needs_fix omits the reason', () => {
		const body = JSON.stringify(
			buildWhatsAppTemplate({
				channel: 'whatsapp',
				to: '+62811',
				template: 'registration_needs_fix',
				locale: 'id',
				params: { name: 'Ann', fixUrl: 'https://x.test/f', reason: 'SECRET-REASON' }
			})
		);
		expect(body).toContain('registration_needs_fix');
		expect(body).toContain('https://x.test/f');
		expect(body).not.toContain('SECRET-REASON');
	});
});

describe('sendWhatsApp', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('throws DeliveryError on a non-2xx response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 400 })));
		await expect(sendWhatsApp(msg)).rejects.toBeInstanceOf(DeliveryError);
	});

	it('throws DeliveryError when fetch rejects', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
		await expect(sendWhatsApp(msg)).rejects.toBeInstanceOf(DeliveryError);
	});

	it('passes a timeout signal and maps the abort to DeliveryError', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
		vi.stubGlobal('fetch', fetchMock);
		await expect(sendWhatsApp(msg)).rejects.toBeInstanceOf(DeliveryError);
		expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});
});
