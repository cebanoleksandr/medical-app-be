import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  TRUST_PROXY: Joi.boolean().default(false),
  // API docs at /api/docs; off in production unless enabled explicitly.
  SWAGGER_ENABLED: Joi.boolean().default(
    Joi.ref('NODE_ENV', { adjust: (env) => env !== 'production' }),
  ),

  // Frontend URL: used for CORS and for building the magic link.
  APP_URL: Joi.string().uri().required(),

  DATABASE_URL: Joi.string().uri().required(),
  DATABASE_SSL: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(30),
  MAGIC_LINK_TTL_MINUTES: Joi.number().integer().min(1).default(15),
  MAGIC_LINK_MAX_PER_WINDOW: Joi.number().integer().min(1).default(5),

  COOKIE_SECURE: Joi.boolean().default(false),
  COOKIE_SAMESITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),

  // `console` logs sign-in links, so it must never run in production.
  MAIL_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('resend', 'brevo').required(),
    otherwise: Joi.string()
      .valid('console', 'resend', 'brevo')
      .default('console'),
  }),
  RESEND_API_KEY: Joi.string().when('MAIL_PROVIDER', {
    is: 'resend',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  BREVO_API_KEY: Joi.string().when('MAIL_PROVIDER', {
    is: 'brevo',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  // Resend: an address on a domain verified in Resend (or onboarding@resend.dev
  // for tests, which only delivers to the Resend account's own email).
  MAIL_FROM_EMAIL: Joi.string()
    .email()
    .when('MAIL_PROVIDER', {
      is: Joi.valid('resend', 'brevo'),
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  MAIL_FROM_NAME: Joi.string().default('De-ID Studio'),

  PRESIDIO_URL: Joi.string().uri().default('http://localhost:5001'),
  PRESIDIO_API_KEY: Joi.string().min(16).required(),
  // Generous default: a free-tier Presidio instance may be waking from sleep.
  PRESIDIO_TIMEOUT_MS: Joi.number().integer().min(1000).default(60_000),

  // Keys the HMAC that seeds pseudonyms; rotating it changes every pseudonym.
  PSEUDONYM_SECRET: Joi.string().min(32).required(),

  // Audit events older than this are deleted.
  AUDIT_RETENTION_DAYS: Joi.number().integer().min(1).default(365),

  // How long a generated dataset stays downloadable ("session only").
  SYNTH_DATASET_TTL_MINUTES: Joi.number().integer().min(1).default(60),
  // 32 random bytes, base64 or base64url: encrypts stored file profiles and
  // templates. Render's generateValue produces a compatible value.
  SOURCE_ENCRYPTION_KEY: Joi.string()
    .required()
    .custom((value: string, helpers) =>
      Buffer.from(value, 'base64').length === 32
        ? value
        : helpers.message({ custom: 'must decode to 32 bytes (base64)' }),
    ),
});
