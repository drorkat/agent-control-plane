import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from './audit.service';
import { PaginationQuery, setTotalCount } from '../common/pagination';

// Global prefix `api` is applied in main.ts, so this route lives at /api/audit.
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async findAll(
    @Query() page: PaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [data, total] = await Promise.all([
      this.audit.findAll(page),
      this.audit.count(),
    ]);
    setTotalCount(res, total);
    return data;
  }
}
