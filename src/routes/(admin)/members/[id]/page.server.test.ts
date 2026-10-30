import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/modules/member/record-service', () => ({
	getMember: async (id: string) => ({ id })
}));

const { load } = await import('./+page.server');

describe('member record load', () => {
	// SvelteKit re-runs a load that reads the URL whenever the query changes; this one audits
	// cross-branch views, so a tab switch must not run it again.
	it('does not read the URL', async () => {
		const url = new Proxy(new URL('http://x/members/1?tab=family'), {
			get() {
				throw new Error('load read the URL');
			}
		});
		const run = load({ params: { id: '1' }, url } as unknown as Parameters<typeof load>[0]);
		await expect(run).resolves.toMatchObject({ record: { id: '1' } });
	});
});
