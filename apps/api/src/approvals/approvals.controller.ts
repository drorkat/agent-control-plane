import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { RejectDto } from './dto/reject.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/approvals. Only owners/admins may resolve an approval, and the resolving
// user is recorded on the approval + audit trail (accountable human-in-the-loop).
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.approvals.findAll(status);
  }

  @Post(':id/approve')
  @Roles('owner', 'admin')
  approve(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.approvals.approve(id, user?.userId);
  }

  @Post(':id/reject')
  @Roles('owner', 'admin')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.approvals.reject(id, dto.reason, user?.userId);
  }
}
