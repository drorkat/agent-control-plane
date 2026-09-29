import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RunsService } from './runs.service';
import { CreateRunDto } from './dto/create-run.dto';

// Global prefix `api` is applied in main.ts, so these routes live at /api/runs.
@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  findAll() {
    return this.runs.findAll();
  }

  @Post()
  create(@Body() dto: CreateRunDto) {
    return this.runs.start(dto.taskId, dto.agentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.runs.findOne(id);
  }
}
