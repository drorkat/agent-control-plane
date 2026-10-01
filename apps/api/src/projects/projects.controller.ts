import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Roles } from '../auth/roles.decorator';
import { PaginationQuery } from '../common/pagination';

// Reads are open to any member (incl. viewers); writes require member+ (viewers
// are read-only).
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  findAll(@Query() page: PaginationQuery) {
    return this.projects.findAll(page);
  }

  @Post()
  @Roles('owner', 'admin', 'member')
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projects.findOne(id);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'member')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin', 'member')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.projects.remove(id);
  }
}
