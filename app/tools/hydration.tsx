// Stoma output & hydration check, St Mark's solution and food tips.
// Logic: lib/clinical/ostomy.ts (ported unchanged from the reviewed EMIS+ web
// app). Wording from OstomyDiary.tsx. Day-to-day output logging stays in the
// Ostomy Log tool.

import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  assessHydration, classifyOutput, foodGuidance, ST_MARKS_SOLUTION,
  type HydrationAssessment, type HydrationInput, type HydrationStatus, type StomaType, type UrineColour,
} from '@/lib/clinical/ostomy';
import { getRecords } from '@/lib/db';
import {
  useColors, clinicalStyles as cs, Disclaimer, OptionCard, OptionGrid, CheckRow, PrimaryButton,
  RedFlags, References, ProductRecommendations, SectionTitle, Bullets,
} from '@/components/clinical';

const STOMA_TYPES: [StomaType, string][] = [
  ['ileostomy', 'Ileostomy'],
  ['colostomy', 'Colostomy'],
  ['urostomy', 'Urostomy'],
];

const SYMPTOM_LABELS: { key: keyof HydrationInput['symptoms']; label: string }[] = [
  { key: 'thirst', label: 'Feeling very thirsty' },
  { key: 'dryMouth', label: 'Dry mouth or lips' },
  { key: 'dizziness', label: 'Dizzy or lightheaded (especially standing up)' },
  { key: 'fatigue', label: 'Unusually tired' },
  { key: 'headache', label: 'Headache' },
  { key: 'crampingMuscles', label: 'Muscle cramps' },
  { key: 'reducedUrine', label: 'Passing less urine than usual' },
];

const URINE: [UrineColour, string][] = [
  ['pale', 'Pale / clear'],
  ['yellow', 'Yellow'],
  ['dark', 'Dark'],
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function HydrationScreen() {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const resultY = useRef(0);
  const [stomaType, setStomaType] = useState<StomaType>('ileostomy');
  const [output, setOutput] = useState('');
  const [loggedToday, setLoggedToday] = useState<number | null>(null);
  const [symptoms, setSymptoms] = useState<HydrationInput['symptoms']>({
    thirst: false, dryMouth: false, dizziness: false, fatigue: false, headache: false, crampingMuscles: false, reducedUrine: false,
  });
  const [urineColour, setUrineColour] = useState<UrineColour>('yellow');
  const [assessment, setAssessment] = useState<HydrationAssessment | null>(null);

  // Prefill today's total from the Ostomy Log, if the person uses it.
  useEffect(() => {
    getRecords('ostomy_records', 200).then(rows => {
      const total = rows
        .filter(r => String(r.date || '').slice(0, 10) === today())
        .reduce((sum, r) => sum + (Number(r.output_amount) || 0), 0);
      if (total > 0) {
        setLoggedToday(total);
        setOutput(String(Math.round(total)));
      }
    }).catch(() => { /* log not available */ });
  }, []);

  const outputMl = output ? parseFloat(output) : NaN;
  const hasOutput = Number.isFinite(outputMl) && outputMl >= 0;
  const classification = hasOutput ? classifyOutput(outputMl, stomaType) : null;
  const food = foodGuidance(stomaType);

  function check() {
    setAssessment(assessHydration({ symptoms, urineColour, outputMl: hasOutput ? outputMl : undefined, stomaType }));
    setTimeout(() => scrollRef.current?.scrollTo({ y: resultY.current, animated: true }), 50);
  }

  const statusTone: Record<HydrationStatus, { bg: string; fg: string }> = {
    'likely-ok': { bg: colors.successBg, fg: colors.success },
    watch: { bg: colors.warningBg, fg: colors.warning },
    concern: { bg: colors.accentLight, fg: colors.accent },
    urgent: { bg: colors.dangerBg, fg: colors.danger },
  };

  return (
    <SafeAreaView style={[cs.screen, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={cs.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <SectionTitle>Stoma type</SectionTitle>
          <OptionGrid>
            {STOMA_TYPES.map(([value, label]) => (
              <OptionCard key={value} label={label} selected={stomaType === value} onPress={() => setStomaType(value)} />
            ))}
          </OptionGrid>
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Output today (mL)</SectionTitle>
          <TextInput value={output} onChangeText={setOutput} keyboardType="number-pad" placeholder="e.g. 900"
            placeholderTextColor={colors.textTertiary} accessibilityLabel="Output today in millilitres"
            style={{ borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.text, backgroundColor: colors.surface }} />
          {loggedToday !== null ? (
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>Filled in from today's Ostomy Log entries ({Math.round(loggedToday)} mL).</Text>
          ) : null}
          {classification ? (
            <View style={[cs.card, { backgroundColor: colors.surface, borderColor: classification.level === 'normal' ? colors.border : colors.warning + '88' }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{classification.headline}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>{classification.detail}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 10 }}>
          <SectionTitle>Hydration check</SectionTitle>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
            Tick anything you're noticing today and pick your urine colour. This is a simple guide, not a diagnosis.
          </Text>
          {SYMPTOM_LABELS.map(({ key, label }) => (
            <CheckRow key={key} label={label} checked={symptoms[key]} onChange={v => setSymptoms(s => ({ ...s, [key]: v }))} />
          ))}
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 4 }}>Urine colour</Text>
          <OptionGrid>
            {URINE.map(([value, label]) => (
              <OptionCard key={value} label={label} selected={urineColour === value} onPress={() => setUrineColour(value)} />
            ))}
          </OptionGrid>
          <PrimaryButton label="Check hydration" onPress={check} />
        </View>

        {assessment && (
          <View onLayout={e => { resultY.current = e.nativeEvent.layout.y; }} style={{ gap: 14 }}>
            <View style={[cs.card, { backgroundColor: statusTone[assessment.status].bg, borderColor: statusTone[assessment.status].fg + '55' }]}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{assessment.headline}</Text>
              <Bullets items={assessment.advice} color={statusTone[assessment.status].fg} />
            </View>
            <RedFlags items={assessment.redFlags} />
            <References ids={assessment.references} />
          </View>
        )}

        {stomaType !== 'urostomy' && (
          <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionTitle>{ST_MARKS_SOLUTION.name}</SectionTitle>
            {ST_MARKS_SOLUTION.ingredients.map(ing => (
              <View key={ing.item} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ fontSize: 14, color: colors.text, flex: 1 }}>{ing.item}</Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, flex: 1, textAlign: 'right' }}>{ing.amount}</Text>
              </View>
            ))}
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>{ST_MARKS_SOLUTION.instructions}</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.warning, fontWeight: '600' }}>Caution: {ST_MARKS_SOLUTION.caution}</Text>
            <References ids={ST_MARKS_SOLUTION.references} title="Recipe source" />
          </View>
        )}

        <View style={{ gap: 12 }}>
          <SectionTitle>Food & fluid tips</SectionTitle>
          {food.thickening.length > 0 && <Guidance title="Foods that may thicken output" items={food.thickening} color={colors.success} />}
          <Guidance title="Limit or be cautious with" items={food.limitOrAvoid} color={colors.warning} />
          <Guidance title="Hydration tips" items={food.hydrationTips} color={colors.info} />
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.textSecondary }}>Caution: {food.caution}</Text>
          <References ids={food.references} title="Sources for food guidance" />
        </View>

        <ProductRecommendations tags={['oral-rehydration', 'ostomy-supplies']} />
        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

function Guidance({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colors = useColors();
  return (
    <View style={[cs.card, { backgroundColor: colors.surface, borderColor: color + '55' }]}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{title}</Text>
      <Bullets items={items} color={color} />
    </View>
  );
}
