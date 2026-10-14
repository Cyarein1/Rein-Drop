import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DealCardView } from '@rein-drop/client-core';
import { DealCard } from '../DealCard';

const VIEW: DealCardView = {
  id: 'd1',
  title: 'PlayStation 5 console',
  huntName: 'Consoles',
  source: 'eBay',
  freshness: '5 min ago',
  justDropped: true,
  price: 'R 4 000,00',
  priceExtra: '+ R 150,00 known costs',
  upside: { value: 'R 1 200,00', estimated: true, caption: 'Range R 900,00 to R 1 500,00' },
  status: { label: 'New', tone: 'action' },
  strength: { label: 'Strong', tone: 'profit' },
  confidence: 'High confidence',
  analysisNote: null,
  reason: 'Asking is well below recent sales',
  sourceNote: null,
  exceptional: false,
  accessibleSummary: 'PlayStation 5 console. eBay, 5 min ago. R 4 000,00. Strong deal. estimated upside R 1 200,00. New',
};

describe('DealCard', () => {
  it('shows the essentials for a quick decision: price, known costs, source and an estimated upside', () => {
    render(<DealCard view={VIEW} onPress={() => undefined} />);
    expect(screen.getByText('PlayStation 5 console')).toBeOnTheScreen();
    expect(screen.getByText('R 4 000,00')).toBeOnTheScreen();
    expect(screen.getByText('+ R 150,00 known costs')).toBeOnTheScreen();
    expect(screen.getByText(/eBay/)).toBeOnTheScreen();
    expect(screen.getByText('R 1 200,00')).toBeOnTheScreen();
    // The upside is always marked as an estimate.
    expect(screen.getByText('Estimated')).toBeOnTheScreen();
    expect(screen.queryByText(/profit/i)).toBeNull();
  });

  it('an unestimated upside is not dressed up as a number', () => {
    render(<DealCard view={{ ...VIEW, upside: { value: 'Not estimated', estimated: false, caption: '' } }} onPress={() => undefined} />);
    expect(screen.getByText('Not estimated')).toBeOnTheScreen();
    expect(screen.queryByText('Estimated')).toBeNull();
  });

  it('opens the deal from one accessible button with a spoken summary', () => {
    const onPress = jest.fn();
    render(<DealCard view={VIEW} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: VIEW.accessibleSummary }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('quick decisions: Save and Not for me, each named for the deal', () => {
    const onSave = jest.fn();
    const onIgnore = jest.fn();
    render(<DealCard view={VIEW} onPress={() => undefined} onSave={onSave} onIgnore={onIgnore} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save PlayStation 5 console' }));
    fireEvent.press(screen.getByRole('button', { name: 'Not for me: PlayStation 5 console' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onIgnore).toHaveBeenCalledTimes(1);
  });

  it('offers no quick actions the deal does not allow, and disables them while one runs', () => {
    const { rerender } = render(<DealCard view={VIEW} onPress={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    rerender(<DealCard view={VIEW} onPress={() => undefined} onSave={() => undefined} onIgnore={() => undefined} busy />);
    expect(screen.getByRole('button', { name: 'Not for me: PlayStation 5 console' })).toBeDisabled();
  });
});
