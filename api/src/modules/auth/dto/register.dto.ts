import * as z from 'zod';

export const registerSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  name: z.string().trim().min(1),
  password: z.string().min(12).max(128),
});

export type RegisterDto = z.infer<typeof registerSchema>;
