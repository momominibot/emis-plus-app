import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { exportToCSV, exportBackup, shareFile, generateDoctorSummary } from '@/lib/export';
import { importData, clearAllMedicalData } from '@/lib/db';

export default function ExportScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [exporting, setExporting] = useState(false);

  async function handleExport(table: string, label: string) {
    try {
      setExporting(true);
      const path = await exportToCSV(table, `emis_${table}`);
      await shareFile(path);
    } catch (e: any) {
      Alert.alert('Export failed', e.message || 'No records to export');
    } finally {
      setExporting(false);
    }
  }

  async function handleDoctorSummary() {
    try {
      setExporting(true);
      const path = await generateDoctorSummary();
      await shareFile(path, 'text/plain');
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleBackup() {
    try {
      setExporting(true);
      const path = await exportBackup();
      await shareFile(path, 'application/json');
      Alert.alert('Backup created', 'Share this file to your new device and import it there. All data stays local.');
    } catch (e: any) {
      Alert.alert('Backup failed', e.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    Alert.alert(
      'Import Data',
      'To import data from another device, open the backup JSON file on this device using the share menu. The app will detect and import it.',
    );
  }

  async function handleClear() {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all medical records on this device. This cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete All', style: 'destructive', onPress: async () => {
          await clearAllMedicalData();
          Alert.alert('Done', 'All local medical data has been cleared.');
        }},
      ]
    );
  }

  const exports = [
    { id: 'wound_records', label: 'Wound Records', desc: 'CSV for doctor', icon: 'Wound' },
    { id: 'ostomy_records', label: 'Ostomy Log', desc: 'CSV for doctor', icon: 'Ostomy' },
    { id: 'intake_output', label: 'Intake & Output', desc: 'CSV for doctor', icon: 'Fluids' },
    { id: 'vitals', label: 'Vitals History', desc: 'CSV for doctor', icon: 'Vitals' },
    { id: 'compression_measurements', label: 'Compression Measurements', desc: 'CSV for doctor', icon: 'Leg' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ title: 'Export & Transfer' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={[styles.notice, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.noticeText, { color: colors.primaryInk }]}>
            🔒 All exports happen on your device. Data is shared via your phone's share sheet - we never upload or store your medical data.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Share with Doctor</Text>
        <TouchableOpacity style={[styles.summaryBtn, { backgroundColor: colors.primary }]} onPress={handleDoctorSummary} disabled={exporting}>
          <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 16 }}>📄 Generate Doctor Summary</Text>
          <Text style={{ color: colors.onPrimary, fontSize: 13, marginTop: 4 }}>All records in one readable report</Text>
        </TouchableOpacity>

        <View style={{ gap: 8, marginTop: 12 }}>
          {exports.map(e => (
            <TouchableOpacity key={e.id} style={[styles.exportItem, { backgroundColor: colors.surface }]} onPress={() => handleExport(e.id, e.label)}>
              <Text style={{ fontSize: 22 }}>{e.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exportLabel, { color: colors.text }]}>{e.label}</Text>
                <Text style={[styles.exportDesc, { color: colors.textSecondary }]}>{e.desc}</Text>
              </View>
              <Text style={{ color: colors.primary, fontSize: 18 }}>→</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Device Transfer</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Move to a new phone</Text>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            Export a backup file, send it to your new device (AirDrop, email, messaging), and import it there. No cloud, no account.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleBackup}>
            <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>📤 Export Backup File</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnOutline, { borderColor: colors.primary }]} onPress={handleImport}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>📥 Import from Backup</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Data Management</Text>
        <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.danger }]} onPress={handleClear}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>🗑 Clear All Local Data</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  notice: { borderRadius: 12, padding: 14, marginBottom: 16 },
  noticeText: { fontSize: 12, lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  summaryBtn: { borderRadius: 14, padding: 18, alignItems: 'center' },
  exportItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 },
  exportLabel: { fontSize: 15, fontWeight: '600' },
  exportDesc: { fontSize: 12, marginTop: 2 },
  card: { borderRadius: 14, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  btn: { padding: 14, borderRadius: 10, alignItems: 'center' },
  btnOutline: { padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  dangerBtn: { padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, marginTop: 8 },
});
