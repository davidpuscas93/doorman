import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  status: 'available' | 'held' | 'bought' | 'scanned';

  @Column({ name: 'qr_code', type: 'text' })
  qrCode: string;

  @Column({ name: 'ticket_type_id', type: 'uuid' })
  ticketTypeId: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'held_by_user_id', type: 'uuid', nullable: true })
  heldByUserId: string | null;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId: string | null;

  @Column({
    name: 'held_until',
    type: 'timestamptz',
    nullable: true,
  })
  heldUntil: Date | null;

  @Column({
    name: 'scanned_at',
    type: 'timestamptz',
    nullable: true,
  })
  scannedAt: Date | null;

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
