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
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { Roles } from '../auth/roles.decorator';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/members. Any signed-in member may VIEW the roster; only owners and admins
// may add, change a role, or remove a member.
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  findAll() {
    return this.members.findAll();
  }

  @Post()
  @Roles('owner', 'admin')
  create(@Body() dto: CreateMemberDto) {
    return this.members.create(dto);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  updateRole(@Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.members.updateRole(id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.members.remove(id);
  }
}
