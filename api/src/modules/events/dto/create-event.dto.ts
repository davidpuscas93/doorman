import * as z from 'zod';

export const createEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(500).nullish(),
  startsAt: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .refine((d) => d > new Date(), 'Event must start in the future'),
});

export type CreateEventDto = z.infer<typeof createEventSchema>;
