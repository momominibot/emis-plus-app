import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { insertRecord, getRecords, deleteRecord } from '@/lib/db';
import { IntakeOutputRecord } from '@/lib/types';

export default function IntakeOutputScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState<IntakeOutputRecord[]>([]);
  const [type, setType] = useState<'intake' | 'output'>('intake');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    const r = await getRecords('intake_output');
    setRecords(r as IntakeOutputRecord[]);
  }

  async function save() {
    const now = new Date();
    await insertRecord('intake_output', {
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0].slice(0, 5),
      type,
      category: category || (type === 'intake' ? 'Water' : 'Urine'),
      amount: parseFloat(amount) || 0,
      notes,
    });
    setCategory(''); setAmount(''); setNotes('');
    setShowForm(false);
    loadRecords();
  }

  async function remove(id: number) {
    await deleteRecord('intake_output', id);
    loadRecords();
  }

  const today = records.filter(r => r.date === new Date().toISOString().split('T')[0]);
  const totalIntake = today.filter(r => r.type === 'intake').reduce((s, r) => s + (r.amount || 0), 0);
  const totalOutput = today.filter(r => r.type === 'output').reduce((s, r) => s + (r.amount || 0), 0);

  const intakeCategories = ['Water', 'Food', 'IV Fluid', 'Other'];
  const outputCategories = ['Urine', 'Stool', 'Vomit', 'Drain', 'Other'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ title: 'Intake & Output' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: '#3b82f620' }]}>
            <Text style={[styles.summaryLabel, { color: '#3b82f6' }]}>Intake Today</Text>
            <Text style={[styles.summaryValue, { color: '#3b82f6' }]}>{totalIntake} ml</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#f59e0b20' }]}>
            <Text style={[styles.summaryLabel, { color: '#f59e0b' }]}>Output Today</Text>
            <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>{totalOutput} ml</Text>
          </View>
        </View>
        <Text style={[styles.balance, { color: colors.text }]}>
          Balance: {totalIntake - totalOutput} ml {totalIntake - totalOutput >= 0 ? '(+)' : '(-)'}
        </Text>

        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowForm(!showForm)}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{showForm ? 'Cancel' : '+ Add Entry'}</Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.typeToggle}>
              {(['intake', 'output'] as const).map(t => (
                <TouchableOpacity key={t} style={[styles.typeBtn, type === t && { backgroundColor: t === 'intake' ? '#3b82f6' : '#f59e0b' }]} onPress={() => setType(t)}>
                  <Text style={[styles.typeText, type === t && { color: '#fff' }]}>{t === 'intake' ? 'Intake ↓' : 'Output ↑'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Category</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(type === 'intake' ? intakeCategories : outputCategories).map(c => (
                <TouchableOpacity key={c} style={[styles.chip, category === c && { backgroundColor: colors.primary }]} onPress={() => setCategory(c)}>
                  <Text style={[styles.chipText, category === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Amount (ml)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={amount} onChangeText={setAmount} placeholder="e.g. 250" placeholderTextColor={colors.textSecondary} />
            <Text style={[styles.label, { color: colors.text }]}>Notes (optional)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} value={notes} onChangeText={setNotes} placeholderTextColor={colors.textSecondary} />
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={save}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
          </View>
        )}

        {today.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No entries today.</Text>
        ) : (
          today.map(r => (
            <View key={r.id} style={[styles.record, { backgroundColor: colors.surface, borderLeftColor: r.type === 'intake' ? '#3b82f6' : '#f59e0b' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recordTitle, { color: colors.text }]}>{r.category} - {r.amount}ml</Text>
                <Text style={[styles.recordMeta, { color: colors.textSecondary }]}>{r.time} | {r.type}</Text>
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
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  summaryCard: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  summaryLabel: { fontSize: 13, fontWeight: '600' },
  summaryValue: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  balance: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginBottom: 16 },
  addBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  card: { borderRadius: 14, padding: 16, gap: 6, marginBottom: 16 },
  typeToggle: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center' },
  typeText: { fontWeight: '700', color: '#475569' },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  input: { padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#e2e8f0' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  btn: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  empty: { textAlign: 'center', padding: 40, fontSize: 14 },
  record: { flexDirection: 'row', padding: 14, borderRadius: 10, marginBottom: 8, borderLeftWidth: 4, gap: 10, alignItems: 'center' },
  recordTitle: { fontSize: 14, fontWeight: '700' },
  recordMeta: { fontSize: 12, marginTop: 2 },
});
