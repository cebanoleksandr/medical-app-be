import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSyntheticSources1790595075117 implements MigrationInterface {
  name = 'AddSyntheticSources1790595075117';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "synthetic_sources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "kind" character varying(16) NOT NULL, "language" character varying(8) NOT NULL, "summary" jsonb NOT NULL, "payload" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_f245403e5f28d11d5a5178731f5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2c3676fbaf1dd295121da766a4" ON "synthetic_sources" ("expires_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "synthetic_datasets" ADD "source_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "synthetic_sources" ADD CONSTRAINT "FK_cc477897c00926909604f8a4d93" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "synthetic_datasets" ADD CONSTRAINT "FK_00bbdc49d8f83478dc02a775912" FOREIGN KEY ("source_id") REFERENCES "synthetic_sources"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "synthetic_datasets" DROP CONSTRAINT "FK_00bbdc49d8f83478dc02a775912"`,
    );
    await queryRunner.query(
      `ALTER TABLE "synthetic_sources" DROP CONSTRAINT "FK_cc477897c00926909604f8a4d93"`,
    );
    await queryRunner.query(
      `ALTER TABLE "synthetic_datasets" DROP COLUMN "source_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2c3676fbaf1dd295121da766a4"`,
    );
    await queryRunner.query(`DROP TABLE "synthetic_sources"`);
  }
}
