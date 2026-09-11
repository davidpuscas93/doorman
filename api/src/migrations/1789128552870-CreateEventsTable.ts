import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventsTable1789128552870 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE events (
        id          uuid        PRIMARY KEY DEFAULT uuidv7(),
        title       text        NOT NULL,
        location    text        NOT NULL,
        description text,
        user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        starts_at   timestamptz NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TRIGGER events_set_updated_at
      BEFORE UPDATE ON events
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS events;`);
  }
}
