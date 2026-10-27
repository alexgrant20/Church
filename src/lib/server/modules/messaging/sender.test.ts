import { describe, expect, it, vi } from 'vitest';

const file = await vi.hoisted(async () => {
	const { mkdtempSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	return join(mkdtempSync(join(tmpdir(), 'msg-')), 'out.jsonl');
});
vi.mock('$lib/server/config', () => ({
	config: { MESSAGE_TRANSPORT: 'log', MESSAGE_LOG_FILE: file }
}));

import { readLoggedMessages } from './log';
import { sendMessage } from './sender';

describe('sendMessage', () => {
	it('log transport appends one JSON line per message', async () => {
		await sendMessage({
			channel: 'email',
			to: 'a@mail.test',
			template: 'otp',
			locale: 'en',
			params: { code: '123456' }
		});
		expect(readLoggedMessages(file)).toEqual([
			expect.objectContaining({ to: 'a@mail.test', params: { code: '123456' } })
		]);
	});
});
