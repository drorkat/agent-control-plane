import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { RejectDto } from './dto/reject.dto';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/approvals. Auth is not wired in the MVP, so the resolving user is left
// undefined (recorded as null on the approval/audit trail).
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.approvals.findAll(status);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.approvals.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.approvals.reject(id, dto.reason);
  }
}
