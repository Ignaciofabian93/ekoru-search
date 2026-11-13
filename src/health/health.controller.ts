import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SEARCH_ENGINE,
  type SearchEngine,
} from '../search/engine/search-engine.interface';

/** How long the database gets to answer the readiness check. */
const READY_TIMEOUT_MS = 2_000;

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(SEARCH_ENGINE) private readonly engine: SearchEngine,
    private readonly prisma: PrismaService,
  ) {}

  /** Liveness: the process answers. Docker's healthcheck reads this one. */
  @Get()
  async healthCheck() {
    const typesenseOk = await this.engine.health();
    return {
      status: 'ok',
      typesense: typesenseOk ? 'ok' : 'unavailable',
    };
  }

  /**
   * Readiness (INF-24): the database answers too. `/health` says ok while the
   * database is unreachable, so an uptime check on it never notices. This one
   * answers 503 when a `SELECT 1` fails or takes over 2 seconds.
   */
  @Get('ready')
  async ready() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`no answer in ${READY_TIMEOUT_MS} ms`)),
            READY_TIMEOUT_MS,
          );
        }),
      ]);
      return { status: 'ok' };
    } catch (error) {
      this.logger.error(
        `Readiness check failed: the database did not answer (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally {
      clearTimeout(timer);
    }
  }
}
