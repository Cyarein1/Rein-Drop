import { Redirect } from 'expo-router';

/**
 * `/sell` - kept only so existing links still work. Your listings now live in the Sell tab's
 * Listings section (Inventory merged into Sell, decision 0021).
 */
export default function SellListingsRedirect() {
  return <Redirect href={{ pathname: '/inventory', params: { section: 'listed' } }} />;
}
