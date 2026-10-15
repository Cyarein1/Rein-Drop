import { render, screen } from '@testing-library/react-native';
import { ESTIMATE_NOTE } from '@rein-drop/client-core';
import { DealEconomics } from '../DealEconomics';

const VIEW = {
  price: 'R 4 000,00',
  priceExtra: '+ R 150,00 known costs',
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
  it('a price / resale / upside strip, then the known-cost breakdown and what is not included', () => {
    render(<DealEconomics view={VIEW} />);
    expect(screen.getByText('Price')).toBeOnTheScreen();
    expect(screen.getByText('Resale (est.)')).toBeOnTheScreen();
    expect(screen.getByText('Upside (est.)')).toBeOnTheScreen();
    expect(screen.getByText('R 5 200,00')).toBeOnTheScreen();
    expect(screen.getByText('R 1 050,00')).toBeOnTheScreen();
    expect(screen.getByText('+ R 150,00 known costs')).toBeOnTheScreen();
    for (const [label, value] of VIEW.priceLines) {
      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(VIEW.maxPriceNote)).toBeOnTheScreen();
    expect(screen.getByText(`Potential upside: ${VIEW.upside.caption}`)).toBeOnTheScreen();
    expect(screen.getByText(`Resale value: ${VIEW.resale.caption}`)).toBeOnTheScreen();
    expect(screen.getByText('Not included: selling fees.')).toBeOnTheScreen();
  });

  it('labels both estimates (seen and spoken) and says they are not guaranteed profit', () => {
    render(<DealEconomics view={VIEW} />);
    expect(screen.getAllByText('Estimated')).toHaveLength(2);
    expect(screen.getByLabelText('Resale value, estimated: R 5 200,00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Potential upside, estimated: R 1 050,00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Asking price: R 4 000,00. + R 150,00 known costs')).toBeOnTheScreen();
    expect(screen.getByText(ESTIMATE_NOTE)).toBeOnTheScreen();
  });

  it('without comparable sales it says "Not estimated" and why - no invented figure', () => {
    const none = { value: 'Not estimated', estimated: false, caption: 'No resale price data yet' };
    render(<DealEconomics view={{ ...VIEW, resale: none, upside: none }} />);
    expect(screen.getAllByText('Not estimated')).toHaveLength(2);
    expect(screen.queryByText('Estimated')).toBeNull();
    expect(screen.getByText('Resale value: No resale price data yet')).toBeOnTheScreen();
    expect(screen.getByText('Potential upside: No resale price data yet')).toBeOnTheScreen();
  });
});
