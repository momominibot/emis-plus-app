// Watch one reel from the EMIS+ wound care series, with related tool,
// products and the rest of the series.

import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import ReelPlayer from '@/components/ReelPlayer';
import ReelCard from '@/components/ReelCard';
import { WOUND_CARE_SERIES, getReel, latestReels, formatLength, reelWatchUrl } from '@/lib/education/reels';
import { useColors, clinicalStyles as cs, Disclaimer, ProductRecommendations, SectionTitle } from '@/components/clinical';

export async function generateStaticParams(): Promise<{ id: string }[]> {
  return WOUND_CARE_SERIES.map(r => ({ id: r.id }));
}

export default function ReelScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reel = id ? getReel(String(id)) : undefined;

  if (!reel) {
    return (
      <SafeAreaView style={[cs.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Reel' }} />
        <Text style={{ padding: 20, color: colors.textSecondary }}>Reel not found.</Text>
      </SafeAreaView>
    );
  }

  const others = latestReels().filter(r => r.id !== reel.id);
  const date = new Date(reel.published + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={[cs.screen, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: `Episode ${reel.episode}` }} />
      <ScrollView contentContainerStyle={cs.content}>
        <ReelPlayer id={reel.id} title={reel.title} />

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
            WOUND CARE EXPLAINED · EP {reel.episode} OF {WOUND_CARE_SERIES.length}
          </Text>
          <Text style={{ fontSize: 21, fontWeight: '800', lineHeight: 27, color: colors.text }}>{reel.title}</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>{date} · {formatLength(reel.seconds)} · @emis_asia</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(reelWatchUrl(reel.id))}
            style={[cs.card, { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="logo-youtube" size={18} color={colors.danger} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Watch on YouTube</Text>
          </TouchableOpacity>
          {reel.relatedTool ? (
            <TouchableOpacity onPress={() => router.push(reel.relatedTool!.route as any)}
              style={[cs.card, { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, backgroundColor: colors.primaryLight, borderColor: colors.primary + '33' }]}>
              <Ionicons name="medkit" size={18} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primaryDark }}>Try: {reel.relatedTool.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {reel.productTags?.length ? <ProductRecommendations tags={reel.productTags} /> : null}

        <View style={{ gap: 10 }}>
          <SectionTitle>More from the series</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
            {others.map(r => <ReelCard key={r.id} reel={r} />)}
          </ScrollView>
        </View>

        <Disclaimer compact />
      </ScrollView>
    </SafeAreaView>
  );
}
