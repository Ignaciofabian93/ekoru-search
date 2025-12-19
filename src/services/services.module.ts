import { Module } from '@nestjs/common';
import { ServicesService } from './services.service.js';
import { ServicesResolver } from './services.resolver.js';

@Module({
  providers: [ServicesService, ServicesResolver],
  exports: [ServicesService],
})
export class ServicesModule {}
