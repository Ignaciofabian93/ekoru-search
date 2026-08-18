import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ScheduleModule } from '@nestjs/schedule';
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
  providers: [JSONScalar],
})
export class AppModule {}
