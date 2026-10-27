import { config } from '$lib/server/config';
import type { Locale } from '$lib/paraglide/runtime';
import { sendEmail } from './email';
import { logMessage } from './log';
import { sendWhatsApp } from './whatsapp';

export type Channel = 'whatsapp' | 'email';
export type MessageTemplate = 'otp';
export type OutgoingMessage = {
	channel: Channel;
	to: string;
	template: MessageTemplate;
	locale: Locale;
	params: Record<string, string>;
};

export class DeliveryError extends Error {}

export async function sendMessage(msg: OutgoingMessage): Promise<void> {
	if (config.MESSAGE_TRANSPORT === 'log') return logMessage(msg);
	if (msg.channel === 'whatsapp') return sendWhatsApp(msg);
	return sendEmail(msg);
}
