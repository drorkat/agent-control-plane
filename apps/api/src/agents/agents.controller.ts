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
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { Roles } from '../auth/roles.decorator';
import { PaginationQuery, setTotalCount } from '../common/pagination';

// Global prefix `api` is applied in main.ts, so these routes live at /api/agents.
// Reads open to any member; writes require member+ (viewers are read-only).
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  async findAll(
    @Query() page: PaginationQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [data, total] = await Promise.all([
      this.agents.findAll(page),
      this.agents.count(),
    ]);
    setTotalCount(res, total);
    return data;
  }

  @Post()
  @Roles('owner', 'admin', 'member')
  create(@Body() dto: CreateAgentDto) {
    return this.agents.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agents.findOne(id);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'member')
  update(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agents.update(id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin', 'member')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.agents.remove(id);
  }
}
