import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTicketTypesTable1789130230394 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ticket_types (
        id          uuid        PRIMARY KEY DEFAULT uuidv7(),
        name        text        NOT NULL,
        price       int         NOT NULL CHECK (price >= 0),
        total       int         NOT NULL CHECK (total > 0),
        event_id    uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT  ticket_types_event_name_unique UNIQUE (event_id, name)
      );
    `);

    await queryRunner.query(`
      CREATE TRIGGER ticket_types_set_updated_at
      BEFORE UPDATE ON ticket_types
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_types;`);
  }
}
