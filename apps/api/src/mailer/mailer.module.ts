import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/**
 * Global so any feature module can inject {@link MailerService} without importing
 * this module explicitly (mirrors how PrismaModule is wired).
 */
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
