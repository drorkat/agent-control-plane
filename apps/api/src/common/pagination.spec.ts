import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationArgs,
} from './pagination';

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
