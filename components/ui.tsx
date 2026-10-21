// Small shared pieces for the main tabs: brand bar, section headings, cards.

import { type ReactNode } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export function useColors() {
  return Colors[useColorScheme()];
}

export function BrandMark({ height = 34 }: { height?: number }) {
  return <Image source={require('@/assets/images/brand/emis-plus-logo.png')} style={{ height, width: height * 0.573 }} resizeMode="contain" accessibilityLabel="EMIS+" />;
}

/** Top of each tab: logo mark, title, optional subtitle and right action. */
export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <BrandMark height={36} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHead}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} style={styles.action}>
          <Text style={[styles.actionText, { color: colors.primary }]}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Card({ children, style, tone = 'surface' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'surface' | 'tint' | 'sunken' }) {
  const colors = useColors();
  const bg = tone === 'tint' ? colors.primaryLight : tone === 'sunken' ? colors.surfaceSunken : colors.surface;
  return <View style={[styles.card, { backgroundColor: bg, borderColor: tone === 'surface' ? colors.border : 'transparent' }, style]}>{children}</View>;
}

export function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  gutter: { paddingHorizontal: 20 },
  cardShadow: { shadowColor: '#17302A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 13, marginTop: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, marginTop: 26, marginBottom: 12, gap: 12 },
  sectionTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  sectionSubtitle: { fontSize: 13, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 },
  actionText: { fontSize: 14, fontWeight: '700' },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
});
