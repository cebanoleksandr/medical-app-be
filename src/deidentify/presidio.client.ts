import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Span } from './anonymizer';

/** Gateway answers while the instance starts up. */
const WAKING_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 3000;

export type AnalysisLanguage = 'en' | 'uk';

export interface PresidioAnalyzeRequest {
  text: string;
  language: AnalysisLanguage;
  entities: string[];
  scoreThreshold: number;
}

@Injectable()
export class PresidioClient {
  private readonly logger = new Logger(PresidioClient.name);
  private lastWarmUp = 0;

  constructor(private readonly config: ConfigService) {}

  /**
   * Free-tier instances sleep when idle and need ~30-60 s to load the spaCy
   * models. Pinging /health early hides that from the first analysis.
   */
  warmUp(): void {
    if (Date.now() - this.lastWarmUp < 5 * 60 * 1000) return;
    this.lastWarmUp = Date.now();
    fetch(new URL('/health', this.config.get('PRESIDIO_URL')), {
      signal: AbortSignal.timeout(this.config.get('PRESIDIO_TIMEOUT_MS')),
    }).catch((err) =>
      this.logger.warn(`Presidio warm-up failed: ${(err as Error).message}`),
    );
  }

  onApplicationBootstrap() {
    this.warmUp();
  }

  async analyze(req: PresidioAnalyzeRequest): Promise<Span[]> {
    const timeout = this.config.get<number>('PRESIDIO_TIMEOUT_MS')!;
    const deadline = Date.now() + timeout;
    let res: Response;
    for (;;) {
      try {
        res = await fetch(
          new URL('/analyze', this.config.get('PRESIDIO_URL')),
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': this.config.getOrThrow('PRESIDIO_API_KEY'),
            },
            body: JSON.stringify({
              text: req.text,
              language: req.language,
              entities: req.entities,
              score_threshold: req.scoreThreshold,
            }),
            signal: AbortSignal.timeout(Math.max(deadline - Date.now(), 1000)),
          },
        );
      } catch (err) {
        this.logger.error(`Presidio unreachable: ${(err as Error).message}`);
        throw new ServiceUnavailableException('Detection service unavailable');
      }
      // Render answers 502 while a sleeping free instance starts, and a request
      // from another Render service doesn't wake it (the frontend pings it):
      // wait for it within the same timeout.
      if (
        !WAKING_STATUSES.has(res.status) ||
        Date.now() + RETRY_DELAY_MS >= deadline
      ) {
        break;
      }
      this.logger.warn(`Presidio responded ${res.status}, retrying`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    if (!res.ok) {
      // The body may echo validation errors about the input, so it's not logged.
      this.logger.error(`Presidio responded ${res.status}`);
      throw new ServiceUnavailableException('Detection service unavailable');
    }

    const body: { entities: Span[] } = await res.json();
    return body.entities;
  }
}
