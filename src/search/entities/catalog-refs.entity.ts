import { ObjectType, Field, Int, ID, Directive } from '@nestjs/graphql';

/**
 * Federation stubs for the three catalog entities a search hit can point at.
 *
 * The search index is a flat, denormalised projection — it deliberately carries
 * only what ranking and the result card need. Everything else a consumer might
 * want (isExchangeable, condition and badges on marketplace products; stock,
 * warranty and materials on store products; pricing type and availability on
 * services; environmental impact and the full seller profile on all three)
 * lives in the owning subgraph.
 *
 * Rather than duplicating those fields into Typesense — which would mean a
 * schema migration plus a full reindex every time one of them changes — each
 * hit exposes a typed reference to its source entity. The gateway resolves it
 * against ekoru-marketplace / ekoru-stores / ekoru-services, so clients can ask
 * for any field those subgraphs expose and always get live values.
 *
 * `resolvable: false` marks these as references only: this subgraph never
 * answers `_entities` for them, it just hands the gateway a key.
 */

@ObjectType('Product')
@Directive('@key(fields: "id", resolvable: false)')
export class ProductRef {
  @Field(() => Int, { description: 'Marketplace product identifier' })
  id: number;
}

@ObjectType('StoreProduct')
@Directive('@key(fields: "id", resolvable: false)')
export class StoreProductRef {
  @Field(() => Int, { description: 'Store product identifier' })
  id: number;
}

@ObjectType('Service')
@Directive('@key(fields: "id", resolvable: false)')
export class ServiceRef {
  // ekoru-services types Service.id as ID, so the key field must match for the
  // supergraph to compose.
  @Field(() => ID, { description: 'Service identifier' })
  id: number;
}

@ObjectType('Seller')
@Directive('@key(fields: "id", resolvable: false)')
export class SellerRef {
  @Field(() => ID, { description: 'Seller unique identifier' })
  id: string;
}
