import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PaginationQuery } from '../common/pagination';

// Global prefix `api` is applied in main.ts, so this route lives at /api/audit.
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  findAll(@Query() page: PaginationQuery) {
    return this.audit.findAll(page);
  }
}
