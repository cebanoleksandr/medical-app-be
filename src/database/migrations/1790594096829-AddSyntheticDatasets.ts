import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSyntheticDatasets1790594096829 implements MigrationInterface {
  name = 'AddSyntheticDatasets1790594096829';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "synthetic_datasets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "dataset_type" character varying(32) NOT NULL, "framework" character varying(32) NOT NULL, "language" character varying(8) NOT NULL, "record_count" integer NOT NULL, "format" character varying(8) NOT NULL, "seed" integer NOT NULL, "reference_date" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_f0712f83c036b6384a3f5668557" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0a57792cdfcb3feca9cce787ae" ON "synthetic_datasets" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "synthetic_datasets" ADD CONSTRAINT "FK_cdde58c4ab6a13ba9f755c9c8e3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "synthetic_datasets" DROP CONSTRAINT "FK_cdde58c4ab6a13ba9f755c9c8e3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0a57792cdfcb3feca9cce787ae"`,
    );
    await queryRunner.query(`DROP TABLE "synthetic_datasets"`);
  }
}
