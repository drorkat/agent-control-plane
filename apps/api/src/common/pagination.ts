import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Response } from 'express';

/** Page size when the client doesn't ask for one. */
export const DEFAULT_PAGE_SIZE = 50;
/** Hard ceiling so a client can never pull an unbounded result set. */
export const MAX_PAGE_SIZE = 200;

/**
 * Optional `?limit` & `?offset` query for list endpoints. With the global
 * ValidationPipe (transform + whitelist) the query strings are coerced to
 * numbers and anything else is stripped. Responses stay plain arrays (the first
 * page by default), so adding this never breaks an existing client.
 */
export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Prisma `{ take, skip }` from a pagination query, clamped to safe bounds. */
export function paginationArgs(query: PaginationQuery = {}): {
  take: number;
  skip: number;
} {
  const take = Math.min(
    Math.max(Math.trunc(query.limit ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE,
  );
  const skip = Math.max(Math.trunc(query.offset ?? 0), 0);
  return { take, skip };
}

/**
 * Response header carrying the total number of rows matching a list query (the
 * whole filtered set, not just the returned page). Clients paginate by reading
 * it alongside their `limit`/`offset`. The response body stays a plain array, so
 * this is purely additive — existing clients ignore the header.
 */
export const TOTAL_COUNT_HEADER = 'X-Total-Count';

/** Stamp {@link TOTAL_COUNT_HEADER} onto a response (coerced to a string). */
export function setTotalCount(res: Response, total: number): void {
  res.setHeader(TOTAL_COUNT_HEADER, String(total));
}
