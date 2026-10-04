import { MailerService } from './mailer.service';

/** Clear every SMTP/* var so a developer's local .env cannot affect the result. */
function clearMailEnv(): void {
  delete process.env.SMTP_URL;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.SMTP_SECURE;
  delete process.env.MAIL_FROM;
}

/** Swap in a stub transport so no network I/O happens in the SMTP-path tests. */
function stubTransport(mailer: MailerService, sendMail: jest.Mock): void {
  (mailer as unknown as { transporter: { sendMail: jest.Mock } }).transporter = {
    sendMail,
  };
}

describe('MailerService', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    clearMailEnv();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  it('falls back to the console transport when no SMTP is configured', async () => {
    const mailer = new MailerService();
    mailer.onModuleInit();
    expect(mailer.isConfigured).toBe(false);

    const result = await mailer.send({
      to: 'invitee@example.test',
      subject: 'Hello',
      text: 'Body',
    });
    expect(result).toEqual({ delivered: false, transport: 'console' });
  });

  it('delivers via SMTP and reports the message id when SMTP_HOST is set', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    const mailer = new MailerService();
    mailer.onModuleInit();
    expect(mailer.isConfigured).toBe(true);

    const sendMail = jest.fn().mockResolvedValue({ messageId: 'id-123' });
    stubTransport(mailer, sendMail);

    const result = await mailer.send({
      to: 'invitee@example.test',
      subject: 'Invite',
      text: 'Accept here',
    });
    expect(result).toEqual({
      delivered: true,
      transport: 'smtp',
      messageId: 'id-123',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'invitee@example.test',
        subject: 'Invite',
        text: 'Accept here',
      }),
    );
  });

  it('never throws when SMTP delivery fails; surfaces the error', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    const mailer = new MailerService();
    mailer.onModuleInit();

    const sendMail = jest
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    stubTransport(mailer, sendMail);

    const result = await mailer.send({
      to: 'x@example.test',
      subject: 'S',
      text: 'T',
    });
    expect(result.delivered).toBe(false);
    expect(result.transport).toBe('smtp');
    expect(result.error).toContain('connection refused');
  });

  it('treats SMTP_URL as configuration (and prefers it over discrete vars)', () => {
    process.env.SMTP_URL = 'smtp://user:pass@smtp.example.test:587';
    process.env.SMTP_HOST = 'ignored.example.test';
    const mailer = new MailerService();
    mailer.onModuleInit();
    expect(mailer.isConfigured).toBe(true);
  });
});
