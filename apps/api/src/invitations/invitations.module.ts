import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

// PrismaService is provided by the @Global() PrismaModule, so it does not need to
// be imported here. The manager registers this module in app.module.ts.
@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
