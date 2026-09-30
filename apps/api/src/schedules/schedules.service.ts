import { Injectable, NotFoundException } from '@nestjs/common';
import { Schedule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { CreateScheduleDto } from './dto/create-schedule.dto';

/**
 * A schedule row as returned to clients. Unlike providers/webhooks a Schedule
 * carries no secret material, so the whole row is safe to return and no
 * SAFE_SELECT projection is needed here.
 */
export type ScheduleView = Schedule;

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a schedule in the current org. The task (and the optional agent
   * override) are verified to belong to the same org first via `findFirst`, so a
   * schedule can never be pointed at another tenant's task or agent. `nextRunAt`
   * is seeded one interval out and the schedule starts active.
   */
  async create(dto: CreateScheduleDto): Promise<ScheduleView> {
    const task = await this.prisma.task.findFirst({
      where: { id: dto.taskId, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException(`Task "${dto.taskId}" not found`);
    }

    if (dto.agentId) {
      const agent = await this.prisma.agent.findFirst({
        where: { id: dto.agentId, organizationId: currentOrgId() },
        select: { id: true },
      });
      if (!agent) {
        throw new NotFoundException(`Agent "${dto.agentId}" not found`);
      }
    }

    const nextRunAt = new Date(Date.now() + dto.intervalMinutes * 60_000);

    return this.prisma.schedule.create({
      data: {
        organizationId: currentOrgId(),
        taskId: dto.taskId,
        agentId: dto.agentId ?? null,
        name: dto.name ?? null,
        intervalMinutes: dto.intervalMinutes,
        active: true,
        nextRunAt,
      },
    });
  }

  /**
   * All schedules in the current org, newest first, each annotated with a light
   * task title for the UI. The titles are loaded in one extra org-scoped query
   * and mapped in, so no cross-tenant title can leak.
   */
  async findAll(): Promise<(ScheduleView & { taskTitle: string | null })[]> {
    const schedules = await this.prisma.schedule.findMany({
      where: { organizationId: currentOrgId() },
      orderBy: { createdAt: 'desc' },
    });
    if (schedules.length === 0) return [];

    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: currentOrgId(),
        id: { in: schedules.map((s) => s.taskId) },
      },
      select: { id: true, title: true },
    });
    const titleById = new Map(tasks.map((t) => [t.id, t.title]));

    return schedules.map((s) => ({
      ...s,
      taskTitle: titleById.get(s.taskId) ?? null,
    }));
  }

  /**
   * Activate or deactivate a schedule, scoped to the current org. The `findFirst`
   * is an ownership guard: a row belonging to another org (or a bad id) yields a
   * 404 instead of a cross-tenant update. Re-activating also refreshes
   * `nextRunAt` one interval out, so a long-dormant schedule doesn't fire
   * immediately on the next tick.
   */
  async setActive(id: string, active: boolean): Promise<ScheduleView> {
    const existing = await this.prisma.schedule.findFirst({
      where: { id, organizationId: currentOrgId() },
    });
    if (!existing) {
      throw new NotFoundException(`Schedule "${id}" not found`);
    }

    return this.prisma.schedule.update({
      where: { id: existing.id },
      data: {
        active,
        ...(active
          ? {
              nextRunAt: new Date(
                Date.now() + existing.intervalMinutes * 60_000,
              ),
            }
          : {}),
      },
    });
  }

  /**
   * Delete a schedule, scoped to the current org. The `findFirst` guards against
   * a cross-tenant delete: another org's row (or a bad id) yields a 404.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.schedule.findFirst({
      where: { id, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Schedule "${id}" not found`);
    }
    await this.prisma.schedule.delete({ where: { id: existing.id } });
  }
}
