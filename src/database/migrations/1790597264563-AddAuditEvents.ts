import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditEvents1790597264563 implements MigrationInterface {
  name = 'AddAuditEvents1790597264563';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "action" character varying(48) NOT NULL, "resource_id" uuid, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_910f64d901a5c3e9878f0d4a407" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_497bb4f7c4c55db9749616cd2a" ON "audit_events" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7287743eba71c4f62ee4136532" ON "audit_events" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" ADD CONSTRAINT "FK_e1c246079d669576b847df55d90" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_events" DROP CONSTRAINT "FK_e1c246079d669576b847df55d90"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7287743eba71c4f62ee4136532"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_497bb4f7c4c55db9749616cd2a"`,
    );
    await queryRunner.query(`DROP TABLE "audit_events"`);
  }
}
