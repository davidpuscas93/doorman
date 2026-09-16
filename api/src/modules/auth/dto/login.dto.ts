import * as z from 'zod';

export const loginSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(256),
});

export type LoginDto = z.infer<typeof loginSchema>;
