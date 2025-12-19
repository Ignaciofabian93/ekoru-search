import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Request, Response } from 'express';
import { PrismaModule } from './prisma/prisma.module';
import { CatalogModule } from './catalog/catalog.module';
import { ServicesModule } from './services/services.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { DateTimeScalar, JSONScalar } from './graphql/scalars';
import configuration from './config/configuration';

// Import to register enums
import './graphql/enums';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // GraphQL Federation
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: 2,
      },
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
        sellerId: req.headers['x-seller-id'] as string,
        token: req.headers.authorization?.replace('Bearer ', '') as string,
      }),
      formatError: (error) => {
        if (process.env.NODE_ENV === 'production') {
          delete error.extensions?.exception;
        }
        return error;
      },
    }),

    // Database
    PrismaModule,

    // Feature modules
    CatalogModule,
    ServicesModule,
    QuotationsModule,
    ReviewsModule,
  ],
  controllers: [HealthController],
  providers: [DateTimeScalar, JSONScalar],
})
export class AppModule {}
