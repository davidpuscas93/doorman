import * as z from 'zod';

export const releaseSchema = z.object({
  eventId: z.uuid(),
});

export type ReleaseDto = z.infer<typeof releaseSchema>;
