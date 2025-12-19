import { registerEnumType } from '@nestjs/graphql';

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
