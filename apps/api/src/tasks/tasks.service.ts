import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { PaginationQuery, paginationArgs } from '../common/pagination';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

/**
 * Trim a free-text field and collapse an empty/whitespace-only value to `null`
 * so optional columns (description) stay clean and the UI can treat "no value"
 * reliably as a falsy value.
 */
function normalizeOptional(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** A page of tasks in the default org, newest first, optionally filtered. */
  findAll(
    filters: { projectId?: string; status?: string } = {},
    query: PaginationQuery = {},
  ) {
    return this.prisma.task.findMany({
      where: {
        organizationId: currentOrgId(),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      ...paginationArgs(query),
    });
  }

  /** A single task scoped to the default org, or 404. */
  async findOne(id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId: currentOrgId() },
    });
    if (!task) {
      throw new NotFoundException(`Task "${id}" not found`);
    }
    return task;
  }

  async create(dto: CreateTaskDto) {
    // Referenced project (required) and agent (optional) must live in this org.
    await this.assertProjectInOrg(dto.projectId);
    const assignedAgentId = dto.assignedAgentId?.trim() || null;
    if (assignedAgentId) {
      await this.assertAgentInOrg(assignedAgentId);
    }

    return this.prisma.task.create({
      data: {
        organizationId: currentOrgId(),
        projectId: dto.projectId,
        title: dto.title.trim(),
        description: normalizeOptional(dto.description),
        priority: dto.priority ?? 'medium',
        assignedAgentId,
        status: 'backlog',
      },
    });
  }

  async update(id: string, dto: UpdateTaskDto) {
    // Scopes the mutation to the default org: throws if the row is missing or
    // belongs to another organization before we touch it.
    await this.findOne(id);

    // A supplied assignee must resolve to an agent in this org; an explicit
    // null/empty value clears the assignment.
    const assignAgent = dto.assignedAgentId !== undefined;
    const assignedAgentId = dto.assignedAgentId?.trim() || null;
    if (assignAgent && assignedAgentId) {
      await this.assertAgentInOrg(assignedAgentId);
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: normalizeOptional(dto.description) }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(assignAgent ? { assignedAgentId } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    // Same org-scoping guard as update.
    await this.findOne(id);
    await this.prisma.task.delete({ where: { id } });
  }

  /** Throw unless `projectId` is a project in the default org. */
  private async assertProjectInOrg(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException(`Project "${projectId}" not found`);
    }
  }

  /** Throw unless `agentId` is an agent in the default org. */
  private async assertAgentInOrg(agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!agent) {
      throw new BadRequestException(`Agent "${agentId}" not found`);
    }
  }
}
