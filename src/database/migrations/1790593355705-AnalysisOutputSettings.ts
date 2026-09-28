import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnalysisOutputSettings1790593355705 implements MigrationInterface {
  name = 'AnalysisOutputSettings1790593355705';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rows created before this migration were all HIPAA Safe Harbor + redact.
    await queryRunner.query(
      `ALTER TABLE "analyses" ADD "identifiers" text array NOT NULL DEFAULT '{names,geographic,dates,phone,fax,email,ssn,mrn,health_plan,account,license,vehicle,device,url,ip,biometric,photo,other}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "analyses" ALTER COLUMN "identifiers" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "analyses" ADD "output_mode" character varying(16) NOT NULL DEFAULT 'REDACT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "analyses" ALTER COLUMN "output_mode" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analyses" DROP COLUMN "output_mode"`);
    await queryRunner.query(`ALTER TABLE "analyses" DROP COLUMN "identifiers"`);
  }
}
