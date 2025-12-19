import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service.js';
import { QuotationsResolver } from './quotations.resolver.js';

@Module({
  providers: [QuotationsService, QuotationsResolver],
  exports: [QuotationsService],
})
export class QuotationsModule {}
