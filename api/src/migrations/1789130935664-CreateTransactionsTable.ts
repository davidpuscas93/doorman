import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionsTable1789130935664 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transactions (
        id          uuid        PRIMARY KEY DEFAULT uuidv7(),
        amount      int         NOT NULL CHECK (amount >= 0),
        status      text        NOT NULL CHECK (status IN ('pending', 'accepted', 'failed')),
        event_id    uuid        NOT NULL REFERENCES events(id)  ON DELETE RESTRICT,
        user_id     uuid        NOT NULL REFERENCES users(id)   ON DELETE RESTRICT,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TRIGGER transactions_set_updated_at
      BEFORE UPDATE ON transactions
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS transactions;`);
  }
}
