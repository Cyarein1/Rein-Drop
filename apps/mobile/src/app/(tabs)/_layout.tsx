import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { fontSize, radius, roles, size } from '@rein-drop/design-tokens';
import { headerOptions, NavIcon, SettingsHeaderButton } from '@/navigation/options';
import { font } from '@/ui';

/**
 * Bottom navigation: Home - Hunts - central Create - Deals - Analytics
 * (Mobile UI Screenbook, section 1). Settings is in the header of every tab.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        ...headerOptions(),
        headerRight: () => <SettingsHeaderButton />,
        tabBarActiveTintColor: roles.text,
        tabBarInactiveTintColor: roles.textMuted,
        tabBarStyle: { backgroundColor: roles.background, borderTopColor: roles.border },
        tabBarLabelStyle: { ...font('semibold'), fontSize: fontSize.xs },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <NavIcon name={{ ios: 'house', android: 'home' }} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hunts"
        options={{
          title: 'Hunts',
          tabBarIcon: ({ color }) => <NavIcon name={{ ios: 'scope', android: 'radar' }} color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create Hunt',
          // Not a destination: opens the Create Hunt modal on top of the current tab.
          tabBarButton: (props) => <CreateTabButton style={props.style} />,
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: 'Deals',
          tabBarIcon: ({ color }) => <NavIcon name={{ ios: 'tag', android: 'sell' }} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => (
            <NavIcon name={{ ios: 'chart.bar', android: 'bar_chart' }} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function CreateTabButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create Hunt"
      onPress={() => router.push('/hunts/new')}
      style={({ pressed }) => [style, styles.createButton, pressed && styles.pressed]}
    >
      <View style={styles.createCircle}>
        <NavIcon name={{ ios: 'plus', android: 'add' }} color={roles.onAction} size={26} />
      </View>
      <Text style={[styles.createLabel, font('semibold')]}>Create</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  createButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: size.touchTarget },
  createCircle: {
    width: 44,
    height: 44,
    marginTop: -14,
    borderRadius: radius.full,
    backgroundColor: roles.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createLabel: { color: roles.text, fontSize: fontSize.xs, marginTop: 2 },
  pressed: { opacity: 0.8 },
});
