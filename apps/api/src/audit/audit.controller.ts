import { Controller, Get } from '@nestjs/common';
import { AuditService } from './audit.service';

// Global prefix `api` is applied in main.ts, so this route lives at /api/audit.
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  findAll() {
    return this.audit.findAll();
  }
}
