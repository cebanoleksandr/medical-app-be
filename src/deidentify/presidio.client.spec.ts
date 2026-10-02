import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PresidioClient } from './presidio.client';

const config = {
  get: (key: string) =>
    ({ PRESIDIO_URL: 'http://presidio', PRESIDIO_TIMEOUT_MS: 10_000 })[key],
  getOrThrow: () => 'key',
} as unknown as ConfigService;

const request = {
  text: 'x',
  language: 'en' as const,
  entities: [],
  scoreThreshold: 0.5,
};
const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

describe('PresidioClient.analyze', () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  let client: PresidioClient;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new PresidioClient(config);
  });

  afterEach(() => jest.useRealTimers());

  it('waits through 502s while the instance wakes up', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(502))
      .mockResolvedValueOnce(reply(502))
      .mockResolvedValueOnce(reply(200, { entities: [{ start: 0, end: 1 }] }));
    const result = client.analyze(request);
    await jest.advanceTimersByTimeAsync(6_000);
    await expect(result).resolves.toEqual([{ start: 0, end: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up with 503 when the timeout runs out', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(502)));
    const result = client.analyze(request);
    const assertion = expect(result).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('does not retry other errors', async () => {
    fetchMock.mockResolvedValue(reply(401));
    await expect(client.analyze(request)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
