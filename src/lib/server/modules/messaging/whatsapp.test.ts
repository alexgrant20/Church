import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/config', () => ({ config: {} }));

import { buildWhatsAppTemplate } from './whatsapp';

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
