import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ScheduleModule } from "@nestjs/schedule";
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from "@nestjs/apollo";
import { Request, Response } from "express";
import { PrismaModule } from "./prisma/prisma.module";
import { SearchModule } from "./search/search.module";
import { DateTimeScalar, JSONScalar } from "./graphql/scalars";
import configuration from "./config/configuration";

// Import to register enums
import "./graphql/enums";
import { HealthController } from "./health/health.controller";
import { PrometheusModule } from "@willsoto/nestjs-prometheus";

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
      playground: process.env.NODE_ENV !== "production",
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
        sellerId: req.headers["x-seller-id"] as string,
        token: req.headers.authorization?.replace("Bearer ", "") as string,
      }),
      formatError: (error) => {
        if (process.env.NODE_ENV === "production") {
          delete error.extensions?.exception;
        }
        return error;
      },
    }),

    // Database
    PrismaModule,

    // Feature modules
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [DateTimeScalar, JSONScalar],
})
export class AppModule {}
