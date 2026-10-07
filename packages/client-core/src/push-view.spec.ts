import { describe, expect, it } from 'vitest';
import { pushView } from './push-view.js';

describe('pushView', () => {
  it('asks politely, once, with a way out', () => {
    expect(pushView({ status: 'undetermined' })).toMatchObject({ action: 'enable', actionLabel: 'Turn on notifications', canDismiss: true });
    expect(pushView({ status: 'checking' })).toBeNull();
  });

  it('a denial is never a dead end: the inbox still has every alert', () => {
    const blocked = pushView({ status: 'denied', canAskAgain: false })!;
    expect(blocked).toMatchObject({ action: 'open_settings', actionLabel: 'Open settings', tone: 'warning' });
    expect(blocked.body).toContain('every alert in your inbox');
    expect(pushView({ status: 'denied', canAskAgain: true })).toMatchObject({ action: 'enable' });
    expect(pushView({ status: 'error', message: 'x' })!.body).toContain('every alert in your inbox');
    expect(pushView({ status: 'unavailable', reason: 'no_project_id' })).toMatchObject({ action: null });
  });

  it('says when pushes are only simulated (Expo Go development)', () => {
    expect(pushView({ status: 'enabled', deviceId: 'd', simulated: true })!.body).toContain('simulated');
    expect(pushView({ status: 'enabled', deviceId: 'd', simulated: false })).toMatchObject({ action: 'disable', tone: 'success' });
  });
});
