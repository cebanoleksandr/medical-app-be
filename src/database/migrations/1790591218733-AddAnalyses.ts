import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalyses1790591218733 implements MigrationInterface {
  name = 'AddAnalyses1790591218733';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "analyses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "framework" character varying(32) NOT NULL, "method" character varying(32) NOT NULL, "language" character varying(8) NOT NULL, "sensitivity" character varying(16) NOT NULL, "input_length" integer NOT NULL, "detected_count" integer NOT NULL, "processed_count" integer NOT NULL, "avg_confidence" real, "processing_ms" integer NOT NULL, "entity_counts" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_91421900ca225ed9865d016a940" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a687bb9bb2bc78d647a833bc33" ON "analyses" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "analyses" ADD CONSTRAINT "FK_ead6a3f3c5808babebb808ca569" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "analyses" DROP CONSTRAINT "FK_ead6a3f3c5808babebb808ca569"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a687bb9bb2bc78d647a833bc33"`,
    );
    await queryRunner.query(`DROP TABLE "analyses"`);
  }
}
