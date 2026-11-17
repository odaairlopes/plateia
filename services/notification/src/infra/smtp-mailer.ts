import nodemailer from 'nodemailer';
import type { Mailer } from '../application/ports';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Plain SMTP on purpose: it works with a local catcher (Mailpit) in
 * development and with any provider in production (Brevo, Resend, SES, Gmail…)
 * by changing configuration only, with no SDK lock-in.
 */
export function createSmtpMailer(config: SmtpConfig): Mailer & { verify(): Promise<void>; close(): void } {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    async send(email) {
      const info = await transport.sendMail({
        from: config.from,
        to: { name: email.to.name, address: email.to.address },
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
          cid: attachment.cid,
        })),
      });
      return { messageId: info.messageId };
    },
    async verify() {
      await transport.verify();
    },
    close() {
      transport.close();
    },
  };
}
