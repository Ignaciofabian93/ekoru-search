import { Controller, Get, Inject } from '@nestjs/common';
import {
  SEARCH_ENGINE,
  type SearchEngine,
} from '../search/engine/search-engine.interface';

@Controller('health')
export class HealthController {
  constructor(@Inject(SEARCH_ENGINE) private readonly engine: SearchEngine) {}

  @Get()
  async healthCheck() {
    const typesenseOk = await this.engine.health();
    return {
      status: 'ok',
      typesense: typesenseOk ? 'ok' : 'unavailable',
    };
  }
}
