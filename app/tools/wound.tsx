import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { insertRecord, getRecords, deleteRecord } from '@/lib/db';
import { WoundRecord } from '@/lib/types';

export default function WoundScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState<WoundRecord[]>([]);
  const [location, setLocation] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [exudate, setExudate] = useState<WoundRecord['exudate']>('light');
  const [notes, setNotes] = useState('');

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    const r = await getRecords('wound_records');
    setRecords(r as WoundRecord[]);
  }

  async function save() {
    if (!location) { Alert.alert('Location required', 'Please enter wound location.'); return; }
    await insertRecord('wound_records', {
      date: new Date().toISOString(),
      location,
      length: parseFloat(length) || 0,
      width: parseFloat(width) || 0,
      depth: parseFloat(depth) || 0,
      exudate,
      tissue_type: '',
      notes,
    });
    setLocation(''); setLength(''); setWidth(''); setDepth(''); setNotes('');
    setShowForm(false);
    loadRecords();
  }

  async function remove(id: number) {
    await deleteRecord('wound_records', id);
    loadRecords();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ title: 'Wound Tracker' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowForm(!showForm)}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{showForm ? 'Cancel' : '+ Add Wound Record'}</Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.label, { color: colors.text }]}>Location</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} value={location} onChangeText={setLocation} placeholder="e.g. Left lower leg" placeholderTextColor={colors.textSecondary} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Length (cm)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="decimal-pad" value={length} onChangeText={setLength} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Width (cm)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="decimal-pad" value={width} onChangeText={setWidth} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Depth (cm)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="decimal-pad" value={depth} onChangeText={setDepth} />
              </View>
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Exudate</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(['none', 'light', 'moderate', 'heavy'] as const).map(e => (
                <TouchableOpacity key={e} style={[styles.chip, exudate === e && { backgroundColor: colors.primary }]} onPress={() => setExudate(e)}>
                  <Text style={[styles.chipText, exudate === e && { color: '#fff' }]}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border, height: 60 }]} value={notes} onChangeText={setNotes} multiline placeholder="Observations, dressing used..." placeholderTextColor={colors.textSecondary} />
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={save}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Save Record</Text>
            </TouchableOpacity>
          </View>
        )}

        {records.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No wound records yet. Tap "Add Wound Record" to start tracking.</Text>
        ) : (
          records.map(r => (
            <View key={r.id} style={[styles.record, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recordTitle, { color: colors.text }]}>{r.location}</Text>
                <Text style={[styles.recordMeta, { color: colors.textSecondary }]}>
                  {new Date(r.date).toLocaleDateString('en-SG')} | {r.length}x{r.width}x{r.depth}cm | {r.exudate} exudate
                </Text>
                {r.notes ? <Text style={[styles.recordNotes, { color: colors.text }]}>{r.notes}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => remove(r.id)}>
                <Text style={{ color: colors.danger, fontSize: 18 }}>🗑</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  card: { borderRadius: 14, padding: 16, gap: 6, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  input: { padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#e2e8f0' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  btn: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  empty: { textAlign: 'center', padding: 40, fontSize: 14 },
  record: { flexDirection: 'row', padding: 14, borderRadius: 12, marginBottom: 10, gap: 10 },
  recordTitle: { fontSize: 15, fontWeight: '700' },
  recordMeta: { fontSize: 12, marginTop: 2 },
  recordNotes: { fontSize: 13, marginTop: 6 },
});
