import { registerEnumType } from '@nestjs/graphql';

/**
 * Platform languages (mirrors the root Prisma `Language` enum, which this
 * subgraph's generated client does not expose). Used as the `language` arg on
 * `search` to route to the matching per-locale Typesense collection.
 */
export enum Language {
  ES = 'ES',
  EN = 'EN',
  FR = 'FR',
  PT = 'PT',
  DE = 'DE',
}

export enum ServicePricing {
  FIXED = 'FIXED',
  QUOTATION = 'QUOTATION',
  HOURLY = 'HOURLY',
  PACKAGE = 'PACKAGE',
}

export enum QuotationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum ServiceSortField {
  CREATED_AT = 'CREATED_AT',
  NAME = 'NAME',
  BASE_PRICE = 'BASE_PRICE',
}

// Register enums with GraphQL
registerEnumType(Language, {
  name: 'Language',
  description: 'Supported platform languages',
});

registerEnumType(ServicePricing, {
  name: 'ServicePricing',
  description: 'Service pricing types',
});

registerEnumType(QuotationStatus, {
  name: 'QuotationStatus',
  description: 'Quotation status types',
});

registerEnumType(SortOrder, {
  name: 'SortOrder',
  description: 'Sort order direction',
});

registerEnumType(ServiceSortField, {
  name: 'ServiceSortField',
  description: 'Service sort field options',
});
