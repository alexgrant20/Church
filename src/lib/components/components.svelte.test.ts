import { describe, it, expect } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import '../../routes/layout.css';
import BrandMark from './BrandMark.svelte';
import StatusPill from './StatusPill.svelte';
import ThemeSwitch from './ThemeSwitch.svelte';
import { Button } from './ui/button';

const textSnippet = (text: string) =>
	createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

describe('GRII components', () => {
	it('BrandMark has alt text GRII', async () => {
		const screen = render(BrandMark, { height: 24 });
		await expect.element(screen.getByAltText('GRII')).toBeVisible();
	});
	it('StatusPill keeps its label on one line', async () => {
		const screen = render(StatusPill, { tone: 'positive', label: 'Active' });
		const pill = screen.getByText('Active');
		expect(getComputedStyle(pill.element()).whiteSpace).toBe('nowrap');
	});
	it('ThemeSwitch offers three named options and marks the current one', async () => {
		const screen = render(ThemeSwitch, { current: 'system' });
		await expect.element(screen.getByRole('radio', { name: 'System' })).toBeChecked();
		await expect.element(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
	});
	it('a focused button shows a 2px focus ring', async () => {
		const screen = render(Button, { children: textSnippet('Save') });
		const button = screen.getByRole('button');
		// userEvent.tab() cannot focus here: the headless test frame has no document focus.
		await userEvent.keyboard('{Tab}');
		button.element().focus();
		expect(getComputedStyle(button.element()).outlineWidth).toBe('2px');
	});
});
