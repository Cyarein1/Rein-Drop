import { render, screen } from '@testing-library/react-native';
import { ESTIMATE_NOTE } from '@rein-drop/client-core';
import { DealEconomics } from '../DealEconomics';

const VIEW = {
  priceLines: [
    ['Asking price', 'R 4 000,00'],
    ['Shipping', 'R 150,00'],
    ['Known total', 'R 4 150,00'],
  ] as [string, string][],
  maxPriceNote: 'R 350,00 under your max of R 4 500,00, including known costs',
  resale: { value: 'R 5 200,00', estimated: true, caption: 'Range R 4 800,00 to R 5 600,00, from 12 similar sales' },
  upside: { value: 'R 1 050,00', estimated: true, caption: 'Range R 650,00 to R 1 450,00, before selling fees' },
  targetNote: null,
  notIncluded: 'Not included: selling fees.',
};

describe('DealEconomics', () => {
  it('shows asking price and known costs, then estimated resale and potential upside', () => {
    render(<DealEconomics view={VIEW} />);
    for (const [label, value] of VIEW.priceLines) {
      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.getByText(value)).toBeOnTheScreen();
    }
    expect(screen.getByText('Resale value')).toBeOnTheScreen();
    expect(screen.getByText('R 5 200,00')).toBeOnTheScreen();
    expect(screen.getByText('Potential upside')).toBeOnTheScreen();
    expect(screen.getByText(VIEW.upside.caption)).toBeOnTheScreen();
    expect(screen.getByText('Not included: selling fees.')).toBeOnTheScreen();
  });

  it('labels both estimates and says they are not guaranteed profit', () => {
    render(<DealEconomics view={VIEW} />);
    expect(screen.getAllByText('Estimated')).toHaveLength(2);
    expect(screen.getByLabelText('Resale value, estimated: R 5 200,00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Potential upside, estimated: R 1 050,00')).toBeOnTheScreen();
    expect(screen.getByText(ESTIMATE_NOTE)).toBeOnTheScreen();
  });

  it('without comparable sales it says "Not estimated" and why - no invented figure', () => {
    const none = { value: 'Not estimated', estimated: false, caption: 'No resale price data yet' };
    render(<DealEconomics view={{ ...VIEW, resale: none, upside: none }} />);
    expect(screen.getAllByText('Not estimated')).toHaveLength(2);
    expect(screen.queryByText('Estimated')).toBeNull();
    expect(screen.getAllByText('No resale price data yet')).toHaveLength(2);
  });
});
