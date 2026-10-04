import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** A single outbound message. `html` is optional; `text` is always required. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Outcome of a send. `delivered` is true only when SMTP actually accepted it. */
export interface MailResult {
  delivered: boolean;
  transport: 'smtp' | 'console';
  messageId?: string;
  error?: string;
}

/**
 * Minimal mail abstraction with two transports:
 *
 *  - **smtp** — used when `SMTP_URL` (or the discrete `SMTP_HOST`/`SMTP_PORT`/
 *    `SMTP_USER`/`SMTP_PASSWORD`/`SMTP_SECURE`) is set. Delivers via nodemailer.
 *  - **console** — the default when no SMTP is configured. Logs the message
 *    instead of sending it, so the app runs end-to-end without an email
 *    provider (invite links are also surfaced in the UI).
 *
 * Sends are **best-effort**: {@link send} never throws, so a mail outage or
 * misconfiguration never breaks the request that triggered the email.
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;
  private readonly from =
    process.env.MAIL_FROM?.trim() ||
    'Agent Control Plane <no-reply@agent-control-plane.local>';

  onModuleInit(): void {
    const config = this.buildTransportConfig();
    if (config) {
      this.transporter = nodemailer.createTransport(config as never);
      this.logger.log('SMTP mail transport configured');
    } else {
      this.logger.log(
        'No SMTP configured; using console mail transport (emails are logged, not sent)',
      );
    }
  }

  /** True when a real SMTP transport is wired up (i.e. email will be delivered). */
  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Send a message. On the console transport it logs the recipient and subject
   * (and the body at debug level) and returns `delivered: false`. On SMTP it
   * delivers and returns the provider message id, or — on failure — logs and
   * returns `delivered: false` with the error. Never rejects.
   */
  async send(msg: MailMessage): Promise<MailResult> {
    if (!this.transporter) {
      this.logger.log(
        `[mail:console] to=${msg.to} subject=${JSON.stringify(msg.subject)}`,
      );
      this.logger.debug(`[mail:console] body:\n${msg.text}`);
      return { delivered: false, transport: 'console' };
    }
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      });
      return {
        delivered: true,
        transport: 'smtp',
        messageId: info.messageId,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send mail to ${msg.to}: ${error}`);
      return { delivered: false, transport: 'smtp', error };
    }
  }

  /**
   * Resolve the nodemailer transport config from the environment, or `null` when
   * no SMTP is configured. `SMTP_URL` wins; otherwise discrete `SMTP_*` vars are
   * used, but only when at least `SMTP_HOST` is present.
   */
  private buildTransportConfig(): string | Record<string, unknown> | null {
    const url = process.env.SMTP_URL?.trim();
    if (url) {
      return url;
    }
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      return null;
    }
    const port = Number(process.env.SMTP_PORT ?? 587);
    // Implicit TLS on 465; STARTTLS (or none) otherwise. SMTP_SECURE=1 forces it.
    const secure = process.env.SMTP_SECURE === '1' || port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASSWORD;
    return {
      host,
      port,
      secure,
      ...(user || pass ? { auth: { user, pass } } : {}),
    };
  }
}
