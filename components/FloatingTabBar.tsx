// Floating bottom bar: a white pill that sits above the content with a soft
// shadow. The active tab becomes a green capsule with its label; the others
// show icon only. Screens leave TAB_BAR_SPACE of padding at the bottom.

import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export const TAB_BAR_SPACE = 104;

// Minimal shape of what expo-router's Tabs hands a custom tabBar.
type Route = { key: string; name: string };
type BarProps = {
  state: { index: number; routes: Route[] };
  descriptors: Record<string, { options: { title?: string; tabBarAccessibilityLabel?: string } }>;
  // emit/navigate are typed loosely: React Navigation's generics do not matter here.
  navigation: { emit: (e: any) => any; navigate: (name: string) => void };
};

const ICONS: Record<string, [string, string]> = {
  index: ['home', 'home-outline'],
  shop: ['bag', 'bag-outline'],
  learn: ['book', 'book-outline'],
  tools: ['medkit', 'medkit-outline'],
  account: ['person', 'person-outline'],
};

export default function FloatingTabBar({ state, descriptors, navigation }: BarProps) {
  const colors = Colors[useColorScheme()];
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {state.routes.map((route: Route, index: number) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const [on, off] = ICONS[route.name] || ['ellipse', 'ellipse-outline'];
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole={Platform.OS === 'web' ? 'link' : 'button'}
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || label}
              onPress={onPress}
              style={[styles.item, focused && { backgroundColor: colors.primary, paddingHorizontal: 16 }]}
            >
              <Ionicons name={(focused ? on : off) as any} size={22} color={focused ? '#fff' : colors.textTertiary} />
              {focused ? <Text style={styles.label}>{label}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4,
    borderRadius: 999, borderWidth: 1, padding: 6, width: '100%', maxWidth: 420,
    shadowColor: '#17302A', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, minWidth: 48, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  label: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
