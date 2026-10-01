import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { MetricsService } from './metrics.service';

// Global prefix `api` applies, so this is scraped at /api/metrics. It is
// @Public (no session) and @SkipThrottle (a scraper polls it frequently). Note:
// expose it only on a trusted network / behind your ingress in production.
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.scrape());
  }
}
