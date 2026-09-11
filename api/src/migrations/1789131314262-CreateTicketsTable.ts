import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTicketsTable1789129831962 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tickets (
        id          		uuid        PRIMARY KEY DEFAULT uuidv7(),
        status      		text        NOT NULL CHECK (status IN ('available', 'held', 'bought', 'scanned')),
        qr_code         text        NOT NULL UNIQUE,
        ticket_type_id	uuid				NOT NULL REFERENCES ticket_types(id)	ON DELETE RESTRICT,
        event_id				uuid        NOT NULL REFERENCES events(id) 				ON DELETE RESTRICT,
        held_by_user_id	uuid        REFERENCES users(id) 				          ON DELETE RESTRICT,
        transaction_id	uuid        REFERENCES transactions(id)           ON DELETE RESTRICT,
        held_until			timestamptz,
        scanned_at			timestamptz,
        created_at  		timestamptz NOT NULL DEFAULT now(),
        updated_at  		timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT      tickets_held_state_valid CHECK (
          status <> 'held' OR (held_until IS NOT NULL AND held_by_user_id IS NOT NULL)
        )
      );
    `);

    await queryRunner.query(`
      CREATE TRIGGER tickets_set_updated_at
      BEFORE UPDATE ON tickets
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tickets;`);
  }
}
