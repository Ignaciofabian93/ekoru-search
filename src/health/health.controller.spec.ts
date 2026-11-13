import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { SearchEngine } from '../search/engine/search-engine.interface';

describe('HealthController (INF-24)', () => {
  const queryRaw = jest.fn();
  const engine = { health: jest.fn() };
  const controller = new HealthController(
    engine as unknown as SearchEngine,
    { $queryRaw: queryRaw } as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    queryRaw.mockReset();
    engine.health.mockReset();
  });

  it('answers ok to the liveness check and says how Typesense is, without the database', async () => {
    engine.health.mockResolvedValue(false);

    await expect(controller.healthCheck()).resolves.toEqual({
      status: 'ok',
      typesense: 'unavailable',
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('is ready when the database answers', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
  });

  it('answers 503 when the database refuses', async () => {
    queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('answers 503 when the database takes over 2 seconds', async () => {
    jest.useFakeTimers();
    queryRaw.mockReturnValue(new Promise(() => undefined)); // never answers

    const answer = controller.ready();
    const refused = expect(answer).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await jest.advanceTimersByTimeAsync(2_000);

    await refused;
  });
});
