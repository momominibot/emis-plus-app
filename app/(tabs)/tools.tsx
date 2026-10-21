import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { TabHeader, ui } from '@/components/ui';
import { TAB_BAR_SPACE } from '@/components/FloatingTabBar';
import { Drift } from '@/components/Motion';

const TOOL_GROUPS = [
  {
    title: 'Check & choose',
    tools: [
      { id: 'wound-advisor', title: 'Wound Product Advisor', desc: 'Find the right dressing in 5 questions', icon: 'bandage', route: '/tools/wound-advisor' },
      { id: 'peristomal', title: 'Stoma Skin Check', desc: 'Score the skin around your stoma', icon: 'shield-checkmark', route: '/tools/peristomal' },
      { id: 'hydration', title: 'Stoma Output & Hydration', desc: 'Check output and signs of dehydration', icon: 'water', route: '/tools/hydration' },
      { id: 'wound-nutrition', title: 'Wound Nutrition', desc: 'Daily protein, energy and fluid targets', icon: 'nutrition', route: '/tools/wound-nutrition' },
    ],
  },
  {
    title: 'Record',
    tools: [
      { id: 'wound', title: 'Wound Tracker', desc: 'Log measurements & photos', icon: 'clipboard', route: '/tools/wound' },
      { id: 'ostomy', title: 'Ostomy Log', desc: 'Track output & changes', icon: 'list', route: '/tools/ostomy' },
      { id: 'intake-output', title: 'Intake & Output', desc: 'Record fluids in and out', icon: 'canteen', route: '/tools/intake-output' },
      { id: 'vitals', title: 'Vitals Monitor', desc: 'BP, HR, temp, SpO2, sugar', icon: 'pulse', route: '/tools/vitals' },
    ],
  },
  {
    title: 'Measure',
    tools: [
      { id: 'compression', title: 'Compression Sizing', desc: 'Measure & find your size', icon: 'fitness', route: '/tools/compression' },
    ],
  },
  {
    title: 'Share',
    tools: [
      { id: 'export', title: 'Export & Transfer', desc: 'Share with doctor or new device', icon: 'share-outline', route: '/tools/export' },
    ],
  },
];

export default function ToolsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}>
        <TabHeader title="Health tools" subtitle="Guided checks and private records" />

        {/* Banner */}
        <View style={[styles.banner, { backgroundColor: colors.primaryLight }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.bannerTitle, { color: colors.primaryDark }]}>Choose well, track clearly</Text>
            <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
              Quick checks point you to the right product type. Records stay on this phone and are never uploaded.
            </Text>
            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed" size={14} color={colors.primaryDark} />
              <Text style={[styles.privacyText, { color: colors.primaryDark }]}>Private by design</Text>
            </View>
          </View>
          <Drift amplitude={4} duration={5400} tilt={1.5} scale={0.02}>
            <Image source={require('@/assets/images/art/banner-tools.webp')} style={styles.bannerArt} resizeMode="contain" />
          </Drift>
        </View>

        {TOOL_GROUPS.map(group => (
          <View key={group.title} style={{ marginTop: 20 }}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>{group.title}</Text>
            <View style={{ marginHorizontal: 20, gap: 10 }}>
              {group.tools.map(tool => (
                <Link key={tool.id} href={tool.route as any} asChild>
                  <TouchableOpacity style={StyleSheet.flatten([styles.toolRow, { backgroundColor: colors.surface, borderColor: colors.border }, ui.cardShadow])}>
                    <View style={[styles.toolIcon, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name={tool.icon as any} size={24} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.toolTitle, { color: colors.text }]}>{tool.title}</Text>
                      <Text style={[styles.toolDesc, { color: colors.textSecondary }]}>{tool.desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </Link>
              ))}
            </View>
          </View>
        ))}

        {/* Disclaimer */}
        <View style={[styles.disclaimer, { backgroundColor: colors.surfaceSunken }]}>
          <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
          <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
            These tools are for personal record-keeping only. They do not provide medical diagnosis. Consult your doctor for medical advice.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: '700', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 16, borderRadius: 20, gap: 10 },
  bannerTitle: { fontSize: 18, fontWeight: '800' },
  bannerText: { fontSize: 13, lineHeight: 18 },
  bannerArt: { width: 96, height: 96 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  privacyText: { fontSize: 12, fontWeight: '700' },
  groupTitle: { fontSize: 17, fontWeight: '800', paddingHorizontal: 20, marginBottom: 10 },
  toolRow: { flexDirection: 'row', alignItems: 'center', minHeight: 76, padding: 14, borderRadius: 18, borderWidth: 1, gap: 14 },
  toolIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolTitle: { fontSize: 16, fontWeight: '600' },
  toolDesc: { fontSize: 13, marginTop: 2 },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', margin: 20, padding: 14, borderRadius: 12, gap: 8 },
  disclaimerText: { fontSize: 13, lineHeight: 18, flex: 1 },
});
