export type Page<T> = { items: T[]; nextCursor: string | null };

// `first` is a page the server already rendered, so the list starts without a request.
export function createInfiniteList<T>(
	fetchPage: (cursor: string | null) => Promise<Page<T>>,
	first?: Page<T>
) {
	const items = $state<T[]>(first ? [...first.items] : []);
	let loading = $state(false);
	let done = $state(first ? first.nextCursor === null : false);
	let failed = $state(false);
	let cursor: string | null = first?.nextCursor ?? null;

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
