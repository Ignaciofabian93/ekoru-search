import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

/**
 * Lets a cron run in progress finish on `docker stop`.
 *
 * The scheduler stops its jobs on shutdown without waiting for a run in
 * progress. This stops them first, in the earliest shutdown phase, and waits:
 * every @Cron in this service sets `waitForCompletion`, so `stop()` resolves
 * once the run ends. The database closes later, in onApplicationShutdown.
 */
@Injectable()
export class CronShutdown implements OnModuleDestroy {
  constructor(private readonly scheduler: SchedulerRegistry) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.scheduler.getCronJobs().values()].map(
        (job) => job.stop() ?? Promise.resolve(),
      ),
    );
  }
}
