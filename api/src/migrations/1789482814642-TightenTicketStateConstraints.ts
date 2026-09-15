import { MigrationInterface, QueryRunner } from 'typeorm';

export class TightenTicketStateConstraints1789482814642 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tickets
        DROP CONSTRAINT tickets_held_state_valid,
        DROP CONSTRAINT tickets_scanned_state_valid,
        DROP CONSTRAINT tickets_sold_state_valid;
    `);

    await queryRunner.query(`
      ALTER TABLE tickets
        ADD CONSTRAINT tickets_held_state_valid CHECK (
          (status = 'held') = (held_until IS NOT NULL AND held_by_user_id IS NOT NULL)
        ),
        ADD CONSTRAINT tickets_scanned_state_valid CHECK (
          (status = 'scanned') = (scanned_at IS NOT NULL)
        ),
        ADD CONSTRAINT tickets_sold_state_valid CHECK (
          (status IN ('bought', 'scanned')) = (transaction_id IS NOT NULL)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tickets DROP CONSTRAINT tickets_held_state_valid;`,
    );
    await queryRunner.query(
      `ALTER TABLE tickets DROP CONSTRAINT tickets_scanned_state_valid;`,
    );
    await queryRunner.query(
      `ALTER TABLE tickets DROP CONSTRAINT tickets_sold_state_valid;`,
    );

    await queryRunner.query(`
      ALTER TABLE tickets
      ADD CONSTRAINT tickets_held_state_valid CHECK (
        status <> 'held' OR (held_until IS NOT NULL AND held_by_user_id IS NOT NULL)
      );
    `);

    await queryRunner.query(`
      ALTER TABLE tickets
      ADD CONSTRAINT tickets_scanned_state_valid CHECK (
        status <> 'scanned' OR scanned_at IS NOT NULL
      );
    `);

    await queryRunner.query(`
      ALTER TABLE tickets
      ADD CONSTRAINT tickets_sold_state_valid CHECK (
        status NOT IN ('bought', 'scanned') OR transaction_id IS NOT NULL
      );
    `);
  }
}
