import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { colors } from './theme';

export type IconName = SymbolViewProps['name'];

/** Native platform icon: SF Symbols on iOS, Material Symbols on Android. Decorative unless labelled by its parent. */
export function Icon({ name, color = colors.text, size = 22 }: { name: IconName; color?: ColorValue; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

/** Shared icon names, so screens stay consistent across platforms. */
export const icons = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  close: { ios: 'xmark', android: 'close' },
  bell: { ios: 'bell', android: 'notifications' },
  save: { ios: 'bookmark', android: 'bookmark' },
  saved: { ios: 'bookmark.fill', android: 'bookmark_added' },
  dismiss: { ios: 'hand.thumbsdown', android: 'thumb_down' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  search: { ios: 'magnifyingglass', android: 'search' },
  plus: { ios: 'plus', android: 'add' },
  check: { ios: 'checkmark', android: 'check' },
  warning: { ios: 'exclamationmark.circle', android: 'error' },
  info: { ios: 'info.circle', android: 'info' },
  photo: { ios: 'photo', android: 'image' },
  storefront: { ios: 'storefront', android: 'storefront' },
  edit: { ios: 'pencil', android: 'edit' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  external: { ios: 'arrow.up.right.square', android: 'open_in_new' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on' },
  globe: { ios: 'globe', android: 'language' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  pause: { ios: 'pause.circle', android: 'pause_circle' },
  play: { ios: 'play.circle', android: 'play_circle' },
  archive: { ios: 'archivebox', android: 'archive' },
} as const satisfies Record<string, IconName>;
