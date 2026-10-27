import type { Page } from './infinite-list.svelte';

export function fetchJsonPage<T>(endpoint: string, params: Record<string, string>) {
	return async (cursor: string | null): Promise<Page<T>> => {
		const query = new URLSearchParams(cursor ? { ...params, cursor } : params);
		const res = await fetch(`${endpoint}?${query}`);
		if (!res.ok) throw new Error(`${endpoint} answered ${res.status}`);
		return res.json();
	};
}
