import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { huntFormDefaults, queryPlaceholder } from '@rein-drop/client-core';
import { roles } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { useSession } from '@/auth/SessionProvider';
import { HuntFormFlow, type HuntFormFlowProps } from '@/components/HuntFormFlow';
import { getApiClient } from '@/config/api';
import { LoadingState } from '@/ui';

type Prepared = HuntFormFlowProps;

/**
 * Create Hunt -> Review -> Save as draft (App Flow Blueprint section 5), presented as a
 * native modal from the central Create tab. Monitoring is not started here.
 */
export default function CreateHuntScreen() {
  return (
    <SessionGate>
      <CreateHuntLoader />
    </SessionGate>
  );
}

/** Loads the Seller Snapshot so the form starts with sensible, visible defaults. */
function CreateHuntLoader() {
  const session = useSession();
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The snapshot only provides defaults - the form still works without it.
    Promise.resolve()
      .then(() => getApiClient().getSellerSnapshot())
      .catch(() => null)
      .then((snapshot) => {
        if (cancelled) return;
        const defaults = huntFormDefaults(snapshot, session.user.locale);
        setPrepared({ ...defaults, placeholder: queryPlaceholder(snapshot) });
      });
    return () => {
      cancelled = true;
    };
  }, [session.user.locale]);

  if (!prepared) {
    return (
      <View style={styles.center}>
        <LoadingState label="Preparing your Hunt…" />
      </View>
    );
  }
  return <HuntFormFlow {...prepared} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: roles.background },
});
