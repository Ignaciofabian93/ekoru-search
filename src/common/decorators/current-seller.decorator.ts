import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

// sellerId / adminId are set on the GraphQL context object (from the
// x-seller-id / x-admin-id headers the gateway forwards), NOT on `req` — read
// them from the context, matching how the search resolver reads ctx directly.
export const CurrentSeller = createParamDecorator(
  (data: unknown, context: ExecutionContext): string | undefined => {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().sellerId;
  },
);

export const CurrentAdmin = createParamDecorator(
  (data: unknown, context: ExecutionContext): string | undefined => {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().adminId;
  },
);
