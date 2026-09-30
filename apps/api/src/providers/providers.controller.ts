import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { Roles } from '../auth/roles.decorator';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/providers. There is intentionally no GET :id / "reveal" endpoint — the
// plaintext key is never returned by the API after it is saved.
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get()
  findAll() {
    return this.providers.findAll();
  }

  @Post()
  @Roles('owner', 'admin')
  create(@Body() dto: CreateProviderDto) {
    return this.providers.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('owner', 'admin')
  remove(@Param('id') id: string): Promise<void> {
    return this.providers.remove(id);
  }
}
