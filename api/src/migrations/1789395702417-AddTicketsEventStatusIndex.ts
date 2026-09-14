import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketsEventStatusIndex1789395702417 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX tickets_event_id_status_idx ON tickets (event_id, status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX tickets_event_id_status_idx;`);
  }
}
