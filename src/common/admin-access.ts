import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenError, UnauthorizedError } from './exceptions';

/** The admin permissions this subgraph checks (subset of the AdminPermission enum). */
export type AdminPermissionName = 'MANAGE_SETTINGS';

interface AdminRow {
  adminType: string;
  role: string;
  permissions: string[];
  isActive: boolean;
}

/**
 * Ensures the caller is an active PLATFORM admin who is SUPER_ADMIN or holds
 * `permission` — the same rule ekoru-users applies (SEC-8). Returns the admin id.
 *
 * A token only proves *who* the admin is. Before this check, any admin token,
 * including a BUSINESS admin's, could rewrite synonyms, corrections and
 * suggestions, or rebuild the whole index. The Admin table belongs to
 * ekoru-users, so it is read with raw SQL (the cross-subgraph convention);
 * reading it per request means a deactivated admin or a revoked permission
 * takes effect at once. Refusal is FORBIDDEN, not UNAUTHORIZED, so the panel
 * keeps the session.
 */
export async function assertAdminCan(
  prisma: PrismaService,
  adminId: string | undefined,
  permission: AdminPermissionName,
): Promise<string> {
  if (!adminId) throw new UnauthorizedError('Admin authentication required');

  const rows = await prisma.$queryRaw<AdminRow[]>`
    SELECT "adminType"::text     AS "adminType",
           "role"::text          AS "role",
           "permissions"::text[] AS "permissions",
           "isActive"
    FROM "Admin"
    WHERE "id" = ${adminId}
    LIMIT 1`;
  const admin = rows[0];

  const allowed =
    !!admin &&
    admin.isActive &&
    admin.adminType === 'PLATFORM' &&
    (admin.role === 'SUPER_ADMIN' ||
      (admin.permissions ?? []).includes(permission));
  if (!allowed) {
    throw new ForbiddenError(
      `This action requires the ${permission} permission`,
    );
  }
  return adminId;
}
