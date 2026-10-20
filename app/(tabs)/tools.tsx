import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@/components/Icon';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const TOOL_GROUPS = [
  {
    title: 'Record',
    tools: [
      { id: 'wound', title: 'Wound Tracker', desc: 'Log measurements & photos', icon: 'bandage', route: '/tools/wound' },
      { id: 'ostomy', title: 'Ostomy Log', desc: 'Track output & changes', icon: 'water', route: '/tools/ostomy' },
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
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={[styles.title, { color: colors.text }]}>Health tools</Text>

        {/* Privacy banner */}
        <View style={[styles.privacyBanner, { backgroundColor: colors.primaryLight }]}>
          <Icon name="lock-closed" size={18} color={colors.primaryDark} />
          <Text style={[styles.privacyText, { color: colors.primaryDark }]}>
            Your records stay on this phone. We never upload them.
          </Text>
        </View>

        {TOOL_GROUPS.map(group => (
          <View key={group.title} style={{ marginTop: 20 }}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>{group.title}</Text>
            <View style={{ marginHorizontal: 20, gap: 10 }}>
              {group.tools.map(tool => (
                <Link key={tool.id} href={tool.route as any} asChild>
                  <TouchableOpacity style={[styles.toolRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.toolIcon, { backgroundColor: colors.primaryLight }]}>
                      <Icon name={tool.icon as any} size={24} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.toolTitle, { color: colors.text }]}>{tool.title}</Text>
                      <Text style={[styles.toolDesc, { color: colors.textSecondary }]}>{tool.desc}</Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </Link>
              ))}
            </View>
          </View>
        ))}

        {/* Disclaimer */}
        <View style={[styles.disclaimer, { backgroundColor: colors.surfaceSunken }]}>
          <Icon name="information-circle" size={16} color={colors.textSecondary} />
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
  privacyBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 14, borderRadius: 12, gap: 10 },
  privacyText: { fontSize: 14, fontWeight: '500', flex: 1 },
  groupTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginBottom: 10 },
  toolRow: { flexDirection: 'row', alignItems: 'center', minHeight: 76, padding: 14, borderRadius: 16, borderWidth: 1, gap: 14 },
  toolIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolTitle: { fontSize: 16, fontWeight: '600' },
  toolDesc: { fontSize: 13, marginTop: 2 },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', margin: 20, padding: 14, borderRadius: 12, gap: 8 },
  disclaimerText: { fontSize: 13, lineHeight: 18, flex: 1 },
});
