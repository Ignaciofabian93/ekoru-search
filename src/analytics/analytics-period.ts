import { registerEnumType } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';

/** The periods the panel offers. Each one is compared with the one before it. */
export enum AnalyticsRange {
  LAST_7_DAYS = 'LAST_7_DAYS',
  LAST_30_DAYS = 'LAST_30_DAYS',
  LAST_90_DAYS = 'LAST_90_DAYS',
  LAST_12_MONTHS = 'LAST_12_MONTHS',
}

registerEnumType(AnalyticsRange, {
  name: 'AnalyticsRange',
  description:
    'Period of an analytics report: the last 7 or 30 days (by day), 90 days (by week) or 12 months (by month), up to now',
});

export enum AnalyticsBucket {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

registerEnumType(AnalyticsBucket, {
  name: 'AnalyticsBucket',
  description: 'Size of each point in an analytics series',
});

type Unit = 'day' | 'week' | 'month';

export const RANGES: Record<
  AnalyticsRange,
  { bucket: AnalyticsBucket; unit: Unit; buckets: number }
> = {
  [AnalyticsRange.LAST_7_DAYS]: {
    bucket: AnalyticsBucket.DAY,
    unit: 'day',
    buckets: 7,
  },
  [AnalyticsRange.LAST_30_DAYS]: {
    bucket: AnalyticsBucket.DAY,
    unit: 'day',
    buckets: 30,
  },
  [AnalyticsRange.LAST_90_DAYS]: {
    bucket: AnalyticsBucket.WEEK,
    unit: 'week',
    buckets: 13,
  },
  [AnalyticsRange.LAST_12_MONTHS]: {
    bucket: AnalyticsBucket.MONTH,
    unit: 'month',
    buckets: 12,
  },
};

/**
 * Days, weeks and months follow Chile's calendar, EKORU's home market, so a
 * sale at 22:00 in Santiago lands on that day and not on the next UTC one.
 */
const TZ = Prisma.raw(`'America/Santiago'`);

/**
 * The SQL that sets up a report's windows, as CTEs to open a `WITH`:
 *
 * - `p`: the period. `local_from` is the start of its first bucket on Chile's
 *   calendar; `from_utc`/`to_utc` bound it (to now) in UTC, like the stored
 *   timestamps, which Prisma keeps as UTC without a zone.
 * - `w`: two rows, `current` and `previous`, the previous one of the same
 *   length just before, for the comparison figures.
 * - `b`: one row per bucket of the series, with its UTC bounds.
 *
 * Everything is worked out inside SQL from now(), so the session time zone
 * never matters. `unit` and the counts come from RANGES, never from a caller.
 */
export function windowsSql(range: AnalyticsRange): Prisma.Sql {
  const { unit, buckets } = RANGES[range];
  const u = Prisma.raw(`'${unit}'`);
  const back = Prisma.raw(`interval '${buckets - 1} ${unit}'`);
  const step = Prisma.raw(`interval '1 ${unit}'`);
  return Prisma.sql`
    p AS (
      SELECT x.local_from,
             x.local_now,
             (x.local_from AT TIME ZONE ${TZ}) AT TIME ZONE 'UTC' AS from_utc,
             now() AT TIME ZONE 'UTC' AS to_utc
      FROM (
        SELECT date_trunc(${u}, now() AT TIME ZONE ${TZ}) - ${back} AS local_from,
               now() AT TIME ZONE ${TZ} AS local_now
      ) x
    ),
    w AS (
      SELECT 'current' AS w, from_utc AS f, to_utc AS t FROM p
      UNION ALL
      SELECT 'previous', from_utc - (to_utc - from_utc), from_utc FROM p
    ),
    b AS (
      SELECT to_char(s.bucket, 'YYYY-MM-DD') AS bucket,
             (s.bucket AT TIME ZONE ${TZ}) AT TIME ZONE 'UTC' AS f,
             ((s.bucket + ${step}) AT TIME ZONE ${TZ}) AT TIME ZONE 'UTC' AS t
      FROM p,
           generate_series(p.local_from, date_trunc(${u}, p.local_now), ${step}) AS s(bucket)
    )`;
}

/** The period's bounds, as ISO strings for the report header. */
export function periodSql(range: AnalyticsRange): Prisma.Sql {
  return Prisma.sql`
    WITH ${windowsSql(range)}
    SELECT to_char(w.f, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS f,
           to_char(w.t, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS t,
           w.w
    FROM w`;
}
