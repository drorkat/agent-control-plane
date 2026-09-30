import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/invitations. Managing invitations (create/list/revoke) is limited to
// owners and admins; the token-based preview and accept routes are Public so a
// prospective member — who has no session yet — can complete onboarding.
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @Roles('owner', 'admin')
  create(@Body() dto: CreateInvitationDto, @CurrentUser() user?: AuthUser) {
    return this.invitations.create(dto, user?.userId);
  }

  @Get()
  @Roles('owner', 'admin')
  findAllPending() {
    return this.invitations.findAllPending();
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(204)
  revoke(@Param('id') id: string): Promise<void> {
    return this.invitations.revoke(id);
  }

  @Public()
  @Get(':token')
  getByToken(@Param('token') token: string) {
    return this.invitations.getByToken(token);
  }

  @Public()
  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(token, dto);
  }
}
