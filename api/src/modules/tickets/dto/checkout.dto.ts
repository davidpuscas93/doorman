import * as z from 'zod';

export const checkoutSchema = z.object({
  eventId: z.uuid(),
});

export type CheckoutDto = z.infer<typeof checkoutSchema>;
