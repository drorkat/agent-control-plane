import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

/**
 * Distributed tracing (OpenTelemetry). Deliberately a NO-OP unless enabled:
 *   - OTEL_EXPORTER_OTLP_ENDPOINT set  -> export spans via OTLP/HTTP to that
 *     collector (standard OTEL_* env vars are honored automatically).
 *   - OTEL_TRACING=1 (no endpoint)     -> print spans to stdout (local debugging).
 * Otherwise nothing is instrumented and there is zero overhead.
 *
 * This runs as a side effect at import time (see the call below) and is imported
 * FIRST in main.ts, before Nest / http / express load, so the auto-instrumentations
 * can patch those modules as they are required.
 */
export function startTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const enabled = !!endpoint || process.env.OTEL_TRACING === '1';
  if (!enabled) return;

  process.env.OTEL_SERVICE_NAME ||= 'acp-api';

  const sdk = new NodeSDK({
    traceExporter: endpoint ? new OTLPTraceExporter() : new ConsoleSpanExporter(),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
    ],
  });
  sdk.start();

  const shutdown = (): void => {
    void sdk.shutdown().catch(() => undefined);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startTracing();
