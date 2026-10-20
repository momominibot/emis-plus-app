// Reader for one EMIS+ patient guide (lib/education/articles.ts).

import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getArticle, allArticleSlugs, type Callout } from '@/lib/education/articles';
import {
  useColors, clinicalStyles as cs, Disclaimer, References, ProductRecommendations, SectionTitle, Bullets,
} from '@/components/clinical';

// Guides were written for the web app; map their tool links to app screens.
const TOOL_ROUTES: Record<string, string> = {
  '/calculators/wound-nutrition': '/tools/wound-nutrition',
  '/ostomy-diary': '/tools/hydration',
  '/peristomal-skin': '/tools/peristomal',
  '/wound-advisor': '/tools/wound-advisor',
};

// Pre-render every guide so links to them work on static hosting.
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return allArticleSlugs().map(slug => ({ slug }));
}

export default function GuideScreen() {
  const colors = useColors();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const article = slug ? getArticle(String(slug)) : undefined;

  if (!article) {
    return (
      <SafeAreaView style={[cs.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Guide' }} />
        <Text style={{ padding: 20, color: colors.textSecondary }}>Guide not found.</Text>
      </SafeAreaView>
    );
  }

  const toolRoute = article.relatedTool ? TOOL_ROUTES[article.relatedTool.href] : undefined;

  return (
    <SafeAreaView style={[cs.screen, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: article.category }} />
      <ScrollView contentContainerStyle={cs.content}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{article.category.toUpperCase()} · {article.readingTimeMin} MIN READ</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', lineHeight: 32, color: colors.text }}>{article.title}</Text>
          <Text style={{ fontSize: 17, lineHeight: 26, color: colors.text }}>{article.intro}</Text>
        </View>

        {article.sections.map(sec => (
          <View key={sec.heading} style={{ gap: 10 }}>
            <SectionTitle>{sec.heading}</SectionTitle>
            {(sec.paragraphs || []).map((p, i) => (
              <Text key={i} style={{ fontSize: 16, lineHeight: 25, color: colors.text }}>{p}</Text>
            ))}
            {sec.bullets ? <Bullets items={sec.bullets} /> : null}
            {sec.callout ? <CalloutBox callout={sec.callout} /> : null}
          </View>
        ))}

        <View style={[cs.card, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '33' }]}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primaryDark }}>Key takeaways</Text>
          <Bullets items={article.keyTakeaways} />
        </View>

        {toolRoute && article.relatedTool ? (
          <TouchableOpacity onPress={() => router.push(toolRoute as any)}
            style={[cs.card, { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <Ionicons name="medkit" size={22} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.text }}>Try it: {article.relatedTool.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : null}

        {article.relatedProductTags?.length ? <ProductRecommendations tags={article.relatedProductTags} /> : null}
        <References ids={article.references} />
        <Disclaimer compact />
      </ScrollView>
    </SafeAreaView>
  );
}

function CalloutBox({ callout }: { callout: Callout }) {
  const colors = useColors();
  const tone = {
    tip: { bg: colors.infoBg, fg: colors.info, icon: 'bulb', label: 'Tip' },
    warning: { bg: colors.warningBg, fg: colors.warning, icon: 'warning', label: 'Take care' },
    redflag: { bg: colors.dangerBg, fg: colors.danger, icon: 'alert-circle', label: 'Get help' },
  }[callout.type];
  return (
    <View style={[cs.card, { backgroundColor: tone.bg, borderColor: tone.fg + '55', flexDirection: 'row', alignItems: 'flex-start' }]}>
      <Ionicons name={tone.icon as any} size={20} color={tone.fg} />
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: colors.text }}>
        <Text style={{ fontWeight: '700', color: tone.fg }}>{tone.label}: </Text>{callout.text}
      </Text>
    </View>
  );
}
