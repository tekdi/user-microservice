import { BadRequestException } from '@nestjs/common';
import { UserElasticsearchService } from './user-elasticsearch.service';

// The real wrapper pulls in @elastic/elasticsearch (undici), which the jest
// environment cannot load; these tests use a hand-rolled mock instead.
jest.mock('./elasticsearch.service', () => ({
  ElasticsearchService: class {},
}));

const hit = (userId: string, sort: any[]) => ({
  _id: userId,
  _source: {
    userId,
    applications: [{ cohortId: 'c1' }, { cohortId: 'other' }],
  },
  sort,
});

describe('UserElasticsearchService.searchUsers', () => {
  let es: any;
  let service: UserElasticsearchService;

  beforeEach(() => {
    es = {
      search: jest.fn(),
      openPointInTime: jest.fn().mockResolvedValue('pit-1'),
      closePointInTime: jest.fn().mockResolvedValue(undefined),
    };
    service = new UserElasticsearchService(es, {} as any);
  });

  it('keeps offset paging unchanged when no cursor mode is requested', async () => {
    es.search.mockResolvedValue({
      hits: [hit('u1', [1, 'u1'])],
      total: { value: 1 },
    });

    const res: any = await service.searchUsers({
      filters: { cohortId: 'c1' },
      limit: 10,
      offset: 20,
    });

    const options = es.search.mock.calls[0][2];
    expect(options).toMatchObject({
      size: 10,
      from: 20,
      sort: [{ updatedAt: 'desc' }],
    });
    expect(options.pit).toBeUndefined();
    expect(es.openPointInTime).not.toHaveBeenCalled();
    expect(res.result.totalCount).toBe(1);
    expect('nextCursor' in res.result).toBe(false);
    expect(res.result.data[0]._source.applications).toEqual([
      { cohortId: 'c1' },
    ]);
  });

  it('pages through a PIT with search_after and closes it on the last page', async () => {
    es.search
      .mockResolvedValueOnce({
        hits: [hit('u1', [3, 'u1']), hit('u2', [2, 'u2'])],
        total: { value: 3 },
        lastSort: [2, 'u2'],
        pitId: 'pit-2',
      })
      .mockResolvedValueOnce({
        hits: [hit('u3', [1, 'u3'])],
        total: { value: 0 },
        lastSort: [1, 'u3'],
        pitId: 'pit-2',
      });

    const first: any = await service.searchUsers({
      filters: { cohortId: 'c1' },
      limit: 2,
      offset: 0,
      paginate: 'cursor',
    });

    const firstOptions = es.search.mock.calls[0][2];
    expect(es.openPointInTime).toHaveBeenCalledWith('users', '5m');
    expect(firstOptions).toMatchObject({
      size: 2,
      pit: { id: 'pit-1', keep_alive: '5m' },
      track_total_hits: true,
      sort: [{ updatedAt: 'desc' }, { userId: 'asc' }],
    });
    expect(firstOptions.from).toBeUndefined();
    expect(firstOptions.search_after).toBeUndefined();
    expect(first.result.totalCount).toBe(3);
    expect(typeof first.result.nextCursor).toBe('string');

    const last: any = await service.searchUsers({
      filters: { cohortId: 'c1' },
      limit: 2,
      cursor: first.result.nextCursor,
    });

    const nextOptions = es.search.mock.calls[1][2];
    expect(es.openPointInTime).toHaveBeenCalledTimes(1);
    expect(nextOptions).toMatchObject({
      pit: { id: 'pit-2' },
      search_after: [2, 'u2'],
      track_total_hits: false,
    });
    // Total comes from the cursor, not the follow-up page.
    expect(last.result.totalCount).toBe(3);
    expect(last.result.nextCursor).toBeNull();
    expect(es.closePointInTime).toHaveBeenCalledWith('pit-2');
  });

  it('ends without an extra round-trip when the total is an exact multiple of limit', async () => {
    es.search.mockResolvedValueOnce({
      hits: [hit('u1', [2, 'u1']), hit('u2', [1, 'u2'])],
      total: { value: 2 },
      lastSort: [1, 'u2'],
    });

    const res: any = await service.searchUsers({
      filters: { cohortId: 'c1' },
      limit: 2,
      paginate: 'cursor',
    });

    expect(res.result.nextCursor).toBeNull();
    expect(es.closePointInTime).toHaveBeenCalledWith('pit-1');
  });

  it('rejects a malformed cursor with a 400', async () => {
    await expect(
      service.searchUsers({ filters: {}, limit: 2, cursor: 'not-a-cursor' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(es.search).not.toHaveBeenCalled();
  });

  it('closes a PIT it opened when the first page fails', async () => {
    es.search.mockRejectedValueOnce(new Error('boom'));

    await expect(
      service.searchUsers({ filters: {}, limit: 2, paginate: 'cursor' })
    ).rejects.toThrow('Failed to search users in Elasticsearch: boom');
    expect(es.closePointInTime).toHaveBeenCalledWith('pit-1');
  });

  it('keeps a caller-supplied PIT open when a later page fails, so it can be retried', async () => {
    const cursor = Buffer.from(
      JSON.stringify({ p: 'pit-9', s: [5, 'u5'], t: 10, n: 2 })
    ).toString('base64url');
    es.search.mockRejectedValueOnce(new Error('boom'));

    await expect(
      service.searchUsers({ filters: {}, limit: 2, cursor })
    ).rejects.toThrow('boom');
    expect(es.closePointInTime).not.toHaveBeenCalled();
  });
});
