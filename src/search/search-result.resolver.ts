import { Resolver, ResolveField, Parent } from '@nestjs/graphql';
import {
  SearchResultItem,
  SearchResultType,
} from './entities/search-result.entity';
import {
  ProductRef,
  ServiceRef,
  StoreProductRef,
  SellerRef,
} from './entities/catalog-refs.entity';

/**
 * Attaches federation references to every search hit, so clients can follow a
 * result into the subgraph that owns it and select whatever that subgraph
 * exposes (environmental impact, exchangeability, stock, seller profile, …).
 *
 * Exactly one of `product` / `storeProduct` / `service` is non-null, picked by
 * the hit's `type`; the other two resolve to null so a query can request all
 * three and let the discriminator decide. Nothing is fetched here — these are
 * just keys, and the gateway does the entity lookup only for the fields the
 * client actually selected.
 */
@Resolver(() => SearchResultItem)
export class SearchResultResolver {
  @ResolveField(() => ProductRef, {
    nullable: true,
    description:
      'The marketplace product this hit refers to. Null unless type is PRODUCT.',
  })
  product(@Parent() item: SearchResultItem): ProductRef | null {
    return item.type === SearchResultType.PRODUCT ? { id: item.id } : null;
  }

  @ResolveField(() => StoreProductRef, {
    nullable: true,
    description:
      'The store product this hit refers to. Null unless type is STORE_PRODUCT.',
  })
  storeProduct(@Parent() item: SearchResultItem): StoreProductRef | null {
    return item.type === SearchResultType.STORE_PRODUCT
      ? { id: item.id }
      : null;
  }

  @ResolveField(() => ServiceRef, {
    nullable: true,
    description: 'The service this hit refers to. Null unless type is SERVICE.',
  })
  service(@Parent() item: SearchResultItem): ServiceRef | null {
    return item.type === SearchResultType.SERVICE ? { id: item.id } : null;
  }

  @ResolveField(() => SellerRef, {
    nullable: true,
    description:
      'The seller who listed this item, for consumers that need the profile ' +
      'without going through the item entity.',
  })
  seller(@Parent() item: SearchResultItem): SellerRef | null {
    return item.sellerId ? { id: item.sellerId } : null;
  }
}
