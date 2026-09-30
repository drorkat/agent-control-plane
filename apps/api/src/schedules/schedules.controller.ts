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
import { IsBoolean } from 'class-validator';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Roles } from '../auth/roles.decorator';

/** Body for toggling a schedule's active state. */
class SetActiveDto {
  @IsBoolean()
  active!: boolean;
}

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/schedules. Any signed-in member may VIEW schedules; only owners and
// admins may create, toggle, or delete one.
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  findAll() {
    return this.schedules.findAll();
  }

  @Post()
  @Roles('owner', 'admin')
  create(@Body() dto: CreateScheduleDto) {
    return this.schedules.create(dto);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.schedules.setActive(id, dto.active);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.schedules.remove(id);
  }
}
