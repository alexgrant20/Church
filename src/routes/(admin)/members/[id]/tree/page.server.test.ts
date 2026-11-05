import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/modules/member/tree-service', () => ({
	getFamilyTree: async (id: string) => ({ rootId: id })
}));

const { load } = await import('./+page.server');

describe('family tree load', () => {
	// SvelteKit re-runs a load that reads the URL whenever the query changes; this one audits
	// cross-branch views, so it must depend on the id alone.
	it('does not read the URL', async () => {
		const url = new Proxy(new URL('http://x/members/1/tree'), {
			get() {
				throw new Error('load read the URL');
			}
		});
		const run = load({ params: { id: '1' }, url } as unknown as Parameters<typeof load>[0]);
		await expect(run).resolves.toMatchObject({ tree: { rootId: '1' } });
	});
});
