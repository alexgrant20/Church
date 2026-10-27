import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import '../../routes/layout.css';
import CitySelect from './CitySelect.svelte';
import PersonFieldsHarness from './test/PersonFieldsHarness.svelte';
import { createInfiniteList } from './infinite-list.svelte';

const jakarta = {
	id: '0190a000-0000-7000-8000-000000000001',
	name: 'Jakarta Barat',
	region: 'DKI'
};
const jaksel = {
	id: '0190a000-0000-7000-8000-000000000002',
	name: 'Jakarta Selatan',
	region: 'DKI'
};

function stubCities(items: unknown[]) {
	const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
		Response.json({ items, nextCursor: null })
	);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('CitySelect', () => {
	it('searches after typing and picks by keyboard', async () => {
		const fetchMock = stubCities([jakarta, jaksel]);
		const onchange = vi.fn();
		const screen = render(CitySelect, {
			value: null,
			names: {},
			label: 'Birth city',
			name: 'birthCity',
			onchange
		});
		await screen.getByRole('combobox', { name: 'Birth city' }).click();
		await userEvent.keyboard('jak');
		await expect
			.poll(() => fetchMock.mock.calls.some(([url]) => String(url).includes('q=jak')))
			.toBe(true);
		await expect.element(screen.getByRole('option', { name: /Jakarta Barat/ })).toBeVisible();
		await userEvent.keyboard('{ArrowDown}{Enter}');
		expect(onchange).toHaveBeenCalledWith(jakarta);
		await expect.element(screen.getByRole('combobox')).toHaveValue('Jakarta Barat');
	});

	it('never lets Enter pick a result of an older search', async () => {
		const other = { id: '0190a000-0000-7000-8000-000000000003', name: 'Aceh', region: 'NAD' };
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) =>
				Response.json({ items: url.includes('q=jak') ? [jakarta] : [other], nextCursor: null })
			)
		);
		const onchange = vi.fn();
		const screen = render(CitySelect, {
			value: null,
			names: {},
			label: 'City',
			name: 'c',
			onchange
		});
		await screen.getByRole('combobox', { name: 'City' }).click();
		await expect.element(screen.getByRole('option', { name: /Aceh/ })).toBeVisible();
		await userEvent.keyboard('jak');
		await expect.element(screen.getByRole('option', { name: /Aceh/ })).not.toBeInTheDocument();
		await userEvent.keyboard('{ArrowDown}{Enter}');
		await expect.element(screen.getByRole('option', { name: /Jakarta Barat/ })).toBeVisible();
		await userEvent.keyboard('{ArrowDown}{Enter}');
		expect(onchange).toHaveBeenCalledTimes(1);
		expect(onchange).toHaveBeenCalledWith(jakarta);
	});

	it('shows the empty state', async () => {
		stubCities([]);
		const screen = render(CitySelect, { value: null, names: {}, label: 'City', name: 'city' });
		await screen.getByRole('combobox', { name: 'City' }).click();
		await userEvent.keyboard('zzz');
		await expect.element(screen.getByText('No results')).toBeVisible();
	});
});

describe('createInfiniteList', () => {
	it('loads a page once while a load is in flight', async () => {
		const fetchPage = vi.fn(async () => ({ items: [1, 2], nextCursor: 'c1' }));
		const list = createInfiniteList(fetchPage);
		const first = list.loadMore();
		const second = list.loadMore();
		await Promise.all([first, second]);
		expect(fetchPage).toHaveBeenCalledTimes(1);
		expect(list.items).toEqual([1, 2]);
	});
});

describe('PersonFields', () => {
	it('reveals the baptism follow-up fields only on yes', async () => {
		stubCities([]);
		const screen = render(PersonFieldsHarness);
		const baptism = screen.getByRole('group', { name: 'Baptized' });
		await expect.element(screen.getByLabelText('Baptism date')).not.toBeInTheDocument();
		await baptism.getByRole('radio', { name: 'No' }).click();
		await expect.element(screen.getByLabelText('Baptism date')).not.toBeInTheDocument();
		await baptism.getByRole('radio', { name: 'Yes' }).click();
		await expect.element(screen.getByLabelText('Baptism date')).toBeVisible();
		await expect.element(screen.getByLabelText('Baptism church')).toBeVisible();
	});

	it('shows a translated error under the field', async () => {
		stubCities([]);
		const screen = render(PersonFieldsHarness, {
			errors: { nickname: ['error_required'] }
		});
		const field = screen.getByLabelText('Nickname');
		await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		await expect.element(field).toHaveAccessibleDescription(/This field is required/);
	});
});
