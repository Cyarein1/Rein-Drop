import { describe, expect, it } from 'vitest';
import { translator } from '@rein-drop/i18n';
import { SELLING_WORDS_DE } from './companion-access.js';
import { pushUnavailableCopy, pushView, type PushState } from './push-view.js';

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

  it('German (draft): same behaviour, the inbox is still mentioned, nothing sells', () => {
    const de = translator('de');
    const states: PushState[] = [
      { status: 'undetermined' },
      { status: 'denied', canAskAgain: false },
      { status: 'denied', canAskAgain: true },
      { status: 'enabled', deviceId: 'd', simulated: true },
      { status: 'unavailable', reason: 'web' },
      { status: 'error', message: 'x' },
    ];
    expect(pushView({ status: 'denied', canAskAgain: false }, de)).toMatchObject({ action: 'open_settings', actionLabel: 'Einstellungen öffnen' });
    expect(pushView({ status: 'error', message: 'x' }, de)!.body).toContain('in deinem Posteingang');
    expect(pushView({ status: 'unavailable', reason: 'not_a_device' }, de)!.body).toBe(`${pushUnavailableCopy('not_a_device', de)} Jede Benachrichtigung findest du weiterhin in deinem Posteingang.`);
    const text = states.flatMap((s) => {
      const v = pushView(s, de)!;
      return [v.title, v.body, v.actionLabel ?? ''];
    });
    expect(text.filter((t) => SELLING_WORDS_DE.test(t))).toEqual([]);
  });
});
