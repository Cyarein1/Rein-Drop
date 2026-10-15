import { render, screen } from '@testing-library/react-native';
import { offlineMessage, refreshFailed, type DealCardView, type Refreshable } from '@rein-drop/client-core';
import { translator } from '@rein-drop/i18n';
import { DealCard } from '../DealCard';
import { LoadStatus } from '../LoadStatus';

/**
 * A German phone, signed out (no stored preference): the UI follows the device language
 * (docs/i18n/README.md). The German text is a draft - these check the wiring, not the wording.
 */
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'de-DE' }] }));

const de = translator('de');

const VIEW: DealCardView = {
  id: 'd1',
  title: 'PlayStation 5 Konsole',
  huntName: 'Konsolen',
  marketplace: 'ebay',
  source: 'eBay',
  freshness: 'vor 5 Min.',
  justDropped: true,
  price: '400,00 €',
  priceExtra: null,
  upside: { value: '120,00 €', estimated: true, caption: '' },
  status: { label: 'Neu', tone: 'action' },
  strength: { label: 'Stark', tone: 'profit' },
  confidence: de('deals.confidenceHigh'),
  analysisNote: null,
  reason: null,
  sourceNote: null,
  exceptional: false,
  accessibleSummary: 'PlayStation 5 Konsole',
};

describe('German UI (device language de-DE)', () => {
  it('DealCard: labels, quick actions and their accessible names are German', () => {
    render(<DealCard view={VIEW} onPress={() => undefined} onSave={() => undefined} onIgnore={() => undefined} />);
    expect(screen.getByText('Geschätzt')).toBeOnTheScreen();
    expect(screen.getByText(de('deals.justDropped'))).toBeOnTheScreen();
    expect(screen.getByText(de('deals.labelPrice'))).toBeOnTheScreen();
    // The confidence column shows the short level, not "Hohe Sicherheit".
    expect(screen.getByText(de('deals.confidenceShortHigh'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'PlayStation 5 Konsole merken' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nicht für mich: PlayStation 5 Konsole' })).toBeOnTheScreen();
    expect(screen.queryByText('Estimated')).toBeNull();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('LoadStatus: one whole German sentence per list, German offline message and Try again', () => {
    const loading: Refreshable<string[]> = { status: 'loading' };
    const { rerender } = render(<LoadStatus state={loading} what="Hunts" onRetry={() => undefined} />);
    expect(screen.getByText('Deine Hunts werden geladen …')).toBeOnTheScreen();
    rerender(<LoadStatus state={refreshFailed(loading, 'Network request failed', true, de)} what="deals" onRetry={() => undefined} />);
    expect(screen.getByText('Deine Deals konnten nicht geladen werden')).toBeOnTheScreen();
    expect(screen.getByText(offlineMessage(de))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeOnTheScreen();
  });
});
