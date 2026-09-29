import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All agents in the default org, newest first. */
  findAll() {
    return this.prisma.agent.findMany({
      where: { organizationId: DEFAULT_ORG_ID },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** A single agent scoped to the default org, or 404. */
  async findOne(id: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, organizationId: DEFAULT_ORG_ID },
    });
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    return agent;
  }

  create(dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        name: dto.name,
        provider: dto.provider,
        model: dto.model,
        role: dto.role,
        instructions: dto.instructions,
        projectId: dto.projectId,
        autonomyLevel: dto.autonomyLevel ?? 1,
        status: 'idle',
      },
    });
  }

  async update(id: string, dto: UpdateAgentDto) {
    // Ensure the agent exists in the default org before mutating.
    await this.findOne(id);
    return this.prisma.agent.update({
      where: { id },
      data: {
        name: dto.name,
        provider: dto.provider,
        model: dto.model,
        role: dto.role,
        instructions: dto.instructions,
        projectId: dto.projectId,
        autonomyLevel: dto.autonomyLevel,
        status: dto.status,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.agent.delete({ where: { id } });
  }
}
