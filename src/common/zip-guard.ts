import { UnprocessableEntityException } from '@nestjs/common';
import * as JSZip from 'jszip';

/** Default leaves headroom on a 512 MB free-tier instance. */
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

/**
 * Rejects zip containers (.docx, .xlsx) whose declared uncompressed size is too
 * large, before anything is inflated: a 5 MB upload can expand to gigabytes.
 */
export async function assertSafeZip(
  buffer: Buffer,
  maxBytes = MAX_UNCOMPRESSED_BYTES,
): Promise<void> {
  const zip = await JSZip.loadAsync(buffer);
  let total = 0;
  zip.forEach((_, entry) => {
    // Declared size from the zip directory; JSZip keeps it on a private field.
    total +=
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0;
  });
  if (total > maxBytes) {
    throw new UnprocessableEntityException('The document is too large');
  }
}
