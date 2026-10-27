import { appendFileSync, readFileSync } from 'node:fs';
import { config } from '$lib/server/config';
import type { OutgoingMessage } from './sender';

export function logMessage(msg: OutgoingMessage): void {
	const line = JSON.stringify(msg);
	if (config.MESSAGE_LOG_FILE) appendFileSync(config.MESSAGE_LOG_FILE, line + '\n');
	else console.info(line);
}

export function readLoggedMessages(file: string): OutgoingMessage[] {
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l) as OutgoingMessage);
}
