import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ticket_types')
export class TicketType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'int' })
  total: number;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    insert: false,
    update: false,
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    insert: false,
    update: false,
  })
  updatedAt: Date;
}
