import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { insertRecord, getRecords, deleteRecord } from '@/lib/db';
import { OstomyRecord } from '@/lib/types';

export default function OstomyScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState<OstomyRecord[]>([]);
  const [outputType, setOutputType] = useState('formed');
  const [outputAmount, setOutputAmount] = useState('');
  const [applianceChange, setApplianceChange] = useState(false);
  const [skinCondition, setSkinCondition] = useState('healthy');
  const [notes, setNotes] = useState('');

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    const r = await getRecords('ostomy_records');
    setRecords(r as OstomyRecord[]);
  }

  async function save() {
    await insertRecord('ostomy_records', {
      date: new Date().toISOString(),
      output_type: outputType,
      output_amount: parseFloat(outputAmount) || 0,
      appliance_change: applianceChange,
      skin_condition: skinCondition,
      notes,
    });
    setOutputAmount(''); setNotes(''); setApplianceChange(false);
    setShowForm(false);
    loadRecords();
  }

  async function remove(id: number) {
    await deleteRecord('ostomy_records', id);
    loadRecords();
  }

  const totalToday = records
    .filter(r => new Date(r.date).toDateString() === new Date().toDateString())
    .reduce((sum, r) => sum + (r.output_amount || 0), 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ title: 'Ostomy Log' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={[styles.summary, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.summaryLabel, { color: colors.primary }]}>Today's Output</Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>{totalToday} ml</Text>
        </View>

        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowForm(!showForm)}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{showForm ? 'Cancel' : '+ Log Entry'}</Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.label, { color: colors.text }]}>Output Type</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {['formed', 'semi-formed', 'loose', 'liquid'].map(t => (
                <TouchableOpacity key={t} style={[styles.chip, outputType === t && { backgroundColor: colors.primary }]} onPress={() => setOutputType(t)}>
                  <Text style={[styles.chipText, outputType === t && { color: '#fff' }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Output Amount (ml)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={outputAmount} onChangeText={setOutputAmount} placeholder="e.g. 300" placeholderTextColor={colors.textSecondary} />
            <TouchableOpacity style={[styles.checkbox, { backgroundColor: applianceChange ? colors.primaryLight : colors.background }]} onPress={() => setApplianceChange(!applianceChange)}>
              <Text style={{ color: applianceChange ? colors.primary : colors.text }}>{applianceChange ? '✓' : '○'} Appliance changed today</Text>
            </TouchableOpacity>
            <Text style={[styles.label, { color: colors.text }]}>Skin Condition</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {['healthy', 'irritated', 'broken', 'bleeding'].map(s => (
                <TouchableOpacity key={s} style={[styles.chip, skinCondition === s && { backgroundColor: colors.primary }]} onPress={() => setSkinCondition(s)}>
                  <Text style={[styles.chipText, skinCondition === s && { color: '#fff' }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border, height: 50 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.textSecondary} />
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={save}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Save Entry</Text>
            </TouchableOpacity>
          </View>
        )}

        {records.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No ostomy records yet.</Text>
        ) : (
          records.map(r => (
            <View key={r.id} style={[styles.record, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recordTitle, { color: colors.text }]}>
                  {r.output_amount}ml {r.output_type} {r.appliance_change ? '🔄' : ''}
                </Text>
                <Text style={[styles.recordMeta, { color: colors.textSecondary }]}>
                  {new Date(r.date).toLocaleString('en-SG')} | Skin: {r.skin_condition}
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
  summary: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  summaryLabel: { fontSize: 14, fontWeight: '600' },
  summaryValue: { fontSize: 32, fontWeight: '800', marginTop: 4 },
  addBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  card: { borderRadius: 14, padding: 16, gap: 6, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  input: { padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#e2e8f0' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  checkbox: { padding: 12, borderRadius: 8, marginTop: 8 },
  btn: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  empty: { textAlign: 'center', padding: 40, fontSize: 14 },
  record: { flexDirection: 'row', padding: 14, borderRadius: 12, marginBottom: 10, gap: 10 },
  recordTitle: { fontSize: 15, fontWeight: '700' },
  recordMeta: { fontSize: 12, marginTop: 2 },
  recordNotes: { fontSize: 13, marginTop: 6 },
});
