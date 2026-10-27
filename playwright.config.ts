import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'bun run build && bun run preview',
		port: 4173,
		env: { MESSAGE_TRANSPORT: 'log', MESSAGE_LOG_FILE: 'test-results/messages.jsonl' }
	},
	globalSetup: './e2e-global-setup.ts',
	testMatch: '**/*.e2e.{ts,js}'
});
