// Wound nutrition calculator: daily protein, energy and fluid estimates for
// someone healing a wound. Logic: lib/clinical/wound-nutrition.ts (ported
// unchanged from the reviewed EMIS+ web app). Wording from
// WoundNutritionCalculator.tsx.

import { useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  calculateWoundNutrition, bmi as computeBmi,
  type WoundNutritionResult, type WoundSeverity,
} from '@/lib/clinical/wound-nutrition';
import {
  useColors, clinicalStyles as cs, Disclaimer, OptionCard, OptionGrid, CheckRow, PrimaryButton,
  References, ProductRecommendations, SectionTitle,
} from '@/components/clinical';

const LB_PER_KG = 2.20462;
type Unit = 'kg' | 'lb';

const SEVERITY_OPTIONS: { value: WoundSeverity; label: string }[] = [
  { value: 'at-risk', label: 'At risk / small superficial wound' },
  { value: 'established', label: 'Established wound (e.g. stage 2)' },
  { value: 'severe', label: 'Large, multiple, or deep wound (stage 3 to 4)' },
];

export default function WoundNutritionScreen() {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const resultY = useRef(0);
  const [unit, setUnit] = useState<Unit>('kg');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [severity, setSeverity] = useState<WoundSeverity>('established');
  const [malnourished, setMalnourished] = useState(false);
  const [renalImpairment, setRenalImpairment] = useState(false);
  const [fluidRestricted, setFluidRestricted] = useState(false);
  const [result, setResult] = useState<WoundNutritionResult | null>(null);
  const [bmiValue, setBmiValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate() {
    setError(null);
    const raw = parseFloat(weight);
    if (!raw || raw <= 0) { setError('Please enter a valid weight.'); setResult(null); return; }
    const weightKg = unit === 'lb' ? raw / LB_PER_KG : raw;
    if (weightKg < 20 || weightKg > 400) { setError('That weight looks out of range. Please double-check.'); setResult(null); return; }
    const h = height ? parseFloat(height) : undefined;
    const heightCm = h && h > 0 ? h : undefined;
    setResult(calculateWoundNutrition({ weightKg, heightCm, severity, malnourished, renalImpairment, fluidRestricted }));
    setBmiValue(computeBmi(weightKg, heightCm));
    setTimeout(() => scrollRef.current?.scrollTo({ y: resultY.current, animated: true }), 50);
  }

  const inputStyle = {
    flex: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 17, color: colors.text, backgroundColor: colors.surface,
  } as const;

  return (
    <SafeAreaView style={[cs.screen, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={cs.content} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textSecondary }}>
          Estimate how much protein, energy and fluid your body may need each day while a wound heals.
        </Text>

        <View style={{ gap: 8 }}>
          <SectionTitle>Body weight</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad"
              placeholder={unit === 'kg' ? 'e.g. 65' : 'e.g. 143'} placeholderTextColor={colors.textTertiary}
              style={inputStyle} accessibilityLabel="Body weight" />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['kg', 'lb'] as Unit[]).map(u => (
                <OptionCard key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
              ))}
            </View>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Height (cm), optional</SectionTitle>
          <TextInput value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="e.g. 170"
            placeholderTextColor={colors.textTertiary} style={inputStyle} accessibilityLabel="Height in centimetres" />
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Wound situation</SectionTitle>
          <OptionGrid>
            {SEVERITY_OPTIONS.map(o => (
              <OptionCard key={o.value} wide label={o.label} selected={severity === o.value} onPress={() => setSeverity(o.value)} />
            ))}
          </OptionGrid>
        </View>

        <View style={{ gap: 10 }}>
          <CheckRow checked={malnourished} onChange={setMalnourished} label="I've been told I'm malnourished or at risk of it" />
          <CheckRow checked={renalImpairment} onChange={setRenalImpairment} label="I have kidney disease" />
          <CheckRow checked={fluidRestricted} onChange={setFluidRestricted} label="My clinician has limited how much fluid I can drink" />
        </View>

        {error ? <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>{error}</Text> : null}
        <PrimaryButton label="Calculate" onPress={calculate} />

        {result && (
          <View onLayout={e => { resultY.current = e.nativeEvent.layout.y; }} style={{ gap: 20 }}>
            <Results result={result} bmiValue={bmiValue} />
          </View>
        )}
        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

function Results({ result, bmiValue }: { result: WoundNutritionResult; bmiValue: number | null }) {
  const colors = useColors();
  // One supplements group: emis.asia has no per-nutrient products.
  const productTags = result.micronutrients.length > 0 ? ['wound-supplements'] : [];
  return (
    <>
      <SectionTitle>Your estimated daily targets</SectionTitle>
      {bmiValue !== null && <BmiContext value={bmiValue} />}
      {result.warnings.map((w, i) => (
        <View key={i} style={[cs.card, { backgroundColor: colors.dangerBg, borderColor: colors.danger + '55' }]}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: '600' }}>{w}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Target title="Protein" range={`${result.protein.low} to ${result.protein.high}`} unit={result.protein.unit} />
        <Target title="Energy" range={`${result.energy.low} to ${result.energy.high}`} unit={result.energy.unit} />
        <Target title="Fluid" range={result.fluid ? `${result.fluid.low} to ${result.fluid.high}` : 'Per your limit'} unit={result.fluid ? result.fluid.unit : ''} />
      </View>

      {result.micronutrients.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionTitle>Supportive supplements to consider</SectionTitle>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
            These are adjuncts that may help when wounds are slow to heal and diet alone isn't enough, not replacements
            for good food. Ask your dietitian whether they're right for you.
          </Text>
          {result.micronutrients.map(m => (
            <View key={m.name} style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{m.name}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>{m.dose}</Text>
              </View>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>{m.rationale}</Text>
              {m.caution ? <Text style={{ fontSize: 13, lineHeight: 19, color: colors.warning, fontWeight: '600' }}>Caution: {m.caution}</Text> : null}
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: 6 }}>
        {result.notes.map((n, i) => (
          <Text key={i} style={{ fontSize: 13, lineHeight: 19, color: colors.textSecondary }}>{'•'} {n}</Text>
        ))}
      </View>

      <ProductRecommendations tags={productTags} />
      <References ids={result.references} />
    </>
  );
}

function Target({ title, range, unit }: { title: string; range: string; unit: string }) {
  const colors = useColors();
  return (
    <View style={[cs.card, { flex: 1, backgroundColor: colors.primaryLight, borderColor: colors.primary + '33', padding: 12, alignItems: 'center' }]}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primaryDark }}>{title}</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{range}</Text>
      <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>{unit}</Text>
    </View>
  );
}

function BmiContext({ value }: { value: number }) {
  const colors = useColors();
  let message: string;
  let bg = colors.surface;
  if (value < 18.5) {
    bg = colors.warningBg;
    message = 'This is in the underweight range. Being underweight can slow wound healing. Please ask your doctor for a referral to a dietitian.';
  } else if (value >= 30) {
    bg = colors.infoBg;
    message = 'Targets here use your current body weight. If your weight is well above your usual healthy weight, your dietitian may adjust the figures.';
  } else {
    message = 'This is within the typical healthy range.';
  }
  return (
    <View style={[cs.card, { backgroundColor: bg, borderColor: colors.border }]}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>
        <Text style={{ fontWeight: '700' }}>BMI {value}. </Text>{message}
      </Text>
    </View>
  );
}
