// Wound Product Advisor: five quick questions, then a dressing category,
// care steps, referral urgency and live emis.asia products.
// Logic: lib/clinical/wound-advisor.ts (ported unchanged from the reviewed
// EMIS+ web app). Question wording carried over from WoundAdvisor.tsx.

import { useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  adviseWound, WOUND_LABEL,
  type Depth, type Exudate, type Infection, type WoundAdvice, type WoundType,
} from '@/lib/clinical/wound-advisor';
import {
  useColors, clinicalStyles as cs, Disclaimer, Progress, Question, OptionCard, OptionGrid, CheckRow,
  PrimaryButton, SecondaryButton, RedFlags, References, ProductRecommendations, SectionTitle, Bullets,
} from '@/components/clinical';

const WOUND_OPTIONS: { value: WoundType; img: any; blurb: string }[] = [
  { value: 'graze', img: require('@/assets/images/wound-advisor/graze.png'), blurb: 'Scrape or road rash' },
  { value: 'cut', img: require('@/assets/images/wound-advisor/cut.png'), blurb: 'Cut or laceration' },
  { value: 'blister', img: require('@/assets/images/wound-advisor/blister.png'), blurb: 'Friction blister' },
  { value: 'surgical', img: require('@/assets/images/wound-advisor/surgical.png'), blurb: 'After an operation / stitches' },
  { value: 'skinTear', img: require('@/assets/images/wound-advisor/skintear.png'), blurb: 'Fragile skin flap' },
  { value: 'burn', img: require('@/assets/images/wound-advisor/burn.png'), blurb: 'Minor burn or scald' },
  { value: 'pressure', img: require('@/assets/images/wound-advisor/pressure.png'), blurb: 'Bed/chair pressure sore' },
  { value: 'diabeticFoot', img: require('@/assets/images/wound-advisor/diabetic-foot.png'), blurb: 'Wound on a diabetic foot' },
  { value: 'legUlcer', img: require('@/assets/images/wound-advisor/leg-ulcer.png'), blurb: 'Long-standing leg wound' },
  { value: 'notSure', img: require('@/assets/images/wound-advisor/not-sure.png'), blurb: 'Help me figure it out' },
];

const EXUDATE_OPTIONS: { value: Exudate; label: string; help: string }[] = [
  { value: 'none', label: 'Dry', help: 'No fluid, looks dry or scabby' },
  { value: 'low', label: 'A little', help: 'Slightly moist or shiny' },
  { value: 'moderate', label: 'Moderate', help: 'Needs a pad, changes daily-ish' },
  { value: 'high', label: 'Very wet', help: 'Soaks through, leaks or drips' },
];

const INFECTION_OPTIONS: { value: Infection; label: string; help: string }[] = [
  { value: 'none', label: 'No signs', help: 'No extra redness, pus, odour or fever' },
  { value: 'local', label: 'Some signs at the wound', help: 'Redness, warmth, swelling, pus, odour or more pain, around the wound only' },
  { value: 'spreading', label: 'Spreading / feeling unwell', help: 'Redness spreading outward, or feeling feverish or unwell' },
];

const DEPTH_OPTIONS: { value: Depth; label: string; help: string }[] = [
  { value: 'surface', label: 'Shallow', help: 'On the surface, you can see the whole base' },
  { value: 'deep', label: 'Deep', help: "A deep hole/cavity, or you can't see the base" },
];

const STEPS = ['Wound', 'Wetness', 'Infection', 'Depth', 'About you'] as const;

const REFER_TEXT: Record<WoundAdvice['refer'], string> = {
  none: '',
  routine: 'Good to have checked',
  soon: 'See a clinician soon',
  urgent: 'Seek medical care now',
};

export default function WoundAdvisorScreen() {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStepRaw] = useState(0);
  const [woundType, setWoundType] = useState<WoundType | null>(null);
  const [exudate, setExudate] = useState<Exudate | null>(null);
  const [infection, setInfection] = useState<Infection | null>(null);
  const [depth, setDepth] = useState<Depth | null>(null);
  const [fragileSkin, setFragileSkin] = useState(false);
  const [diabetic, setDiabetic] = useState(false);
  const [result, setResult] = useState<WoundAdvice | null>(null);

  function setStep(n: number) {
    setStepRaw(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function reset() {
    setWoundType(null); setExudate(null); setInfection(null); setDepth(null);
    setFragileSkin(false); setDiabetic(false); setResult(null); setStep(0);
  }

  function finish() {
    if (!woundType || !exudate || !infection || !depth) return;
    setResult(adviseWound({ woundType, exudate, infection, depth, fragileSkin, diabetic }));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <SafeAreaView style={[cs.screen, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={cs.content}>
        {result ? (
          <Result result={result} onRestart={reset} />
        ) : (
          <>
            <Progress step={step} labels={STEPS} />
            {step === 0 && (
              <Question title="What kind of wound is it?" subtitle="Pick the closest match. You can change it later.">
                <OptionGrid>
                  {WOUND_OPTIONS.map(o => (
                    <OptionCard key={o.value} image={o.img} label={WOUND_LABEL[o.value]} help={o.blurb}
                      selected={woundType === o.value} onPress={() => { setWoundType(o.value); setStep(1); }} />
                  ))}
                </OptionGrid>
              </Question>
            )}
            {step === 1 && (
              <Question title="How wet is the wound?" subtitle="This is the biggest clue to which dressing fits. It should soak up the right amount." onBack={() => setStep(0)}>
                <OptionGrid>
                  {EXUDATE_OPTIONS.map(o => (
                    <OptionCard key={o.value} label={o.label} help={o.help}
                      selected={exudate === o.value} onPress={() => { setExudate(o.value); setStep(2); }} />
                  ))}
                </OptionGrid>
              </Question>
            )}
            {step === 2 && (
              <Question title="Any signs of infection?" subtitle="Antimicrobial dressings are only for wounds showing infection. This keeps the advice safe." onBack={() => setStep(1)}>
                <OptionGrid>
                  {INFECTION_OPTIONS.map(o => (
                    <OptionCard key={o.value} wide label={o.label} help={o.help}
                      selected={infection === o.value} onPress={() => { setInfection(o.value); setStep(3); }} />
                  ))}
                </OptionGrid>
              </Question>
            )}
            {step === 3 && (
              <Question title="How deep does it go?" subtitle="Deep wounds may need filling and a professional look." onBack={() => setStep(2)}>
                <OptionGrid>
                  {DEPTH_OPTIONS.map(o => (
                    <OptionCard key={o.value} label={o.label} help={o.help}
                      selected={depth === o.value} onPress={() => { setDepth(o.value); setStep(4); }} />
                  ))}
                </OptionGrid>
              </Question>
            )}
            {step === 4 && (
              <Question title="A couple of last things" subtitle="These help us keep the advice gentle and safe for you." onBack={() => setStep(3)}>
                <CheckRow checked={fragileSkin} onChange={setFragileSkin}
                  label="Thin / fragile / ageing skin, or skin that reacts to sticky dressings" />
                <CheckRow checked={diabetic} onChange={setDiabetic} label="I have diabetes" />
                <PrimaryButton label="Show my recommendation" onPress={finish} />
              </Question>
            )}
            <Disclaimer compact />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Result({ result, onRestart }: { result: WoundAdvice; onRestart: () => void }) {
  const colors = useColors();
  const urgent = result.refer === 'urgent';
  const referColor = urgent ? colors.danger : result.refer === 'soon' ? colors.warning : colors.primary;
  return (
    <>
      <View style={[cs.card, {
        backgroundColor: urgent ? colors.dangerBg : colors.primaryLight,
        borderColor: urgent ? colors.danger + '66' : colors.primary + '33',
      }]}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: urgent ? colors.danger : colors.primaryDark }}>{result.headline}</Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{result.summary}</Text>
        {result.refer !== 'none' ? (
          <View style={{ alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: referColor, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ color: referColor, fontWeight: '700', fontSize: 13 }}>{REFER_TEXT[result.refer]}</Text>
          </View>
        ) : null}
      </View>

      <RedFlags items={result.redFlags} />

      {result.picks.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionTitle>What to reach for</SectionTitle>
          {result.picks.map((p, i) => (
            <View key={p.category} style={[cs.card, { backgroundColor: colors.surface, borderColor: i === 0 ? colors.primary : colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{i + 1}. {p.label}</Text>
                {i === 0 ? (
                  <View style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Start here</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>{p.why}</Text>
            </View>
          ))}
        </View>
      )}

      {result.careSteps.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionTitle>How to care for it</SectionTitle>
          <Bullets items={result.careSteps} />
        </View>
      )}

      <ProductRecommendations tags={result.picks.map(p => p.tag)} />
      <References ids={result.references} />
      <Disclaimer />
      <SecondaryButton label="Start over" onPress={onRestart} />
    </>
  );
}
