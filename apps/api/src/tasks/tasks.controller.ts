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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Roles } from '../auth/roles.decorator';
import { PaginationQuery, setTotalCount } from '../common/pagination';

// Global prefix `api` is applied in main.ts, so these routes live at /api/tasks.
// Reads open to any member; writes require member+ (viewers are read-only).
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  async findAll(
    @Res({ passthrough: true }) res: Response,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query() page: PaginationQuery = {},
  ) {
    const filters = { projectId, status };
    const [data, total] = await Promise.all([
      this.tasks.findAll(filters, page),
      this.tasks.count(filters),
    ]);
    setTotalCount(res, total);
    return data;
  }

  @Post()
  @Roles('owner', 'admin', 'member')
  create(@Body() dto: CreateTaskDto) {
    return this.tasks.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findOne(id);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'member')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin', 'member')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.tasks.remove(id);
  }
}
