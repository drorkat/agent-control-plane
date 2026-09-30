import { Module } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { AiModule } from '../ai/ai.module';
import { GatewayModule } from '../gateway/gateway.module';
import { GitHubModule } from '../github/github.module';

// PrismaService and AuditService are provided by @Global() modules, so they do
// not need to be imported here; GatewayModule (not global) is imported for the
// gateway policy check, and GitHubModule for the code loop (branch -> commit ->
// pull request) that runs when an open_pull_request approval is granted.
// RunsService is exported so ApprovalsModule can inject it to resume a paused
// run. The manager registers this module in app.module.ts.
@Module({
  imports: [AiModule, GatewayModule, GitHubModule],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
