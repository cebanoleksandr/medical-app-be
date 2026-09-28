import { Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import * as ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { PresidioClient } from '../../deidentify/presidio.client';
import {
  DatasetDefinition,
  generateRecord,
  SourceDatasetType,
} from '../datasets';
import { SyntheticDataset } from '../entities/synthetic-dataset.entity';
import { OutputFormat, writeDataset } from '../export/writers';
import { SyntheticRecord } from '../generator';
import {
  DIRECT_IDENTIFIER_TYPES,
  SourcesService,
} from '../sources/sources.service';
import { SyntheticService } from '../synthetic.service';

const SCAN_SAMPLE = 100;
const CONSISTENCY_SAMPLE = 1000;
const EXPORT_SAMPLE = 50;
const SCAN_CHUNK = 40_000;
const MAX_CACHED_REPORTS = 200;
const DAY_MS = 86_400_000;

type Level3 = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ValidationCheck {
  id:
    | 'dates_transformed'
    | 'free_text_checked'
    | 'export_format_validated'
    | 'synthetic_identifiers_generated'
    | 'direct_identifiers_removed';
  label: string;
  passed: boolean;
  detail: string;
}

export interface IdentifierFinding {
  recordId: string | null;
  field: string;
  entityType: string;
}

/** Evenly spread record indices, so a sample covers the whole dataset. */
function sampleIndices(total: number, size: number): number[] {
  const n = Math.min(total, size);
  return Array.from({ length: n }, (_, k) => Math.floor((k * total) / n));
}

const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

@Injectable()
export class ValidationService {
  // Records are deterministic, so a report never changes for a dataset.
  private readonly reports = new Map<string, unknown>();

  constructor(
    private readonly synthetic: SyntheticService,
    private readonly sources: SourcesService,
    private readonly presidio: PresidioClient,
  ) {}

  async validate(userId: string, datasetId: string) {
    const dataset = await this.synthetic.findActive(userId, datasetId);
    const cached = this.reports.get(dataset.id);
    if (cached) return cached;

    const definition = await this.synthetic.definitionOf(dataset);
    const params = this.synthetic.params(dataset);
    const records = (indices: number[]) =>
      indices.map((i) => generateRecord(definition, params, i));

    const consistencySample = records(
      sampleIndices(dataset.recordCount, CONSISTENCY_SAMPLE),
    );
    const scanSample = records(sampleIndices(dataset.recordCount, SCAN_SAMPLE));

    const consistentShare =
      consistencySample.filter((r) => definition.checkRecord(r).length === 0)
        .length / consistencySample.length;
    const sourceSummary = dataset.sourceId
      ? ((await this.sources.get(userId, dataset.sourceId)).summary as Record<
          string,
          any
        >)
      : null;
    const fidelity = sourceSummary?.columns
      ? this.fidelity(definition, consistencySample)
      : null;
    const lowConfidenceFields = this.lowConfidenceFields(
      dataset,
      sourceSummary,
    );
    const findings = await this.scan(definition, dataset.language, scanSample);

    const checks: ValidationCheck[] = [
      this.checkDates(definition, dataset, scanSample),
      this.checkFreeText(definition, findings),
      await this.checkExport(
        definition,
        dataset.format,
        scanSample.slice(0, EXPORT_SAMPLE),
      ),
      this.checkSyntheticIds(definition, dataset, scanSample),
      {
        id: 'direct_identifiers_removed',
        label: 'Direct identifiers removed',
        passed: findings.length === 0,
        detail: findings.length
          ? `${findings.length} possible identifiers found in the sample`
          : `No direct identifiers in ${scanSample.length} sampled records`,
      },
    ];

    const { riskLevel, riskFactors } = this.risk(
      dataset,
      sourceSummary,
      findings,
    );
    const consistency: Level3 =
      consistentShare >= 0.98
        ? 'HIGH'
        : consistentShare >= 0.9
          ? 'MEDIUM'
          : 'LOW';
    const report = {
      datasetId: dataset.id,
      compliance: {
        framework: dataset.framework,
        riskLevel,
        riskFactors,
        directIdentifiers: findings.length ? 'DETECTED' : 'NOT_DETECTED',
      },
      quality: {
        quality: qualityLevel(consistentShare, fidelity),
        consistency,
        consistencyRate: round(consistentShare),
        fidelity: fidelity === null ? null : round(fidelity),
        warnings: lowConfidenceFields.length,
      },
      lowConfidenceFields,
      checks,
      findings,
      sampleSize: {
        consistency: consistencySample.length,
        scan: scanSample.length,
      },
    };

    if (this.reports.size >= MAX_CACHED_REPORTS) this.reports.clear();
    this.reports.set(dataset.id, report);
    return report;
  }

  /** Presidio over the text that could carry real data. */
  private async scan(
    definition: DatasetDefinition,
    language: SyntheticDataset['language'],
    sample: SyntheticRecord[],
  ): Promise<IdentifierFinding[]> {
    // Document datasets fill slots with realistic fakes by design; only the
    // template's fixed text comes from the real document.
    const pieces: { text: string; recordId: string | null; field: string }[] =
      definition.staticText !== undefined
        ? [
            {
              text: definition.staticText,
              recordId: null,
              field: 'document_text',
            },
          ]
        : sample.flatMap((record) =>
            definition.columns
              .filter(
                (c) => !c.role && (c.type === 'string' || c.type === 'text'),
              )
              .map((c) => ({
                text: asText(record[c.key]),
                recordId: asText(record[definition.columns[0].key]),
                field: c.key,
              }))
              .filter((p) => p.text),
          );

    const findings: IdentifierFinding[] = [];
    let batch: typeof pieces = [];
    let length = 0;
    const flush = async () => {
      if (!batch.length) return;
      const offsets: number[] = [];
      let text = '';
      for (const p of batch) {
        offsets.push(text.length);
        text += p.text + '\n\n';
      }
      const entities = await this.presidio.analyze({
        text,
        language,
        entities: DIRECT_IDENTIFIER_TYPES,
        scoreThreshold: 0.6,
      });
      for (const e of entities) {
        let i = offsets.length - 1;
        while (offsets[i] > e.start) i--;
        const { recordId, field } = batch[i];
        findings.push({ recordId, field, entityType: e.type });
      }
      batch = [];
      length = 0;
    };
    for (const piece of pieces) {
      if (length + piece.text.length > SCAN_CHUNK) await flush();
      batch.push(piece);
      length += piece.text.length + 2;
    }
    await flush();
    return findings;
  }

  private checkDates(
    definition: DatasetDefinition,
    dataset: SyntheticDataset,
    sample: SyntheticRecord[],
  ): ValidationCheck {
    const base = {
      id: 'dates_transformed' as const,
      label: 'Dates transformed',
    };
    if (dataset.datasetType === SourceDatasetType.FROM_DOCUMENT) {
      return {
        ...base,
        passed: true,
        detail: 'Dates in the document are replaced with synthetic dates',
      };
    }
    const dateColumns = definition.columns.filter((c) => c.type === 'date');
    if (!dateColumns.length)
      return { ...base, passed: true, detail: 'No date fields' };

    const builtIn = !dataset.sourceId;
    const latest = dataset.referenceDate.getTime();
    const bad = sample.flatMap((r) =>
      dateColumns.filter((c) => {
        if (r[c.key] === null) return false;
        const t = Date.parse(String(r[c.key]));
        // Built-in dates fall in the year before generation; sourced ones
        // only need to be valid (their range was checked per record).
        return (
          Number.isNaN(t) ||
          (builtIn && (t > latest || t < latest - 366 * DAY_MS))
        );
      }),
    );
    return {
      ...base,
      passed: bad.length === 0,
      detail: bad.length
        ? `${bad.length} date values are invalid or out of range`
        : builtIn
          ? `${dateColumns.length} date fields generated within the last 12 months`
          : `${dateColumns.length} date fields resampled from the source's distribution`,
    };
  }

  private checkFreeText(
    definition: DatasetDefinition,
    findings: IdentifierFinding[],
  ): ValidationCheck {
    const textColumns = definition.columns
      .filter((c) => c.type === 'text')
      .map((c) => c.key);
    const base = {
      id: 'free_text_checked' as const,
      label: 'Free-text fields checked',
    };
    if (!textColumns.length)
      return { ...base, passed: true, detail: 'No free-text fields' };
    const hits = findings.filter((f) => textColumns.includes(f.field)).length;
    return {
      ...base,
      passed: hits === 0,
      detail: hits
        ? `${hits} possible identifiers in free text`
        : `${textColumns.length} free-text fields scanned for identifiers`,
    };
  }

  /** Serializes a sample in the dataset's format and parses it back. */
  private async checkExport(
    definition: DatasetDefinition,
    format: OutputFormat,
    sample: SyntheticRecord[],
  ): Promise<ValidationCheck> {
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c) => chunks.push(Buffer.from(c)));
    async function* iterate() {
      yield* sample;
    }
    await writeDataset(format, definition.columns, iterate(), out);
    out.end();
    const file = Buffer.concat(chunks);

    let parsed: string[][];
    if (format === OutputFormat.CSV) {
      parsed = parseCsv(file, { bom: true });
    } else if (format === OutputFormat.JSON) {
      const rows: SyntheticRecord[] = JSON.parse(file.toString('utf8'));
      parsed = [
        Object.keys(rows[0] ?? {}),
        ...rows.map((r) => Object.values(r).map(asText)),
      ];
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
      parsed = [];
      workbook.worksheets[0].eachRow((row) => {
        parsed.push(
          definition.columns.map((_, i) => asText(row.getCell(i + 1).value)),
        );
      });
    }

    const header = definition.columns.map((c) => c.key);
    const expected = sample.map((r) => header.map((k) => asText(r[k])));
    const ok =
      JSON.stringify(parsed[0]) === JSON.stringify(header) &&
      JSON.stringify(parsed.slice(1)) === JSON.stringify(expected);
    return {
      id: 'export_format_validated',
      label: 'Export format validated',
      passed: ok,
      detail: ok
        ? `${sample.length} records round-tripped through ${format}`
        : `${format} output did not parse back to the same records`,
    };
  }

  private checkSyntheticIds(
    definition: DatasetDefinition,
    dataset: SyntheticDataset,
    sample: SyntheticRecord[],
  ): ValidationCheck {
    const idColumns = definition.columns.filter((c) => c.role === 'id');
    const bad = sample.flatMap((r) =>
      idColumns.filter((c) => !/^SYN-[A-Z0-9-]+$/.test(asText(r[c.key]))),
    );
    const primary = definition.columns[0].key;
    const unique =
      new Set(sample.map((r) => r[primary])).size === sample.length;
    const replaced =
      dataset.datasetType === SourceDatasetType.FROM_FILE
        ? idColumns.length - 1
        : 0;
    return {
      id: 'synthetic_identifiers_generated',
      label: 'Synthetic identifiers generated',
      passed: bad.length === 0 && unique,
      detail:
        bad.length || !unique
          ? 'Some identifiers are not synthetic or not unique'
          : replaced
            ? `${replaced} identifier columns from the source replaced with SYN- values`
            : `${idColumns.length} identifier fields use unique SYN- values`,
    };
  }

  /** Mean over columns of 1 − total variation distance to the source profile. */
  private fidelity(
    definition: DatasetDefinition,
    sample: SyntheticRecord[],
  ): number {
    const scores: number[] = [];
    for (const column of definition.columns) {
      const distribution = definition.distribution?.(column.key);
      if (!distribution) continue;
      const values = sample.map((r) => r[column.key]).filter((v) => v !== null);
      if (!values.length) continue;

      const observed = new Map<string, number>();
      for (const v of values) {
        const bucket = distribution.bucket(v);
        observed.set(bucket, (observed.get(bucket) ?? 0) + 1 / values.length);
      }
      let tvd = 0;
      for (const key of new Set([
        ...observed.keys(),
        ...distribution.expected.keys(),
      ])) {
        tvd += Math.abs(
          (observed.get(key) ?? 0) - (distribution.expected.get(key) ?? 0),
        );
      }
      scores.push(1 - tvd / 2);
    }
    return scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 1;
  }

  private lowConfidenceFields(
    dataset: SyntheticDataset,
    summary: Record<string, any> | null,
  ): { field: string; reason: string }[] {
    if (!summary) return [];
    if (Array.isArray(summary.columns)) {
      return summary.columns.flatMap(
        (c: { key: string; lowConfidence: string[] }) =>
          c.lowConfidence.map((reason) => ({ field: c.key, reason })),
      );
    }
    return summary.lowConfidenceSlots
      ? [
          {
            field: 'document_text',
            reason: `${summary.lowConfidenceSlots} replaced identifiers had low detection confidence`,
          },
        ]
      : [];
  }

  private risk(
    dataset: SyntheticDataset,
    summary: Record<string, any> | null,
    findings: IdentifierFinding[],
  ): { riskLevel: Level3; riskFactors: string[] } {
    if (findings.length) {
      return {
        riskLevel: 'HIGH',
        riskFactors: ['Possible direct identifiers were found in the output'],
      };
    }

    if (dataset.datasetType === SourceDatasetType.FROM_DOCUMENT) {
      const factors: string[] = [];
      if (summary?.requiresReview) {
        factors.push('The source document used a custom identifier selection');
      }
      if (summary?.excludedEntities) {
        factors.push(
          `${summary.excludedEntities} detected entities were kept in the document by the reviewer`,
        );
      }
      return factors.length
        ? { riskLevel: 'MEDIUM', riskFactors: factors }
        : {
            riskLevel: 'LOW',
            riskFactors: [
              'Every detected identifier is replaced with a synthetic value',
            ],
          };
    }

    return {
      riskLevel: 'LOW',
      riskFactors: [
        dataset.sourceId
          ? 'Generated from column statistics only; identifier columns replaced and values seen fewer than 5 times suppressed'
          : 'Fully synthetic: no real individual is represented',
      ],
    };
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Fidelity is measured on a sample, so its thresholds leave room for sampling
 * noise (about ±0.07 at 300 records over 10 buckets); consistency is exact.
 */
function qualityLevel(consistency: number, fidelity: number | null) {
  const f = fidelity ?? 1;
  if (consistency >= 0.98 && f >= 0.9) return 'GOOD';
  if (consistency >= 0.9 && f >= 0.75) return 'FAIR';
  return 'POOR';
}
