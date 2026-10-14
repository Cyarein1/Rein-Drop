import { fireEvent, render, screen } from '@testing-library/react-native';
import { OFFLINE_MESSAGE, refreshFailed, refreshStarted, refreshSucceeded, type Refreshable } from '@rein-drop/client-core';
import { LoadStatus } from '../LoadStatus';

const LOADING: Refreshable<string[]> = { status: 'loading' };

describe('LoadStatus (unreliable connections)', () => {
  it('first load: a labelled loading state', () => {
    render(<LoadStatus state={LOADING} what="deals" onRetry={() => undefined} />);
    expect(screen.getByText('Loading your deals…')).toBeOnTheScreen();
  });

  it('first load failed offline: the offline wording and Try again', () => {
    const onRetry = jest.fn();
    render(<LoadStatus state={refreshFailed(LOADING, 'Network request failed', true)} what="deals" onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load your deals")).toBeOnTheScreen();
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh keeps the content: only a small note, not an error screen', () => {
    const kept = refreshFailed(refreshStarted(refreshSucceeded(['a']), true), 'x', true);
    render(<LoadStatus state={kept} what="deals" onRetry={() => undefined} />);
    expect(screen.getByText('Showing what was loaded earlier')).toBeOnTheScreen();
    expect(screen.queryByText("Couldn't load your deals")).toBeNull();
  });

  it('nothing when the data is fresh', () => {
    render(<LoadStatus state={refreshSucceeded(['a'])} what="deals" onRetry={() => undefined} />);
    expect(screen.toJSON()).toBeNull();
  });
});
