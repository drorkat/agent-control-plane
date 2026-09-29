import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

// Global prefix `api` is applied in main.ts, so these routes live at /api/agents.
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  findAll() {
    return this.agents.findAll();
  }

  @Post()
  create(@Body() dto: CreateAgentDto) {
    return this.agents.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agents.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agents.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.agents.remove(id);
  }
}
