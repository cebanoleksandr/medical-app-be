import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { extname } from 'path';
import { extractText } from 'unpdf';
import { assertSafeZip } from '../common/zip-guard';
import { MAX_TEXT_LENGTH } from './dto/create-analysis.dto';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIN_TEXT_LENGTH = 50;

type FileKind = 'pdf' | 'docx' | 'txt';

const KINDS: Record<string, FileKind> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.txt': 'txt',
};

/** Pulls plain text out of an upload, in memory only; the file is never saved. */
@Injectable()
export class TextExtractionService {
  async extract(file: Express.Multer.File): Promise<string> {
    const kind = KINDS[extname(file.originalname).toLowerCase()];
    if (!kind) {
      throw new UnprocessableEntityException(
        'Supported formats: .pdf, .docx, .txt',
      );
    }
    if (!hasExpectedSignature(kind, file.buffer)) {
      throw new UnprocessableEntityException(
        `File content is not a valid .${kind}`,
      );
    }

    let text: string;
    try {
      text = await this.read(kind, file.buffer);
    } catch (err) {
      if (err instanceof UnprocessableEntityException) throw err;
      throw new UnprocessableEntityException(
        'Could not read the file. It may be damaged or password-protected.',
      );
    }

    text = normalizeWhitespace(text);
    if (text.length < MIN_TEXT_LENGTH) {
      throw new UnprocessableEntityException(
        'No text found in the file. Scanned documents are not supported yet.',
      );
    }
    if (text.length > MAX_TEXT_LENGTH) {
      throw new UnprocessableEntityException(
        `The document has ${text.length} characters; the limit is ${MAX_TEXT_LENGTH}.`,
      );
    }
    return text;
  }

  private async read(kind: FileKind, buffer: Buffer): Promise<string> {
    switch (kind) {
      case 'pdf': {
        const { text } = await extractText(new Uint8Array(buffer), {
          mergePages: true,
        });
        return text;
      }
      case 'docx': {
        await assertSafeZip(buffer);
        const { value } = await mammoth.extractRawText({ buffer });
        return value;
      }
      case 'txt':
        try {
          return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch {
          throw new UnprocessableEntityException('Text files must be UTF-8');
        }
    }
  }
}

function hasExpectedSignature(kind: FileKind, buffer: Buffer): boolean {
  switch (kind) {
    case 'pdf':
      return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'docx':
      return buffer
        .subarray(0, 4)
        .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    case 'txt':
      return !buffer.includes(0);
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
