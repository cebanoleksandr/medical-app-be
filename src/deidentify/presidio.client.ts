import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Span } from './anonymizer';

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
    let res: Response;
    try {
      res = await fetch(new URL('/analyze', this.config.get('PRESIDIO_URL')), {
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
        signal: AbortSignal.timeout(this.config.get('PRESIDIO_TIMEOUT_MS')),
      });
    } catch (err) {
      this.logger.error(`Presidio unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Detection service unavailable');
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
