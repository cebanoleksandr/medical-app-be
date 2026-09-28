export type Language = 'en' | 'uk';

export interface Localized {
  en: string;
  uk: string;
}

export const l = (en: string, uk: string): Localized => ({ en, uk });
