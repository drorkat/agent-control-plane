import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Owns a private Prometheus registry and the app's HTTP metrics. A private
 * registry (rather than the global default) keeps metrics isolated and testable,
 * and means nothing leaks in from other libraries. Default process metrics
 * (event loop lag, heap, CPU, GC, ...) are collected automatically.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly httpDuration: Histogram<string>;
  private readonly httpTotal: Counter<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    this.httpTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
  }

  /** Record one finished HTTP request. `route` is the matched pattern (low cardinality). */
  observe(method: string, route: string, status: number, seconds: number): void {
    const labels = { method, route, status: String(status) };
    this.httpDuration.observe(labels, seconds);
    this.httpTotal.inc(labels);
  }

  /** The Prometheus exposition text for the /metrics endpoint. */
  scrape(): Promise<string> {
    return this.registry.metrics();
  }

  /** The content type Prometheus expects for the scrape response. */
  get contentType(): string {
    return this.registry.contentType;
  }
}
