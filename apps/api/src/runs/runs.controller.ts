import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RunsService } from './runs.service';
import { CreateRunDto } from './dto/create-run.dto';
import { Roles } from '../auth/roles.decorator';

// Global prefix `api` is applied in main.ts, so these routes live at /api/runs.
@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  findAll() {
    return this.runs.findAll();
  }

  // Starting a run reads the repo, spends model tokens, and can open a PR, so it
  // is a write action — viewers are read-only.
  @Post()
  @Roles('owner', 'admin', 'member')
  create(@Body() dto: CreateRunDto) {
    return this.runs.start(dto.taskId, dto.agentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.runs.findOne(id);
  }
}
