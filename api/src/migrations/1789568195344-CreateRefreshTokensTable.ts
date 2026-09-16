import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokensTable1789568195344 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id          		uuid        PRIMARY KEY DEFAULT uuidv7(),
        user_id         uuid				NOT NULL REFERENCES users(id)	ON DELETE CASCADE,
        token_hash      text        NOT NULL UNIQUE,
        family_id       uuid        NOT NULL,
        expires_at			timestamptz NOT NULL,
        used_at         timestamptz NULL,
        revoked_at  		timestamptz NULL,
        created_at  		timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens (family_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens;`);
  }
}
