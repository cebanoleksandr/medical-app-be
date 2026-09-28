import { Writable } from 'stream';
import { Framework } from '../../deidentify/catalog/frameworks';
import { DatasetDefinition, generateRecords } from '../datasets';
import { Language } from '../reference/localized';
import { OutputFormat, writeDataset } from './writers';

const SAMPLE_SIZE = 200;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, Promise<{ perRecord: number; fixed: number }>>();

class ByteCounter extends Writable {
  bytes = 0;
  _write(chunk: Buffer, _: BufferEncoding, done: () => void) {
    this.bytes += chunk.length;
    done();
  }
}

async function measure(
  dataset: DatasetDefinition,
  format: OutputFormat,
  language: Language,
  count: number,
): Promise<number> {
  const counter = new ByteCounter();
  const params = {
    framework: Framework.HIPAA,
    language,
    seed: 1,
    referenceDate: new Date(),
  };
  await writeDataset(
    format,
    dataset.columns,
    generateRecords(dataset, params, count),
    counter,
  );
  return counter.bytes;
}

/**
 * Output size from a real 200-record sample; header/zip overhead is measured
 * separately so small and large datasets are both estimated well.
 * `cacheKey` identifies the dataset shape (built-in type or source id).
 */
export async function estimateBytes(
  dataset: DatasetDefinition,
  cacheKey: string,
  format: OutputFormat,
  language: Language,
  records: number,
): Promise<number> {
  const key = `${cacheKey}|${format}|${language}`;
  if (!cache.has(key)) {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    cache.set(
      key,
      (async () => {
        const fixed = await measure(dataset, format, language, 0);
        const sample = await measure(dataset, format, language, SAMPLE_SIZE);
        return { fixed, perRecord: (sample - fixed) / SAMPLE_SIZE };
      })(),
    );
  }
  const { fixed, perRecord } = await cache.get(key);
  return Math.round(fixed + perRecord * records);
}
