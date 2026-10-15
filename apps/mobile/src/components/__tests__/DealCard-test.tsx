import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DealCardView } from '@rein-drop/client-core';
import { DealCard } from '../DealCard';

const VIEW: DealCardView = {
  id: 'd1',
  title: 'PlayStation 5 console',
  huntName: 'Consoles',
  marketplace: 'ebay',
  source: 'eBay',
  sourceShort: 'eBay',
  freshness: 'Posted 5 min ago',
  age: '5 min ago',
  justDropped: true,
  imageUrl: null,
  statusKey: 'new',
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

const row = () => screen.getByRole('button', { name: VIEW.accessibleSummary });

describe('DealCard (feed row)', () => {
  it('shows the essentials for a quick decision: price, known costs, source, age, strength and an estimated upside', () => {
    render(<DealCard view={VIEW} onPress={() => undefined} />);
    expect(screen.getByText('PlayStation 5 console')).toBeOnTheScreen();
    expect(screen.getByText('R 4 000,00')).toBeOnTheScreen();
    expect(screen.getByText('+ R 150,00 known costs')).toBeOnTheScreen();
    // The marketplace is shown with its logo (like the landing page) and named for screen readers.
    expect(screen.getByTestId('marketplace-mark-ebay', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('eBay')).toBeOnTheScreen();
    expect(screen.getByText('· 5 min ago · Strong')).toBeOnTheScreen();
    expect(screen.getByText(/^R 1 200,00/)).toBeOnTheScreen();
    // The upside is always marked as an estimate.
    expect(screen.getByText('est. upside')).toBeOnTheScreen();
    expect(screen.queryByText(/profit/i)).toBeNull();
    // Just dropped: a "New" tag on the photo.
    expect(screen.getByText('New')).toBeOnTheScreen();
  });

  it('an unestimated upside is not dressed up as a number', () => {
    render(<DealCard view={{ ...VIEW, upside: { value: 'Not estimated', estimated: false, caption: '' } }} onPress={() => undefined} />);
    expect(screen.getByText('Not estimated')).toBeOnTheScreen();
    expect(screen.queryByText('est. upside')).toBeNull();
  });

  it('decided or gone deals carry a status tag and the source note', () => {
    render(
      <DealCard
        view={{ ...VIEW, justDropped: false, statusKey: 'unavailable', status: { label: 'No longer available', tone: 'loss' }, sourceNote: { text: 'Sold on eBay', tone: 'loss' } }}
        onPress={() => undefined}
      />,
    );
    expect(screen.getByText('No longer available')).toBeOnTheScreen();
    expect(screen.getByText('Sold on eBay')).toBeOnTheScreen();
  });

  it('opens the deal from one accessible button with a spoken summary', () => {
    const onPress = jest.fn();
    render(<DealCard view={VIEW} onPress={onPress} />);
    fireEvent.press(row());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('quick decisions: a Save button, and Save / Not for me as actions on the row (never swipe-only)', () => {
    const onSave = jest.fn();
    const onIgnore = jest.fn();
    render(<DealCard view={VIEW} onPress={() => undefined} onSave={onSave} onIgnore={onIgnore} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save PlayStation 5 console' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(row().props.accessibilityActions).toEqual([
      { name: 'save', label: 'Save PlayStation 5 console' },
      { name: 'ignore', label: 'Not for me: PlayStation 5 console' },
    ]);
    fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName: 'ignore' } });
    fireEvent(row(), 'accessibilityAction', { nativeEvent: { actionName: 'save' } });
    expect(onIgnore).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('offers no quick actions the deal does not allow, and disables them while one runs', () => {
    const { rerender } = render(<DealCard view={VIEW} onPress={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    expect(row().props.accessibilityActions).toEqual([]);
    rerender(<DealCard view={VIEW} onPress={() => undefined} onSave={() => undefined} onIgnore={() => undefined} busy />);
    expect(screen.getByRole('button', { name: 'Save PlayStation 5 console' })).toBeDisabled();
    expect(row().props.accessibilityActions).toEqual([]);
  });
});
