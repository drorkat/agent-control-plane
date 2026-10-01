import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * Times every HTTP request and records it on the Prometheus histogram/counter.
 * The measurement is taken on the response's `finish` event so the status code
 * is the final one (including statuses an exception filter sets), and the label
 * is the matched ROUTE PATTERN (e.g. `/api/runs/:id`), never the raw URL — that
 * keeps metric cardinality bounded instead of exploding per id.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request & { route?: { path?: string } }>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    res.once('finish', () => {
      const route = req.route?.path ?? 'unknown';
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observe(req.method, route, res.statusCode, seconds);
    });

    return next.handle();
  }
}
