import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApprovalsService } from './approvals.service';
import { RejectDto } from './dto/reject.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PaginationQuery, setTotalCount } from '../common/pagination';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/approvals. Only owners/admins may resolve an approval, and the resolving
// user is recorded on the approval + audit trail (accountable human-in-the-loop).
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  async findAll(
    @Res({ passthrough: true }) res: Response,
    @Query('status') status?: string,
    @Query() page: PaginationQuery = {},
  ) {
    const [data, total] = await Promise.all([
      this.approvals.findAll(status, page),
      this.approvals.count(status),
    ]);
    setTotalCount(res, total);
    return data;
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
