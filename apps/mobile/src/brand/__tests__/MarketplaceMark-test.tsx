import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ChoiceGroup } from '@/ui';
import { MarketplaceMark, MarketplaceName } from '../MarketplaceMark';

/** Marketplace logos in the app (same official files as the landing page), named for screen readers. */
describe('MarketplaceMark / MarketplaceName', () => {
  it('eBay: the official wordmark; Facebook Marketplace: the Facebook icon', () => {
    render(
      <>
        <MarketplaceMark marketplace="ebay" />
        <MarketplaceMark marketplace="facebook" />
      </>,
    );
    expect(screen.getByTestId('marketplace-mark-ebay', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId('marketplace-mark-facebook')).toBeOnTheScreen();
  });

  it('logo + name, announced by name (the logo itself is decorative)', () => {
    render(<MarketplaceName marketplace="facebook" />);
    expect(screen.getByLabelText('Facebook Marketplace')).toBeOnTheScreen();
    expect(screen.getByText('Facebook Marketplace')).toBeOnTheScreen();
    expect(screen.getByTestId('marketplace-mark-facebook')).toBeOnTheScreen();
  });

  it('eBay can show the wordmark alone (it spells the name) and is still announced as eBay', () => {
    render(<MarketplaceName marketplace="ebay" showName={false} />);
    expect(screen.getByLabelText('eBay')).toBeOnTheScreen();
    expect(screen.queryByText('eBay')).toBeNull();
  });

  it('choice chips show the logo next to the label, announced by the label', () => {
    render(
      <ChoiceGroup<'ebay' | 'facebook'>
        multiple
        legend="Marketplaces"
        options={[
          { value: 'ebay', label: 'eBay', icon: <MarketplaceMark marketplace="ebay" /> },
          { value: 'facebook', label: 'Facebook Marketplace', icon: <Text>FB</Text> },
        ]}
        value={['ebay']}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'eBay', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Facebook Marketplace', checked: false })).toBeOnTheScreen();
    expect(screen.getByTestId('marketplace-mark-ebay', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
