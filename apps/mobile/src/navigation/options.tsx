import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { roles } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font, IconButton, icons } from '@/ui';

/**
 * Native stack header (detail screens): white, no divider shadow, 17 pt semibold title, a plain
 * back chevron. Tab screens hide the navigator header and draw `LargeTitleHeader` themselves.
 */
export function headerOptions() {
  return {
    headerStyle: { backgroundColor: roles.background },
    headerTintColor: roles.text,
    headerTitleStyle: { ...font('semibold'), fontSize: 17, color: roles.text },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: roles.background },
  } as const;
}

/**
 * A native bottom sheet route (Stack `presentation: 'formSheet'`): grabber, rounded top, dimmed
 * background. Sheets show no navigation header - render `SheetHeader` inside. `detents` are
 * fractions of the screen height (Android: at most 3).
 */
export function sheetOptions(detents: number[] = [0.6, 0.95]) {
  return {
    presentation: 'formSheet',
    sheetAllowedDetents: detents,
    sheetInitialDetentIndex: 0,
    sheetGrabberVisible: true,
    sheetCornerRadius: 20,
    headerShown: false,
    contentStyle: { backgroundColor: roles.background },
  } as const;
}

type SymbolName = SymbolViewProps['name'];

/** Native platform icon: SF Symbols on iOS, Material Symbols on Android. */
export function NavIcon({ name, color, size: iconSize = 24 }: { name: SymbolName; color: ColorValue; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={iconSize} />;
}

/** Inventory header: your listings (Sell, decision 0019). */
export function ListingsHeaderButton() {
  const t = useT();
  const router = useRouter();
  return <IconButton icon={icons.storefront} label={t('nav.titleListings')} onPress={() => router.push('/sell')} />;
}

/** Deals header: the in-app inbox (alerts). `unread` shows a dot. */
export function InboxHeaderButton({ unread }: { unread?: number }) {
  const t = useT();
  const router = useRouter();
  return <IconButton icon={icons.bell} label={t('nav.titleInbox')} badge={unread} onPress={() => router.push('/alerts')} />;
}
