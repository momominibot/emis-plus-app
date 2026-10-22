// Shared building blocks for the guided clinical tools and Learn guides.
// Wording for the disclaimer is carried over unchanged from the reviewed
// EMIS+ web tools (emis-plus-app Next.js, src/components/Disclaimer.tsx).

import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getReferences, type ReferenceId } from '@/lib/clinical/references';
import { getProductsForTag } from '@/lib/shopify';
import { Product } from '@/lib/types';

export function useColors() {
  return Colors[useColorScheme()];
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  if (compact) {
    return (
      <Text style={[styles.compactDisclaimer, { color: colors.textSecondary }]}>
        Educational information only, not medical advice. Always confirm with your clinician, stoma nurse or dietitian.
      </Text>
    );
  }
  return (
    <View style={[styles.box, { backgroundColor: colors.warningBg, borderColor: colors.warning + '55' }]}>
      <Ionicons name="information-circle" size={18} color={colors.warning} />
      <Text style={[styles.boxText, { color: colors.text }]}>
        EMIS+ gives <Text style={styles.bold}>general educational estimates</Text> based on published clinical guidelines.
        It is <Text style={styles.bold}>not medical advice</Text>, not a diagnosis, and not a substitute for your own
        healthcare team. Your individual needs may differ, especially with kidney, liver or heart conditions, diabetes,
        or fluid restrictions. Always discuss changes to your diet, supplements or fluids with your{' '}
        <Text style={styles.bold}>doctor, stoma nurse or registered dietitian</Text> before acting on anything here. In
        an emergency, seek urgent medical care.
      </Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.sectionTitle, { color: colors.text }]}>{children}</Text>;
}

export function Bullets({ items, color }: { items: string[]; color?: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      {items.map((t, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={[styles.bulletDot, { color: color || colors.primary }]}>{'•'}</Text>
          <Text style={[styles.bodyText, { color: colors.text, flex: 1 }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export function RedFlags({ items, title = 'Get medical help' }: { items: string[]; title?: string }) {
  const colors = useColors();
  if (!items.length) return null;
  return (
    <View style={[styles.flagBox, { backgroundColor: colors.dangerBg, borderColor: colors.danger + '66' }]}>
      <View style={styles.flagHeader}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <Text style={[styles.flagTitle, { color: colors.danger }]}>{title}</Text>
      </View>
      <Bullets items={items} color={colors.danger} />
    </View>
  );
}

export function References({ ids, title = 'Clinical sources' }: { ids: readonly ReferenceId[]; title?: string }) {
  const colors = useColors();
  if (!ids.length) return null;
  const refs = getReferences(ids);
  return (
    <View style={[styles.refBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
      <Text style={[styles.refTitle, { color: colors.text }]}>{title}</Text>
      {refs.map((ref, i) => (
        <TouchableOpacity key={ref.id} onPress={() => Linking.openURL(ref.url)} style={{ marginTop: 10 }}>
          <Text style={[styles.refLabel, { color: colors.primary }]}>{i + 1}. {ref.label}</Text>
          <Text style={[styles.refCitation, { color: colors.textSecondary }]}>{ref.citation}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Progress({ step, labels }: { step: number; labels: readonly string[] }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.progressHead}>
        <Text style={[styles.caption, { color: colors.textSecondary }]}>Step {step + 1} of {labels.length}</Text>
        <Text style={[styles.caption, { color: colors.textSecondary }]}>{labels[step]}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {labels.map((_, i) => (
          <View key={i} style={[styles.progressBar, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
        ))}
      </View>
    </View>
  );
}

export function Question({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack?: () => void; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={[styles.questionTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {children}
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function OptionCard({
  label, help, selected, onPress, image, wide = false,
}: { label: string; help?: string; selected?: boolean; onPress: () => void; image?: any; wide?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.option,
        wide ? styles.optionWide : styles.optionHalf,
        {
          backgroundColor: selected ? colors.primaryLight : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 1.5 : 1,
        },
      ]}
    >
      {selected ? (
        <View style={[styles.optionCheck, { backgroundColor: colors.primary }]}>
          <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
        </View>
      ) : null}
      {image ? <Image source={image} style={styles.optionImage} resizeMode="contain" /> : null}
      <Text style={[styles.optionLabel, { color: selected ? colors.primaryInk : colors.text, textAlign: wide ? 'left' : 'center', paddingRight: wide && selected ? 26 : 0 }]}>{label}</Text>
      {help ? <Text style={[styles.optionHelp, { color: colors.textSecondary, textAlign: wide ? 'left' : 'center' }]}>{help}</Text> : null}
    </TouchableOpacity>
  );
}

export function OptionGrid({ children }: { children: ReactNode }) {
  return <View style={styles.optionGrid}>{children}</View>;
}

export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={[styles.checkRow, {
        backgroundColor: checked ? colors.primaryLight : colors.surface,
        borderColor: checked ? colors.primary : colors.border,
      }]}
    >
      <View style={[styles.checkBox, checked
        ? { backgroundColor: colors.primary, borderColor: colors.primary }
        : { borderColor: colors.controlBorder, backgroundColor: colors.surface }]}>
        {checked ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
      </View>
      <Text style={[styles.bodyText, { color: colors.text, flex: 1 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.primaryBtn, { backgroundColor: disabled ? colors.textTertiary : colors.primary }]}
    >
      <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={[styles.secondaryBtn, { borderColor: colors.borderStrong }]}>
      <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Live emis.asia products for one or more recommendation tags.
export function ProductRecommendations({ tags }: { tags: string[] }) {
  const colors = useColors();
  const [groups, setGroups] = useState<{ tag: string; heading: string; products: Product[]; moreUrl: string }[] | null>(null);
  const key = tags.join('|');

  useEffect(() => {
    let alive = true;
    setGroups(null);
    Promise.all(tags.map(async t => {
      const r = await getProductsForTag(t, 6).catch(() => null);
      return r ? { tag: t, ...r } : null;
    })).then(res => {
      if (alive) setGroups(res.filter(Boolean) as any);
    });
    return () => { alive = false; };
  }, [key]);

  if (!tags.length) return null;
  if (!groups) {
    return (
      <View style={{ paddingVertical: 16 }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <View style={{ gap: 18 }}>
      {groups.map(g => (
        <View key={g.tag}>
          <View style={styles.recHead}>
            <Text style={[styles.recHeading, { color: colors.text }]}>{g.heading}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(g.moreUrl)}>
              <Text style={[styles.recMore, { color: colors.primary }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {g.products.length === 0 ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Browse this range on emis.asia.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
              {g.products.map(p => (
                <Link key={p.id} href={`/product/${p.handle}`} asChild>
                  <TouchableOpacity style={StyleSheet.flatten([styles.recCard, { backgroundColor: colors.surface, borderColor: colors.border }])}>
                    {p.image ? (
                      <Image source={{ uri: p.image }} style={styles.recImage} resizeMode="contain" />
                    ) : (
                      <View style={[styles.recImage, { backgroundColor: colors.surfaceSunken }]} />
                    )}
                    <Text style={[styles.recTitle, { color: colors.text }]} numberOfLines={2}>{p.title}</Text>
                    <Text style={[styles.recPrice, { color: colors.text }]}>S${p.price}</Text>
                  </TouchableOpacity>
                </Link>
              ))}
            </ScrollView>
          )}
        </View>
      ))}
      <Text style={[styles.compactDisclaimer, { color: colors.textSecondary }]}>
        Product ideas are general options to discuss with your nurse or pharmacist, not a prescription.
      </Text>
    </View>
  );
}

export const clinicalStyles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 48, gap: 20, maxWidth: 720, width: '100%', alignSelf: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
});

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  compactDisclaimer: { fontSize: 13, lineHeight: 18 },
  box: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'flex-start' },
  boxText: { flex: 1, fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletDot: { fontSize: 18, lineHeight: 22 },
  bodyText: { fontSize: 15, lineHeight: 22 },
  flagBox: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  flagHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flagTitle: { fontSize: 16, fontWeight: '700' },
  refBox: { borderRadius: 12, borderWidth: 1, padding: 14 },
  refTitle: { fontSize: 15, fontWeight: '700' },
  refLabel: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  refCitation: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  caption: { fontSize: 12, fontWeight: '600' },
  progressBar: { flex: 1, height: 6, borderRadius: 3 },
  questionTitle: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { fontSize: 15, fontWeight: '600' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { borderRadius: 16, padding: 14, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
  optionCheck: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  optionHalf: { flexBasis: '47%', flexGrow: 1 },
  optionWide: { flexBasis: '100%', alignItems: 'flex-start' },
  optionImage: { width: 72, height: 72, marginBottom: 6 },
  optionLabel: { fontSize: 15, fontWeight: '700' },
  optionHelp: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 56, borderRadius: 14, borderWidth: 1 },
  checkBox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { borderRadius: 14, minHeight: 52, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  recHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recHeading: { fontSize: 15, fontWeight: '700', flex: 1 },
  recMore: { fontSize: 14, fontWeight: '600' },
  recCard: { width: 150, borderRadius: 12, borderWidth: 1, padding: 10 },
  recImage: { width: '100%', height: 100, borderRadius: 8, marginBottom: 8 },
  recTitle: { fontSize: 13, fontWeight: '600', lineHeight: 17, minHeight: 34 },
  recPrice: { fontSize: 14, fontWeight: '700', marginTop: 4 },
});
