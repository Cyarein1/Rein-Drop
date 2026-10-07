import type { AccountIdentity } from '@rein-drop/api-client';

/**
 * PLACEHOLDER AUTH - mirrors apps/web/src/auth/session.ts. The app always acts as a
 * fixed local user so the shell can be built before an auth provider is chosen.
 *
 * TODO(auth): replace with the real session; signed-out users go to the welcome /
 * sign-in flow (App Flow Blueprint, section 3).
 */
export interface Session {
  user: AccountIdentity;
  isPlaceholder: boolean;
}

export const placeholderSession: Session = {
  user: {
    userId: '00000000-0000-7000-8000-000000000001',
    email: 'dev@reindrop.local',
    displayName: null,
  },
  isPlaceholder: true,
};

export function useSession(): Session {
  return placeholderSession;
}
