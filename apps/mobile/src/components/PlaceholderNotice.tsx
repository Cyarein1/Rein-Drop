import { useT } from '@/i18n/useT';
import { SystemBanner } from '@/ui';

/** Marks a screen as intentional placeholder content so nobody mistakes it for a finished feature. */
export function PlaceholderNotice({ children }: { children: string }) {
  const t = useT();
  return <SystemBanner tone="info" title={t('common.placeholderTitle')} message={children} />;
}
