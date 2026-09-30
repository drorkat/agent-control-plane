import { Controller, Get, Param, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/notifications.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll() {
    return this.notifications.findAll();
  }

  @Get('unread-count')
  unreadCount() {
    return this.notifications.unreadCount();
  }

  @Post('read-all')
  markAllRead() {
    return this.notifications.markAllRead();
  }

  @Post(':id/read')
  markRead(@Param('id') id: string) {
    return this.notifications.markRead(id);
  }
}
