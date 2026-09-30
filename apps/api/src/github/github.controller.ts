import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { GitHubService } from './github.service';
import { ConnectGithubDto } from './dto/connect-github.dto';
import { Roles } from '../auth/roles.decorator';

// Global prefix `api` is applied in main.ts, so these routes live at
// /api/github. There is intentionally no endpoint that returns the token — the
// plaintext PAT is never returned by the API after it is saved.
@Controller('github')
export class GitHubController {
  constructor(private readonly github: GitHubService) {}

  @Get('connection')
  getConnection() {
    return this.github.getConnection();
  }

  @Post('connection')
  @Roles('owner', 'admin')
  connect(@Body() dto: ConnectGithubDto) {
    return this.github.connect(dto);
  }

  @Delete('connection/:id')
  @HttpCode(204)
  @Roles('owner', 'admin')
  disconnect(@Param('id') id: string): Promise<void> {
    return this.github.disconnect(id);
  }
}
