import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RunsService } from '../runs/runs.service';
import { tenantStorage } from '../common/tenant';

// How often the scheduler wakes to look for due schedules.
const TICK_INTERVAL_MS = 60_000;
// A short delay after boot before the first tick, so a freshly started server
// picks up already-due schedules without waiting a full interval.
const BOOT_DELAY_MS = 5_000;
// Cap the schedules handled per tick so a single pass can never run unbounded.
const MAX_PER_TICK = 50;

/**
 * Fires scheduled runs on a fixed interval. Unlike request-scoped services this
 * runs OUTSIDE any HTTP request, so for each due schedule it establishes tenant
 * context for that schedule's org via `tenantStorage.run` before starting a run.
 * Without it `currentOrgId()` inside RunsService would fall back to the default
 * org and work would leak across tenants.
 *
 * A deliberately dependency-free timer (plain `setInterval`, no @nestjs/schedule)
 * drives it; a `running` guard keeps ticks from overlapping, and no error is
 * ever allowed to escape a tick.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private bootTimer?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: RunsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    // Kick one tick shortly after boot so due schedules don't wait a full minute.
    this.bootTimer = setTimeout(() => void this.tick(), BOOT_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }

  /**
   * One scheduler pass: load due, active schedules across ALL orgs and, for each,
   * atomically CLAIM it (advance `lastRunAt`/`nextRunAt` only if the row still
   * holds the `nextRunAt` we read) before starting a run inside that schedule's
   * tenant context. The claim is what makes this safe for multiple API instances:
   * only one instance's conditional update matches per due window, so a schedule
   * fires exactly once even with N schedulers running — no lock table or external
   * lease needed. Each schedule is isolated in its own try/catch so one bad row
   * never aborts the pass, and the `running` guard keeps passes within this
   * instance non-overlapping. This method never throws.
   */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.schedule.findMany({
        where: {
          active: true,
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
        },
        take: MAX_PER_TICK,
      });

      for (const schedule of due) {
        // Capture the org (and interval) from the row itself — never rely on any
        // ambient context inside this loop.
        const { organizationId, intervalMinutes } = schedule;
        try {
          // Atomically claim the schedule: advance it only if its nextRunAt is
          // still exactly what we read. Across instances (or overlapping ticks)
          // only the first update matches — everyone else sees an already-moved
          // nextRunAt and updates zero rows, so the run below fires once. We
          // advance BEFORE running so a long run can't be re-claimed mid-flight;
          // the schedule retries on its next interval regardless of outcome.
          const now = new Date();
          const claim = await this.prisma.schedule.updateMany({
            where: {
              id: schedule.id,
              active: true,
              nextRunAt: schedule.nextRunAt,
            },
            data: {
              lastRunAt: now,
              nextRunAt: new Date(now.getTime() + intervalMinutes * 60_000),
            },
          });
          if (claim.count === 0) {
            // Another instance/tick already claimed this due window.
            continue;
          }

          await tenantStorage.run({ organizationId }, async () => {
            try {
              await this.runs.start(
                schedule.taskId,
                schedule.agentId ?? undefined,
              );
            } catch (err) {
              // A run that actually started records its own failure on the run.
              // But some failures (e.g. the task's agent was later unassigned)
              // reject inside runs.start() BEFORE any Run row exists, which would
              // otherwise be an invisible no-op — so log the reason here.
              const message = err instanceof Error ? err.message : String(err);
              this.logger.warn(
                `Scheduled run for schedule "${schedule.id}" did not start: ${message}`,
              );
            }
          });
        } catch (err) {
          // One bad schedule must never break the tick. Log the message only —
          // never any secret material.
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Schedule "${schedule.id}" failed to process: ${message}`,
          );
        }
      }
    } catch (err) {
      // The top-level load (or anything unexpected) must never escape the tick.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Scheduler tick failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
