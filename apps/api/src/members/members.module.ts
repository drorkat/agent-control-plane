import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

// PrismaService is provided by the @Global() PrismaModule, so it does not need
// to be imported here. The manager registers this module in app.module.ts.
@Module({
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
