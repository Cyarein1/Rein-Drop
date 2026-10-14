import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useCan } from '@/capabilities/CapabilitiesProvider';
import { MASCOT_TOKENS } from '@rein-drop/design-tokens';
import { productStateSamples } from '@rein-drop/client-core';
import { Wordmark } from '@/brand/Wordmark';
import { ProductState } from '@/components/ProductState';
import { MascotSlot } from '@/ui/MascotSlot';
import { Badge, Button, Card, EmptyState, LoadingState, Metric, Screen, SystemBanner, TextInput } from '@/ui';

/** Developer-only gallery of the mobile UI primitives (not product UI). Release builds: redirected (dev.tools). */
export default function DevScreen() {
  if (!useCan('dev.tools')) return <Redirect href="/deals" />;
  return (
    <Screen description="Every mobile primitive and variant.">
      <Wordmark height={40} />

      <Card title="Button">
        <View style={styles.row}>
          <Button>Start watching</Button>
          <Button variant="secondary">Save</Button>
        </View>
        <View style={styles.row}>
          <Button variant="text">Edit</Button>
          <Button variant="destructive">Archive</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </View>
      </Card>

      <Card title="TextInput">
        <TextInput label="Email" kind="email" placeholder="you@example.com" />
        <TextInput label="Password" kind="password" hint="At least 8 characters" />
        <TextInput label="Max buy price" kind="money" currency="USD" placeholder="0.00" />
        <TextInput label="Search" kind="search" placeholder="Find Hunts, deals…" />
        <TextInput label="Hunt name" error="Name is required" />
      </Card>

      <Card title="Badge">
        <View style={styles.row}>
          <Badge tone="fresh">Just dropped · 2 min ago</Badge>
          <Badge tone="neutral">eBay</Badge>
          <Badge tone="info">High confidence</Badge>
          <Badge tone="action">Live</Badge>
          <Badge tone="profit">Sold</Badge>
          <Badge tone="loss">Unavailable</Badge>
        </View>
      </Card>

      <Card title="Metric">
        <View style={styles.row}>
          <Metric label="Realized profit" value="+$386" tone="profit" />
          <Metric label="Realized loss" value="-$42" tone="loss" />
          <Metric label="Upside" value="$150" estimated />
          <Metric label="Sale price" value="$310" comparison={{ label: 'Expected', value: '$280' }} />
        </View>
      </Card>

      <Card title="SystemBanner">
        <SystemBanner tone="warning" title="Facebook Marketplace checks are delayed" message="eBay monitoring continues." />
        <SystemBanner tone="error" title="Payment failed" message="Your Hunts and data are safe." />
        <SystemBanner tone="info" title="Active Hunt limit reached" message="Your draft is saved." />
        <SystemBanner tone="success" title="Hunt is live" />
      </Card>

      <Card title="EmptyState">
        <EmptyState mascot="confirmed" title="Hunt configured" description="Thumbs-up asset for confirmations." />
      </Card>

      <Card title="LoadingState">
        <LoadingState label="Loading deals…" />
      </Card>

      <Card title="Mascot tokens">
        <View style={styles.row}>
          {MASCOT_TOKENS.map((t) => (
            <MascotSlot key={t} token={t} size={48} />
          ))}
        </View>
      </Card>

      <Card title="Product states">
        {productStateSamples(new Date()).map((view) => (
          <ProductState key={view.state + view.title} view={view}>
            {'consequences' in view && <SystemBanner tone="info" title="Not available yet" message={[...view.consequences, view.unavailableReason].join(' ')} />}
          </ProductState>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
});
