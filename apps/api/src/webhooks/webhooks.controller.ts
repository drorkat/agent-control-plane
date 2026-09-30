import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/webhooks. The signing secret is returned only by POST (create) and is
// never exposed again by any GET — there is intentionally no "reveal" endpoint.
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  findAll() {
    return this.webhooks.findAll();
  }

  @Post()
  create(@Body() dto: CreateWebhookDto) {
    return this.webhooks.create(dto);
  }

  @Get(':id/deliveries')
  deliveries(@Param('id') id: string) {
    return this.webhooks.recentDeliveries(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.webhooks.remove(id);
  }
}
