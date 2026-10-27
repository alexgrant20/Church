import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '$lib/server/config';
import * as m from '$lib/paraglide/messages';
import { DeliveryError, type OutgoingMessage } from './sender';

let transport: Transporter | undefined;

function getTransport() {
	transport ??= nodemailer.createTransport({
		host: config.SMTP_HOST,
		port: config.SMTP_PORT,
		secure: config.SMTP_PORT === 465,
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 10_000,
		auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
	});
	return transport;
}

function content(msg: OutgoingMessage): { subject: string; text: string } {
	const o = { locale: msg.locale };
	const p = msg.params;
	switch (msg.template) {
		case 'otp':
			return { subject: m.otp_email_subject({}, o), text: m.otp_email_body({ code: p.code }, o) };
		case 'registration_approved': {
			const text = m.registration_approved_email_body(
				{ name: p.name, activateUrl: p.activateUrl },
				o
			);
			return {
				subject: m.registration_approved_email_subject({}, o),
				text:
					p.someoneNotAdded === 'yes'
						? `${text}

${m.registration_approved_email_partial({}, o)}`
						: text
			};
		}
		case 'registration_needs_fix':
			return {
				subject: m.registration_needs_fix_email_subject({}, o),
				text: m.registration_needs_fix_email_body(
					{ name: p.name, fixUrl: p.fixUrl, reason: p.reason },
					o
				)
			};
		case 'consent_request':
			return {
				subject: m.consent_request_email_subject({ registrantName: p.registrantName }, o),
				text: m.consent_request_email_body(
					{ registrantName: p.registrantName, consentUrl: p.consentUrl },
					o
				)
			};
	}
}

export async function sendEmail(msg: OutgoingMessage): Promise<void> {
	const { subject, text } = content(msg);
	try {
		await getTransport().sendMail({
			from: config.SMTP_FROM,
			to: msg.to,
			subject,
			text
		});
	} catch (cause) {
		throw new DeliveryError('SMTP send failed', { cause });
	}
}
