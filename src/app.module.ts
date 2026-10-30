import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminActivityInterceptor } from './common/admin-activity.interceptor';
import { CronShutdown } from './common/cron-shutdown';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './common/guards/gql-throttler.guard';
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Request, Response } from 'express';
import { resolveIdentity } from './common/identity';
import { PrismaModule } from './prisma/prisma.module';
import { SearchModule } from './search/search.module';
import { AdminSearchModule } from './adminSearch';
import { JSONScalar } from './graphql/scalars';
import configuration from './config/configuration';

// Import to register enums
import './graphql/enums';
import { HealthController } from './health/health.controller';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    // Metrics
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),

    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Schedule for cron jobs
    ScheduleModule.forRoot(),

    // Rate limiting: 100 requests per minute per visitor (SRCH-2). Search and
    // the tracking mutations are public, so without it they can be flooded,
    // loading Typesense and polluting the analytics.
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // GraphQL Federation
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: 2,
      },
      sortSchema: true,
      playground: process.env.ENVIRONMENT !== 'production',
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
        // Identity from the verified access token, not from the unsigned
        // `x-seller-id` / `x-admin-id` headers. See common/identity.ts.
        ...resolveIdentity(req.headers),
      }),
      formatError: (error) => {
        if (process.env.ENVIRONMENT === 'production') {
          delete error.extensions?.exception;
        }
        return error;
      },
    }),

    // Database
    PrismaModule,

    // Feature modules
    SearchModule,
    AdminSearchModule, // platform-admin CRUD over search config tables
  ],
  controllers: [HealthController],
  providers: [
    JSONScalar,
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    // Every admin mutation leaves an AdminActivityLog row (USR-12).
    { provide: APP_INTERCEPTOR, useClass: AdminActivityInterceptor },
    // A cron run in progress finishes before the database closes on shutdown.
    CronShutdown,
  ],
})
export class AppModule {}
