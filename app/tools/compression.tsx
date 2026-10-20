import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { insertRecord, getRecords } from '@/lib/db';
import { calculateCompressionSize } from '@/lib/export';
import { CompressionMeasurement } from '@/lib/types';

export default function CompressionScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [leg, setLeg] = useState<'left' | 'right'>('left');
  const [ankle, setAnkle] = useState('');
  const [calf, setCalf] = useState('');
  const [thigh, setThigh] = useState('');
  const [length, setLength] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<CompressionMeasurement[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    const records = await getRecords('compression_measurements');
    setHistory(records as CompressionMeasurement[]);
  }

  function calculate() {
    const a = parseFloat(ankle);
    const c = parseFloat(calf);
    if (!a || !c) {
      Alert.alert('Missing measurements', 'Please enter ankle and calf circumference.');
      return;
    }
    const size = calculateCompressionSize(a, c);
    setResult(size);
  }

  async function save() {
    if (!result) return;
    await insertRecord('compression_measurements', {
      date: new Date().toISOString(),
      leg,
      ankle: parseFloat(ankle) || 0,
      calf: parseFloat(calf) || 0,
      thigh: parseFloat(thigh) || 0,
      length: parseFloat(length) || 0,
      recommended_size: result,
    });
    Alert.alert('Saved', `Measurement saved. Recommended size: ${result}`);
    loadHistory();
    setResult(null);
    setAnkle(''); setCalf(''); setThigh(''); setLength('');
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ title: 'Compression Stocking' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>
          Measure in cm. Ankle at narrowest point, calf at widest point.
        </Text>

        <View style={styles.legToggle}>
          {(['left', 'right'] as const).map(l => (
            <TouchableOpacity
              key={l}
              style={[styles.legBtn, leg === l && { backgroundColor: colors.primary }]}
              onPress={() => setLeg(l)}
            >
              <Text style={[styles.legText, leg === l && { color: '#fff' }]}>{l === 'left' ? 'Left Leg' : 'Right Leg'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.text }]}>Ankle circumference (cm)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            keyboardType="decimal-pad"
            value={ankle}
            onChangeText={setAnkle}
            placeholder="e.g. 22"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.label, { color: colors.text }]}>Calf circumference (cm)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            keyboardType="decimal-pad"
            value={calf}
            onChangeText={setCalf}
            placeholder="e.g. 35"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.label, { color: colors.text }]}>Thigh circumference (cm) - optional</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            keyboardType="decimal-pad"
            value={thigh}
            onChangeText={setThigh}
            placeholder="for thigh-high only"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.label, { color: colors.text }]}>Leg length (cm) - optional</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            keyboardType="decimal-pad"
            value={length}
            onChangeText={setLength}
            placeholder="heel to knee"
            placeholderTextColor={colors.textSecondary}
          />

          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={calculate}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Calculate Size</Text>
          </TouchableOpacity>
        </View>

        {result && (
          <View style={[styles.resultCard, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.resultLabel, { color: colors.primary }]}>Recommended Size</Text>
            <Text style={[styles.resultValue, { color: colors.primary }]}>{result}</Text>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, marginTop: 12 }]} onPress={save}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Save Measurement</Text>
            </TouchableOpacity>
          </View>
        )}

        {history.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>History</Text>
            {history.map(h => (
              <View key={h.id} style={[styles.historyItem, { backgroundColor: colors.surface }]}>
                <Text style={[styles.historyDate, { color: colors.textSecondary }]}>
                  {new Date(h.date).toLocaleDateString('en-SG')} - {h.leg} leg
                </Text>
                <Text style={[styles.historyDetail, { color: colors.text }]}>
                  Ankle {h.ankle}cm, Calf {h.calf}cm → Size {h.recommended_size}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  desc: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  legToggle: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  legBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center' },
  legText: { fontWeight: '600', color: '#475569' },
  card: { borderRadius: 14, padding: 16, gap: 8 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 15 },
  btn: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  resultCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginTop: 16 },
  resultLabel: { fontSize: 14, fontWeight: '600' },
  resultValue: { fontSize: 36, fontWeight: '800', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  historyItem: { borderRadius: 10, padding: 12, marginBottom: 8 },
  historyDate: { fontSize: 12 },
  historyDetail: { fontSize: 14, fontWeight: '600', marginTop: 2 },
});
