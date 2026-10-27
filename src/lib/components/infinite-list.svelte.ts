export type Page<T> = { items: T[]; nextCursor: string | null };

export function createInfiniteList<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>) {
	const items = $state<T[]>([]);
	let loading = $state(false);
	let done = $state(false);
	let failed = $state(false);
	let cursor: string | null = null;

	async function loadMore() {
		if (loading || done) return;
		loading = true;
		failed = false;
		try {
			const page = await fetchPage(cursor);
			items.push(...page.items);
			cursor = page.nextCursor;
			done = cursor === null;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	return {
		get items() {
			return items;
		},
		get loading() {
			return loading;
		},
		get done() {
			return done;
		},
		get failed() {
			return failed;
		},
		loadMore
	};
}

export type InfiniteList<T> = ReturnType<typeof createInfiniteList<T>>;
