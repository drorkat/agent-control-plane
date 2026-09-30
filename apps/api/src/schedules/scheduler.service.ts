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
   * start a run inside that schedule's tenant context, then advance its
   * `lastRunAt`/`nextRunAt` regardless of the run's outcome. Each schedule is
   * isolated in its own try/catch so one bad row never aborts the pass, and the
   * `running` guard makes passes non-overlapping. This method never throws.
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
          await tenantStorage.run({ organizationId }, async () => {
            try {
              await this.runs.start(
                schedule.taskId,
                schedule.agentId ?? undefined,
              );
            } catch {
              // A failed run is already recorded on the run itself; the schedule
              // still advances below so it retries on its next interval.
            }
          });

          // Advance the schedule regardless of the run's outcome.
          const now = new Date();
          await this.prisma.schedule.update({
            where: { id: schedule.id },
            data: {
              lastRunAt: now,
              nextRunAt: new Date(now.getTime() + intervalMinutes * 60_000),
            },
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
