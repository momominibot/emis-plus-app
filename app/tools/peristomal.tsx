// Stoma skin check (peristomal skin), based on the Ostomy Skin Tool DET score.
// Logic: lib/clinical/peristomal.ts (ported unchanged from the reviewed EMIS+
// web app). Wording carried over from PeristomalSkinChecker.tsx.

import { useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  assessPeristomal,
  type DETCategory, type DETDomainScore, type DomainKey, type LeakageFrequency, type PeristomalAssessment,
} from '@/lib/clinical/peristomal';
import {
  useColors, clinicalStyles as cs, Disclaimer, OptionCard, OptionGrid, CheckRow, PrimaryButton,
  RedFlags, References, ProductRecommendations, SectionTitle, Bullets,
} from '@/components/clinical';

const DOMAIN_META: { key: DomainKey; label: string; help: string; severity1: string; severity2: string }[] = [
  {
    key: 'discoloration',
    label: 'Colour change',
    help: 'Redness, purple, or skin darker than your normal skin around the stoma.',
    severity1: 'Discoloured, but skin is intact and not painful',
    severity2: 'Discoloured AND painful, shiny, raised or hardened',
  },
  {
    key: 'erosion',
    label: 'Skin loss / breakdown',
    help: 'Sore, moist, broken or raw skin.',
    severity1: 'Broken, moist or sore in places',
    severity2: 'Deep or widespread skin loss, raw or bleeding',
  },
  {
    key: 'tissueOvergrowth',
    label: 'Raised / overgrown tissue',
    help: 'Lumps, wart-like areas, or overgrown (granulation) tissue.',
    severity1: 'Small raised area(s)',
    severity2: 'Larger or extensive raised tissue, may bleed',
  },
];

const AREA_OPTIONS: { value: DETDomainScore['area']; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Less than 25% of the skin under the baseplate' },
  { value: 2, label: '25 to 50%' },
  { value: 3, label: 'More than 50%' },
];

const LEAK_OPTIONS: [LeakageFrequency, string][] = [
  ['none', 'Rarely / never'],
  ['occasional', 'Occasionally'],
  ['frequent', 'Frequently'],
];

const DOMAIN_LABELS: Record<DomainKey, string> = {
  discoloration: 'Colour change',
  erosion: 'Skin loss',
  tissueOvergrowth: 'Raised tissue',
};

type DomainState = Record<DomainKey, DETDomainScore>;
const INITIAL_DOMAINS: DomainState = {
  discoloration: { area: 0, severity: 0 },
  erosion: { area: 0, severity: 0 },
  tissueOvergrowth: { area: 0, severity: 0 },
};

export default function PeristomalScreen() {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const resultY = useRef(0);
  const [domains, setDomains] = useState<DomainState>(INITIAL_DOMAINS);
  const [leakageFrequency, setLeakageFrequency] = useState<LeakageFrequency>('none');
  const [itchOrBurning, setItchOrBurning] = useState(false);
  const [painOnRemoval, setPainOnRemoval] = useState(false);
  const [bleeding, setBleeding] = useState(false);
  const [signsOfInfection, setSignsOfInfection] = useState(false);
  const [result, setResult] = useState<PeristomalAssessment | null>(null);

  function setArea(key: DomainKey, area: DETDomainScore['area']) {
    // Severity only counts where some skin is affected; default to the milder option.
    setDomains(d => ({ ...d, [key]: { area, severity: area === 0 ? 0 : (d[key].severity || 1) as DETDomainScore['severity'] } }));
  }
  function setSeverity(key: DomainKey, severity: DETDomainScore['severity']) {
    setDomains(d => ({ ...d, [key]: { ...d[key], severity } }));
  }
  function check() {
    setResult(assessPeristomal({ domains, leakageFrequency, itchOrBurning, painOnRemoval, bleeding, signsOfInfection }));
    setTimeout(() => scrollRef.current?.scrollTo({ y: resultY.current, animated: true }), 50);
  }

  return (
    <SafeAreaView style={[cs.screen, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={cs.content}>
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textSecondary }}>
          Look at the skin around your stoma (the area normally covered by the baseplate). For each type of change,
          choose how much skin is affected, then how severe it looks.
        </Text>

        {DOMAIN_META.map(meta => {
          const state = domains[meta.key];
          return (
            <View key={meta.key} style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{meta.label}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>{meta.help}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 4 }}>How much skin is affected?</Text>
              <OptionGrid>
                {AREA_OPTIONS.map(o => (
                  <OptionCard key={o.value} wide={o.value === 1} label={o.label}
                    selected={state.area === o.value} onPress={() => setArea(meta.key, o.value)} />
                ))}
              </OptionGrid>
              {state.area > 0 && (
                <>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 4 }}>How severe is it?</Text>
                  <OptionGrid>
                    <OptionCard wide label={meta.severity1} selected={state.severity === 1} onPress={() => setSeverity(meta.key, 1)} />
                    <OptionCard wide label={meta.severity2} selected={state.severity === 2} onPress={() => setSeverity(meta.key, 2)} />
                  </OptionGrid>
                </>
              )}
            </View>
          );
        })}

        <View style={{ gap: 10 }}>
          <SectionTitle>How often does your pouch leak?</SectionTitle>
          <OptionGrid>
            {LEAK_OPTIONS.map(([value, label]) => (
              <OptionCard key={value} label={label} selected={leakageFrequency === value} onPress={() => setLeakageFrequency(value)} />
            ))}
          </OptionGrid>
        </View>

        <View style={{ gap: 10 }}>
          <SectionTitle>Anything else you've noticed?</SectionTitle>
          <CheckRow checked={itchOrBurning} onChange={setItchOrBurning} label="Itching or burning under/around the barrier" />
          <CheckRow checked={painOnRemoval} onChange={setPainOnRemoval} label="Soreness or pain when removing the pouch" />
          <CheckRow checked={bleeding} onChange={setBleeding} label="Bleeding from the skin or raised tissue" />
          <CheckRow checked={signsOfInfection} onChange={setSignsOfInfection} label="Spreading redness, pus, or feeling feverish" />
        </View>

        <PrimaryButton label="Check my skin" onPress={check} />

        {result && (
          <View onLayout={e => { resultY.current = e.nativeEvent.layout.y; }} style={{ gap: 20 }}>
            <Result result={result} />
          </View>
        )}
        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

function Result({ result }: { result: PeristomalAssessment }) {
  const colors = useColors();
  const tone: Record<DETCategory, { bg: string; fg: string }> = {
    normal: { bg: colors.successBg, fg: colors.success },
    mild: { bg: colors.warningBg, fg: colors.warning },
    moderate: { bg: colors.accentLight, fg: colors.accent },
    severe: { bg: colors.dangerBg, fg: colors.danger },
  };
  const t = tone[result.category];
  return (
    <>
      <View style={[cs.card, { backgroundColor: t.bg, borderColor: t.fg + '55' }]}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.fg }}>DET score {result.detTotal}/15</Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{result.headline}</Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{result.interpretation}</Text>
      </View>

      <RedFlags items={result.redFlags} />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {result.byDomain.map(d => (
          <View key={d.key} style={[cs.card, { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, padding: 12 }]}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' }}>{DOMAIN_LABELS[d.key]}</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{d.subtotal}</Text>
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>area {d.area} + sev {d.severity}</Text>
          </View>
        ))}
      </View>

      {result.likelyContributors.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionTitle>What might be contributing</SectionTitle>
          <Bullets items={result.likelyContributors} />
        </View>
      )}

      <View style={{ gap: 10 }}>
        <SectionTitle>What to do</SectionTitle>
        <Bullets items={result.actions} />
      </View>

      <ProductRecommendations tags={['barrier-accessories', 'peristomal-skin-care']} />
      <References ids={result.references} />
    </>
  );
}
