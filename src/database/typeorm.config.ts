import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

export function buildTypeOrmOptions(env: {
  DATABASE_URL: string;
  DATABASE_SSL?: boolean | string;
}): DataSourceOptions {
  const ssl = env.DATABASE_SSL === true || env.DATABASE_SSL === 'true';

  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    synchronize: false,
    // Free hosting tiers have no pre-deploy hook, so migrations run on boot.
    migrationsRun: true,
  };
}
