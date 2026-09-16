import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateUsersTableWithPasswordHash1789560380262 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN password_hash text;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN password_hash;
    `);
  }
}
