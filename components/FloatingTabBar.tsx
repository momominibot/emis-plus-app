// Floating bottom bar: a white pill above the content with a soft shadow.
// Every tab shows its icon and label (easier for older shoppers than icons
// alone); the active tab sits in a tinted capsule with the label in green.
// Screens leave TAB_BAR_SPACE of padding at the bottom.

import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export const TAB_BAR_SPACE = 124;

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
              style={styles.item}
            >
              <View style={[styles.capsule, focused && { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={(focused ? on : off) as any} size={22} color={focused ? colors.primary : colors.textTertiary} />
              </View>
              <Text style={[styles.label, { color: focused ? colors.primaryInk : colors.textTertiary, fontWeight: focused ? '700' : '600' }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 28, borderWidth: 1,
    paddingVertical: 8, paddingHorizontal: 6, width: '100%', maxWidth: 440,
    shadowColor: '#17302A', shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, minHeight: 52, justifyContent: 'center' },
  capsule: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11.5 },
});
