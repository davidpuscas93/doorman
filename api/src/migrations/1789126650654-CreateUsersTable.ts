import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1789126650654 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id          uuid        PRIMARY KEY DEFAULT uuidv7(),
        name        text        NOT NULL,
        email       text        NOT NULL,
        description text,
        socials     jsonb       NOT NULL DEFAULT '{}'::jsonb,
        role        text        NOT NULL CHECK (role IN ('organizer', 'buyer')),
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX users_email_unique ON users(lower(email));
    `);

    await queryRunner.query(`
      CREATE TRIGGER users_set_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at();`);
  }
}
