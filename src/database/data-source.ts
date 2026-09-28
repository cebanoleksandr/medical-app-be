// Used only by the TypeORM CLI (migration:generate / run / revert).
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.config';

export default new DataSource(
  buildTypeOrmOptions({
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_SSL: process.env.DATABASE_SSL,
  }),
);
