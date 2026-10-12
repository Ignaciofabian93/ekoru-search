import { Prisma } from '@prisma/client';

/**
 * Whose items may be found (SRCH-1).
 *
 * A seller's items are searchable only while the account is active (a ban or
 * a deactivation sets `Seller.isActive` false) and, for a business, EKORU has
 * approved it. A pending or rejected business cannot even sign in, so nothing
 * of theirs should be found either.
 *
 * Marketplace products also come from people, who have no BusinessProfile, so
 * for them "no business profile" is fine. Store products and services are
 * business-only, matching what ekoru-stores and ekoru-services show (STO-2).
 *
 * Written as correlated subqueries on the item's seller column, so each query
 * keeps its own joins. Seller and BusinessProfile belong to ekoru-users and are
 * read in place, as the rest of this subgraph does.
 */
export function sellerVisible(
  sellerIdColumn: Prisma.Sql,
  { businessOnly }: { businessOnly: boolean },
): Prisma.Sql {
  const business = businessOnly
    ? Prisma.sql`vis_bp."approvalStatus"::text = 'APPROVED'`
    : Prisma.sql`(vis_bp."sellerId" IS NULL OR vis_bp."approvalStatus"::text = 'APPROVED')`;
  return Prisma.sql`EXISTS (
    SELECT 1
      FROM "Seller" vis_s
      LEFT JOIN "BusinessProfile" vis_bp ON vis_bp."sellerId" = vis_s."id"
     WHERE vis_s."id" = ${sellerIdColumn}
       AND vis_s."isActive" = true
       AND ${business}
  )`;
}

/**
 * The seller's account or business profile changed since `since`: a ban, an
 * unban, an approval. The incremental sync re-reads such sellers' items so a
 * reinstated seller's catalog comes back without waiting for a full reindex.
 */
export function sellerChangedSince(
  sellerIdColumn: Prisma.Sql,
  since: Date,
): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1
      FROM "Seller" chg_s
      LEFT JOIN "BusinessProfile" chg_bp ON chg_bp."sellerId" = chg_s."id"
     WHERE chg_s."id" = ${sellerIdColumn}
       AND (chg_s."updatedAt" >= ${since} OR chg_bp."updatedAt" >= ${since})
  )`;
}
