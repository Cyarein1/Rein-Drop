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

/**
 * `POST /me/delete` - delete the signed-in account (Apple 5.1.1(v), Google Play, GDPR erasure).
 * The ONE real erase in Rein Drop (decision 0021): the account and everything in it are erased; a
 * paid subscription is cancelled at the billing provider first. The confirmation must be sent
 * exactly; the apps show `accountDeletionText` (client-core) before sending it.
 */
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE' as const;
export const deleteAccountRequestSchema = z.object({ confirmation: z.literal(DELETE_ACCOUNT_CONFIRMATION) });
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

export const deleteAccountResponseSchema = z.object({
  deleted: z.literal(true),
  deletedAt: z.iso.datetime(),
  /** Paid subscriptions cancelled at the billing provider (immediately, no further charges). */
  canceledSubscriptions: z.number().int().nonnegative(),
  /**
   * Always true: sign out now and forget the session. Signing in again with the same identity
   * starts a NEW, empty account (the sign-in identity itself is managed by the identity provider).
   */
  signOut: z.literal(true),
});
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;
