import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

/**
 * Trim a free-text field and collapse an empty/whitespace-only value to `null`
 * so optional columns (description, repoUrl) stay clean and the UI can treat
 * "no repo" reliably as a falsy value.
 */
function normalizeOptional(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.project.findMany({
      where: { organizationId: DEFAULT_ORG_ID },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: DEFAULT_ORG_ID },
    });
    if (!project) {
      throw new NotFoundException(`Project "${id}" not found`);
    }
    return project;
  }

  create(dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        name: dto.name.trim(),
        description: normalizeOptional(dto.description),
        repoUrl: normalizeOptional(dto.repoUrl),
      },
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    // Scopes the mutation to the default org: throws if the row is missing or
    // belongs to another organization before we touch it.
    await this.findOne(id);

    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: normalizeOptional(dto.description) }
          : {}),
        ...(dto.repoUrl !== undefined
          ? { repoUrl: normalizeOptional(dto.repoUrl) }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    // Same org-scoping guard as update.
    await this.findOne(id);
    await this.prisma.project.delete({ where: { id } });
  }
}
