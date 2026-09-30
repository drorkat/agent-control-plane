import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

// Global prefix `api` (main.ts) puts this route at /api/dashboard/stats. It is
// not @Public, so the global AuthGuard requires an authenticated session.
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  stats() {
    return this.dashboard.stats();
  }
}
