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
		auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
	});
	return transport;
}

export async function sendEmail(msg: OutgoingMessage): Promise<void> {
	const { locale } = msg;
	try {
		await getTransport().sendMail({
			from: config.SMTP_FROM,
			to: msg.to,
			subject: m.otp_email_subject({}, { locale }),
			text: m.otp_email_body({ code: msg.params.code }, { locale })
		});
	} catch (cause) {
		throw new DeliveryError('SMTP send failed', { cause });
	}
}
