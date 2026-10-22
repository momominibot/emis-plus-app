import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { insertRecord, getRecords, deleteRecord } from '@/lib/db';
import { VitalsRecord } from '@/lib/types';

export default function VitalsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState<VitalsRecord[]>([]);
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [temperature, setTemperature] = useState('');
  const [oxygen, setOxygen] = useState('');
  const [bloodSugar, setBloodSugar] = useState('');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    const r = await getRecords('vitals');
    setRecords(r as VitalsRecord[]);
  }

  async function save() {
    const now = new Date();
    await insertRecord('vitals', {
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0].slice(0, 5),
      systolic: parseInt(systolic) || null,
      diastolic: parseInt(diastolic) || null,
      heart_rate: parseInt(heartRate) || null,
      temperature: parseFloat(temperature) || null,
      oxygen_saturation: parseInt(oxygen) || null,
      blood_sugar: parseFloat(bloodSugar) || null,
      weight: parseFloat(weight) || null,
      notes,
    });
    setSystolic(''); setDiastolic(''); setHeartRate(''); setTemperature('');
    setOxygen(''); setBloodSugar(''); setWeight(''); setNotes('');
    setShowForm(false);
    loadRecords();
  }

  async function remove(id: number) {
    await deleteRecord('vitals', id);
    loadRecords();
  }

  const latest = records[0];

  function bpStatus(sys?: number, dia?: number) {
    if (!sys || !dia) return null;
    if (sys >= 180 || dia >= 120) return { label: 'Hypertensive Crisis', color: '#ef4444' };
    if (sys >= 140 || dia >= 90) return { label: 'High', color: '#f59e0b' };
    if (sys < 90 || dia < 60) return { label: 'Low', color: '#3b82f6' };
    return { label: 'Normal', color: '#22c55e' };
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ title: 'Vitals Monitor' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {latest && (
          <View style={[styles.latestCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.latestLabel, { color: colors.textSecondary }]}>Latest Reading</Text>
            <Text style={[styles.latestDate, { color: colors.text }]}>
              {latest.date} {latest.time}
            </Text>
            <View style={styles.vitalsGrid}>
              {latest.systolic && (
                <View style={styles.vitalItem}>
                  <Text style={[styles.vitalValue, { color: colors.text }]}>{latest.systolic}/{latest.diastolic}</Text>
                  <Text style={[styles.vitalLabel, { color: colors.textSecondary }]}>BP mmHg</Text>
                  {bpStatus(latest.systolic, latest.diastolic) && (
                    <Text style={[styles.vitalStatus, { color: bpStatus(latest.systolic, latest.diastolic)!.color }]}>
                      {bpStatus(latest.systolic, latest.diastolic)!.label}
                    </Text>
                  )}
                </View>
              )}
              {latest.heart_rate && (
                <View style={styles.vitalItem}>
                  <Text style={[styles.vitalValue, { color: colors.text }]}>{latest.heart_rate}</Text>
                  <Text style={[styles.vitalLabel, { color: colors.textSecondary }]}>Heart Rate bpm</Text>
                </View>
              )}
              {latest.temperature && (
                <View style={styles.vitalItem}>
                  <Text style={[styles.vitalValue, { color: colors.text }]}>{latest.temperature}°</Text>
                  <Text style={[styles.vitalLabel, { color: colors.textSecondary }]}>Temp °C</Text>
                </View>
              )}
              {latest.oxygen_saturation && (
                <View style={styles.vitalItem}>
                  <Text style={[styles.vitalValue, { color: colors.text }]}>{latest.oxygen_saturation}%</Text>
                  <Text style={[styles.vitalLabel, { color: colors.textSecondary }]}>SpO2</Text>
                </View>
              )}
              {latest.blood_sugar && (
                <View style={styles.vitalItem}>
                  <Text style={[styles.vitalValue, { color: colors.text }]}>{latest.blood_sugar}</Text>
                  <Text style={[styles.vitalLabel, { color: colors.textSecondary }]}>Blood Sugar</Text>
                </View>
              )}
              {latest.weight && (
                <View style={styles.vitalItem}>
                  <Text style={[styles.vitalValue, { color: colors.text }]}>{latest.weight}kg</Text>
                  <Text style={[styles.vitalLabel, { color: colors.textSecondary }]}>Weight</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowForm(!showForm)}>
          <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{showForm ? 'Cancel' : '+ Record Vitals'}</Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Systolic</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={systolic} onChangeText={setSystolic} placeholder="120" placeholderTextColor={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Diastolic</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={diastolic} onChangeText={setDiastolic} placeholder="80" placeholderTextColor={colors.textSecondary} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Heart Rate</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={heartRate} onChangeText={setHeartRate} placeholder="72" placeholderTextColor={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Temp °C</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="decimal-pad" value={temperature} onChangeText={setTemperature} placeholder="36.6" placeholderTextColor={colors.textSecondary} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>SpO2 %</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={oxygen} onChangeText={setOxygen} placeholder="98" placeholderTextColor={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Blood Sugar</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="decimal-pad" value={bloodSugar} onChangeText={setBloodSugar} placeholder="5.5" placeholderTextColor={colors.textSecondary} />
              </View>
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Weight (kg)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} keyboardType="decimal-pad" value={weight} onChangeText={setWeight} placeholder="65" placeholderTextColor={colors.textSecondary} />
            <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]} value={notes} onChangeText={setNotes} placeholderTextColor={colors.textSecondary} />
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={save}>
              <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Save Reading</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>History</Text>
        {records.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No vitals recorded yet.</Text>
        ) : (
          records.slice(0, 20).map(r => (
            <View key={r.id} style={[styles.record, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recordDate, { color: colors.text }]}>{r.date} {r.time}</Text>
                <Text style={[styles.recordDetail, { color: colors.textSecondary }]}>
                  {[r.systolic && `BP ${r.systolic}/${r.diastolic}`, r.heart_rate && `HR ${r.heart_rate}`, r.temperature && `${r.temperature}°C`, r.oxygen_saturation && `SpO2 ${r.oxygen_saturation}%`, r.blood_sugar && `BS ${r.blood_sugar}`, r.weight && `${r.weight}kg`].filter(Boolean).join(' | ')}
                </Text>
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
  latestCard: { borderRadius: 14, padding: 16, marginBottom: 16 },
  latestLabel: { fontSize: 12, fontWeight: '600' },
  latestDate: { fontSize: 14, fontWeight: '700', marginTop: 2, marginBottom: 12 },
  vitalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  vitalItem: { width: '30%', alignItems: 'center' },
  vitalValue: { fontSize: 20, fontWeight: '800' },
  vitalLabel: { fontSize: 11, marginTop: 2 },
  vitalStatus: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  addBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  card: { borderRadius: 14, padding: 16, gap: 6, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  input: { padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  btn: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  empty: { textAlign: 'center', padding: 30, fontSize: 14 },
  record: { flexDirection: 'row', padding: 12, borderRadius: 10, marginBottom: 8, gap: 10, alignItems: 'center' },
  recordDate: { fontSize: 14, fontWeight: '700' },
  recordDetail: { fontSize: 12, marginTop: 2 },
});
