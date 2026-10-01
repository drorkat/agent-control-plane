import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TOTAL_COUNT_HEADER,
  paginationArgs,
  setTotalCount,
} from './pagination';
import type { Response } from 'express';

describe('paginationArgs', () => {
  it('defaults to the first page', () => {
    expect(paginationArgs()).toEqual({ take: DEFAULT_PAGE_SIZE, skip: 0 });
    expect(paginationArgs({})).toEqual({ take: DEFAULT_PAGE_SIZE, skip: 0 });
  });

  it('honours an explicit limit and offset', () => {
    expect(paginationArgs({ limit: 10, offset: 20 })).toEqual({
      take: 10,
      skip: 20,
    });
  });

  it('clamps limit to the hard max and floors it at 1', () => {
    expect(paginationArgs({ limit: 10_000 }).take).toBe(MAX_PAGE_SIZE);
    expect(paginationArgs({ limit: 0 }).take).toBe(1);
  });

  it('never returns a negative skip', () => {
    expect(paginationArgs({ offset: -5 }).skip).toBe(0);
  });
});

describe('setTotalCount', () => {
  it('sets the X-Total-Count header as a string', () => {
    const setHeader = jest.fn();
    setTotalCount({ setHeader } as unknown as Response, 42);
    expect(setHeader).toHaveBeenCalledWith(TOTAL_COUNT_HEADER, '42');
  });
});
