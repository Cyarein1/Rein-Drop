import { describe, expect, it } from 'vitest';
import { OFFLINE_MESSAGE, refreshFailed, refreshStarted, refreshSucceeded, refreshUpdated, type Refreshable } from './refreshable.js';

const LOADING: Refreshable<number[]> = { status: 'loading' };

describe('refreshable screen data (unreliable connections)', () => {
  it('first load: loading -> ready, or an error with the offline wording', () => {
    expect(refreshSucceeded([1])).toEqual({ status: 'ready', data: [1], refreshing: false, refreshError: null });
    expect(refreshFailed(LOADING, 'fetch failed', true)).toEqual({ status: 'error', message: OFFLINE_MESSAGE, offline: true });
    expect(refreshFailed(LOADING, 'HTTP 500', false)).toEqual({ status: 'error', message: 'HTTP 500', offline: false });
  });

  it('a failed refresh keeps what is on screen and adds a note', () => {
    const ready = refreshSucceeded([1, 2]);
    const pulling = refreshStarted(ready, true);
    expect(pulling).toMatchObject({ status: 'ready', data: [1, 2], refreshing: true });
    expect(refreshFailed(pulling, 'x', true)).toEqual({ status: 'ready', data: [1, 2], refreshing: false, refreshError: OFFLINE_MESSAGE });
  });

  it('a silent refresh (screen focus) shows no spinner; success clears the note', () => {
    const failed = refreshFailed(refreshSucceeded([1]), 'x', true);
    expect(refreshStarted(failed, false)).toMatchObject({ refreshing: false });
    expect(refreshSucceeded([3])).toMatchObject({ data: [3], refreshError: null });
  });

  it('retrying after a first-load error shows loading again', () => {
    expect(refreshStarted(refreshFailed(LOADING, 'x', false), false)).toEqual(LOADING);
  });

  it('updates loaded data in place', () => {
    expect(refreshUpdated(refreshSucceeded([1]), (d) => [...d, 2])).toMatchObject({ data: [1, 2] });
    expect(refreshUpdated(LOADING, (d) => d)).toBe(LOADING);
  });
});
