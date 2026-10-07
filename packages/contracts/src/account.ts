import { z } from 'zod';
import { idSchema } from './common.js';
import { userLocaleSchema } from './locale.js';

/**
 * `GET /me` - who the current caller is.
 *
 * PLACEHOLDER: the auth provider is TBD. Fields are limited to what the User
 * table already holds; provider-specific identity (subject id, verified
 * email, ...) is added when auth is chosen.
 */
export const accountIdentitySchema = z.object({
  userId: idSchema,
  email: z.email(),
  displayName: z.string().nullable(),
  /** Locale preferences; null until detected (apps send it once) or chosen. */
  locale: userLocaleSchema.nullable(),
});
export type AccountIdentity = z.infer<typeof accountIdentitySchema>;
