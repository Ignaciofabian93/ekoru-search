import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculatePrismaParams,
  createPaginatedResponse,
} from '../common/utils';
import {
  SearchConfigListArgs,
  SearchSynonymUpsertRowInput,
  SearchCorrectionUpsertRowInput,
  SearchSuggestionUpsertRowInput,
} from './dto';

type BulkOutcome = { outcome: 'created' | 'updated'; id: number };

type BulkResult = {
  created: number;
  updated: number;
  failed: number;
  createdIds: number[];
  errors: { index: number; id?: number | null; message: string }[];
};

/**
 * Admin Search-config Service — raw reads + bulk writes over the search config
 * tables (SearchSynonym / SearchCorrection / SearchSuggestion) for the platform
 * admin panel. Flat, single-language config tables: reads return every row
 * (inactive included); the same bulk upsert serves the XLSX import and the
 * row-by-row edit form; rows are processed independently so one bad line never
 * aborts the batch.
 */
@Injectable()
export class AdminSearchService {
  private readonly logger = new Logger(AdminSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Synonyms ───────────────────────────────────────────────────────────────

  async getRawSynonyms(args: SearchConfigListArgs & { adminId?: string }) {
    this.requireAdmin(args.adminId);
    const { skip, take } = calculatePrismaParams(args.page, args.pageSize);
    const where: Prisma.SearchSynonymWhereInput = {
      ...(args.id != null && { id: args.id }),
      ...(args.isActive != null && { isActive: args.isActive }),
      ...(args.search?.trim() && {
        term: { contains: args.search.trim(), mode: 'insensitive' },
      }),
    };
    const [count, rows] = await Promise.all([
      this.prisma.searchSynonym.count({ where }),
      this.prisma.searchSynonym.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);
    return createPaginatedResponse(rows, count, args.page, args.pageSize);
  }

  async bulkUpsertSynonyms(
    adminId: string | undefined,
    rows: SearchSynonymUpsertRowInput[],
  ) {
    this.requireAdmin(adminId);
    return this.processRows(rows, async (row) => {
      const data = this.pickDefined({
        term: row.term,
        synonym: row.synonym,
        weight: row.weight,
        isActive: row.isActive,
      });
      if (row.id != null) {
        await this.prisma.searchSynonym.update({ where: { id: row.id }, data });
        return { outcome: 'updated', id: row.id };
      }
      this.requireFields(row, ['term', 'synonym']);
      const created = await this.prisma.searchSynonym.create({
        data: { ...data, term: row.term!, synonym: row.synonym! },
      });
      return { outcome: 'created', id: created.id };
    });
  }

  async deleteSynonym(adminId: string | undefined, id: number) {
    this.requireAdmin(adminId);
    return this.hardDelete(() =>
      this.prisma.searchSynonym.delete({ where: { id } }),
    );
  }

  // ─── Corrections ──────────────────────────────────────────────────────────

  async getRawCorrections(args: SearchConfigListArgs & { adminId?: string }) {
    this.requireAdmin(args.adminId);
    const { skip, take } = calculatePrismaParams(args.page, args.pageSize);
    const where: Prisma.SearchCorrectionWhereInput = {
      ...(args.id != null && { id: args.id }),
      ...(args.isActive != null && { isActive: args.isActive }),
      ...(args.search?.trim() && {
        incorrectTerm: { contains: args.search.trim(), mode: 'insensitive' },
      }),
    };
    const [count, rows] = await Promise.all([
      this.prisma.searchCorrection.count({ where }),
      this.prisma.searchCorrection.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);
    return createPaginatedResponse(rows, count, args.page, args.pageSize);
  }

  async bulkUpsertCorrections(
    adminId: string | undefined,
    rows: SearchCorrectionUpsertRowInput[],
  ) {
    this.requireAdmin(adminId);
    return this.processRows(rows, async (row) => {
      const data = this.pickDefined({
        incorrectTerm: row.incorrectTerm,
        correctTerm: row.correctTerm,
        frequency: row.frequency,
        confidence: row.confidence,
        isActive: row.isActive,
      });
      if (row.id != null) {
        await this.prisma.searchCorrection.update({
          where: { id: row.id },
          data,
        });
        return { outcome: 'updated', id: row.id };
      }
      this.requireFields(row, ['incorrectTerm', 'correctTerm']);
      const created = await this.prisma.searchCorrection.create({
        data: {
          ...data,
          incorrectTerm: row.incorrectTerm!,
          correctTerm: row.correctTerm!,
        },
      });
      return { outcome: 'created', id: created.id };
    });
  }

  async deleteCorrection(adminId: string | undefined, id: number) {
    this.requireAdmin(adminId);
    return this.hardDelete(() =>
      this.prisma.searchCorrection.delete({ where: { id } }),
    );
  }

  // ─── Suggestions ──────────────────────────────────────────────────────────

  async getRawSuggestions(args: SearchConfigListArgs & { adminId?: string }) {
    this.requireAdmin(args.adminId);
    const { skip, take } = calculatePrismaParams(args.page, args.pageSize);
    const where: Prisma.SearchSuggestionWhereInput = {
      ...(args.id != null && { id: args.id }),
      ...(args.isActive != null && { isActive: args.isActive }),
      ...(args.search?.trim() && {
        term: { contains: args.search.trim(), mode: 'insensitive' },
      }),
    };
    const [count, rows] = await Promise.all([
      this.prisma.searchSuggestion.count({ where }),
      this.prisma.searchSuggestion.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);
    return createPaginatedResponse(rows, count, args.page, args.pageSize);
  }

  async bulkUpsertSuggestions(
    adminId: string | undefined,
    rows: SearchSuggestionUpsertRowInput[],
  ) {
    this.requireAdmin(adminId);
    return this.processRows(rows, async (row) => {
      const data = this.pickDefined({
        term: row.term,
        frequency: row.frequency,
        isActive: row.isActive,
      });
      if (row.id != null) {
        await this.prisma.searchSuggestion.update({
          where: { id: row.id },
          data,
        });
        return { outcome: 'updated', id: row.id };
      }
      this.requireFields(row, ['term']);
      const created = await this.prisma.searchSuggestion.create({
        data: { ...data, term: row.term! },
      });
      return { outcome: 'created', id: created.id };
    });
  }

  async deleteSuggestion(adminId: string | undefined, id: number) {
    this.requireAdmin(adminId);
    return this.hardDelete(() =>
      this.prisma.searchSuggestion.delete({ where: { id } }),
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private requireAdmin(adminId?: string): void {
    if (!adminId)
      throw new UnauthorizedException('Admin authentication required');
  }

  private async hardDelete(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (error) {
      throw this.friendlyError(error);
    }
  }

  private requireFields<T extends object>(row: T, fields: (keyof T)[]): void {
    const missing = fields.filter(
      (f) => row[f] == null || row[f] === '',
    ) as string[];
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required field(s) for create: ${missing.join(', ')}`,
      );
    }
  }

  private pickDefined<T extends Record<string, unknown>>(obj: T): T {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as T;
  }

  private async processRows<T extends { id?: number | null }>(
    rows: T[],
    handler: (row: T) => Promise<BulkOutcome>,
  ): Promise<BulkResult> {
    const result: BulkResult = {
      created: 0,
      updated: 0,
      failed: 0,
      createdIds: [],
      errors: [],
    };
    for (const [index, row] of rows.entries()) {
      try {
        const { outcome, id } = await handler(row);
        result[outcome] += 1;
        if (outcome === 'created') result.createdIds.push(id);
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          index,
          id: row.id ?? null,
          message: this.errorMessage(error),
        });
      }
    }
    if (result.failed > 0) {
      this.logger.warn(
        `Bulk upsert finished with ${result.failed} failed row(s)`,
      );
    }
    return result;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const target = Array.isArray(error.meta?.target)
        ? ` (${(error.meta.target as string[]).join(', ')})`
        : '';
      switch (error.code) {
        case 'P2002':
          return `Duplicate value violates a unique constraint${target}`;
        case 'P2003':
          return 'Invalid relation: the referenced id does not exist';
        case 'P2025':
          return 'Row not found';
        default:
          return `Database error ${error.code}`;
      }
    }
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }

  private friendlyError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return new BadRequestException(this.errorMessage(error));
    }
    return error instanceof Error ? error : new Error('Unknown error');
  }
}
