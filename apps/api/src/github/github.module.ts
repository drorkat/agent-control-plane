import { Module } from '@nestjs/common';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';
import { GitHubClientFactory } from './github-client.factory';

// PrismaService is provided by the @Global() PrismaModule, so it does not need
// to be imported here. The manager registers this module in app.module.ts.
//
// GitHubClientFactory is exported because the run loop resolves the code-loop
// client (branch -> commit -> pull request) through it after an
// `open_pull_request` action is approved.
@Module({
  controllers: [GitHubController],
  providers: [GitHubService, GitHubClientFactory],
  exports: [GitHubClientFactory],
})
export class GitHubModule {}
