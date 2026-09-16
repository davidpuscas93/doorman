import * as z from 'zod';

export const holdSchema = z.object({
  ticketTypeId: z.uuid(),
  userId: z.uuid(),
  quantity: z.number().int().positive().max(10),
});

export type HoldDto = z.infer<typeof holdSchema>;
