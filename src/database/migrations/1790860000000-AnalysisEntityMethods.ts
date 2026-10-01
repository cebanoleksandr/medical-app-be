import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnalysisEntityMethods1790860000000 implements MigrationInterface {
  name = 'AnalysisEntityMethods1790860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing analyses used an output mode, so both stay null for them.
    await queryRunner.query(
      `ALTER TABLE "analyses" ADD "risk_level" character varying(8)`,
    );
    await queryRunner.query(
      `ALTER TABLE "analyses" ADD "entity_methods" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "analyses" DROP COLUMN "entity_methods"`,
    );
    await queryRunner.query(`ALTER TABLE "analyses" DROP COLUMN "risk_level"`);
  }
}
