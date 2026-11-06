jest.mock('redis', () => ({ createClient: jest.fn(() => ({
  isReady: true, on: jest.fn(), get: jest.fn(), set: jest.fn()
})) }));
import { redis, taskCache } from '../src/lib/cache';
const client = redis as unknown as { isReady: boolean; get: jest.Mock; set: jest.Mock; on: jest.Mock };
beforeEach(() => { client.isReady = true; client.get.mockReset(); client.set.mockReset(); });
test('cache entries expire after 60 seconds', async () => { await taskCache.set('tasks:test', { data: [] }); expect(client.set).toHaveBeenCalledWith('tasks:test', JSON.stringify({ data: [] }), { EX: 60 }); });
test('cache JSON is parsed', async () => { client.get.mockResolvedValue('{"data":[]}'); expect(await taskCache.get('key')).toEqual({ data: [] }); });
test('corrupt JSON falls back to PostgreSQL', async () => { client.get.mockResolvedValue('{'); expect(await taskCache.get('key')).toBeNull(); });
test('Redis read error falls back', async () => { client.get.mockRejectedValue(new Error('offline')); expect(await taskCache.get('key')).toBeNull(); });
test('offline cache skips reads and writes', async () => { client.isReady = false; expect(await taskCache.version('owner')).toBeNull(); expect(await taskCache.get('key')).toBeNull(); await taskCache.set('key', {}); await taskCache.invalidate('owner'); expect(client.set).not.toHaveBeenCalled(); });
test('version initialization uses NX and keeps different users separate', async () => { client.get.mockResolvedValue('v1'); const result = await taskCache.version('owner'); expect(result).toContain(':v1'); expect(client.set).toHaveBeenCalledWith('tasks:version:owner', expect.any(String), { NX: true }); });
test('mutation replaces the cache version', async () => { await taskCache.invalidate('owner'); expect(client.set).toHaveBeenCalledWith('tasks:version:owner', expect.any(String)); });
test('failed invalidation bypasses previous entries without failing a saved mutation', async () => {
  client.get.mockResolvedValue('v1'); const before = await taskCache.version('owner');
  client.set.mockRejectedValueOnce(new Error('connection dropped'));
  await expect(taskCache.invalidate('owner')).resolves.toBeUndefined();
  expect(await taskCache.version('owner')).not.toBe(before);
});
test('reconnect changes the cache namespace to ignore stale entries', async () => { client.get.mockResolvedValue('v1'); const before = await taskCache.version('owner'); const ready = client.on.mock.calls.find(([event]) => event === 'ready')![1]; ready(); const after = await taskCache.version('owner'); expect(before).not.toBe(after); });
