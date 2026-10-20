// Learn: EMIS+ patient guides (in-app, each backed by clinical references)
// plus the latest wound and stoma articles from the emis.asia blog, read
// live from Shopify with no access token.

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { ARTICLES, type ArticleCategory } from '@/lib/education/articles';
import { EDUCATION_BLOGS, getBlogArticles, type BlogArticle } from '@/lib/shopify';

const CATEGORY_ICON: Record<ArticleCategory, string> = {
  'Wound healing': 'bandage',
  'Ostomy care': 'water',
  'Nutrition & hydration': 'nutrition',
};

const CATEGORIES: ArticleCategory[] = ['Wound healing', 'Ostomy care', 'Nutrition & hydration'];

export default function LearnScreen() {
  const colors = Colors[useColorScheme()];
  const [blogTab, setBlogTab] = useState(EDUCATION_BLOGS[0].handle);
  const [articles, setArticles] = useState<Record<string, BlogArticle[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (articles[blogTab]) return;
    let alive = true;
    setLoading(true);
    setError(null);
    getBlogArticles(blogTab, 12)
      .then(list => { if (alive) setArticles(a => ({ ...a, [blogTab]: list })); })
      .catch(() => { if (alive) setError('Could not load articles. Check your connection.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [blogTab]);

  const list = articles[blogTab] || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[styles.title, { color: colors.text }]}>Learn</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Plain-language guides for patients and carers. Each guide lists the clinical sources it is based on.
        </Text>

        {CATEGORIES.map(cat => {
          const items = ARTICLES.filter(a => a.category === cat);
          if (!items.length) return null;
          return (
            <View key={cat} style={{ marginTop: 20 }}>
              <Text style={[styles.groupTitle, { color: colors.text }]}>{cat}</Text>
              <View style={{ marginHorizontal: 20, gap: 10 }}>
                {items.map(a => (
                  <Link key={a.slug} href={`/guide/${a.slug}`} asChild>
                    <TouchableOpacity style={StyleSheet.flatten([styles.guideRow, { backgroundColor: colors.surface, borderColor: colors.border }])}>
                      <View style={[styles.guideIcon, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name={CATEGORY_ICON[a.category] as any} size={22} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.guideTitle, { color: colors.text }]}>{a.title}</Text>
                        <Text style={[styles.guideSummary, { color: colors.textSecondary }]} numberOfLines={2}>{a.summary}</Text>
                        <Text style={[styles.guideMeta, { color: colors.textTertiary }]}>{a.readingTimeMin} min read</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </Link>
                ))}
              </View>
            </View>
          );
        })}

        <View style={{ marginTop: 28 }}>
          <Text style={[styles.groupTitle, { color: colors.text }]}>From the EMIS+ blog</Text>
          <View style={styles.tabs}>
            {EDUCATION_BLOGS.map(b => {
              const active = b.handle === blogTab;
              return (
                <TouchableOpacity key={b.handle} onPress={() => setBlogTab(b.handle)}
                  style={[styles.tab, { backgroundColor: active ? colors.primary : colors.surfaceSunken, borderColor: active ? colors.primary : colors.border }]}>
                  <Text style={{ color: active ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 14 }}>{b.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
          {error && <Text style={[styles.subtitle, { color: colors.danger }]}>{error}</Text>}

          <View style={{ marginHorizontal: 20, gap: 10 }}>
            {list.map(a => (
              <TouchableOpacity key={a.id} onPress={() => WebBrowser.openBrowserAsync(a.url)}
                style={[styles.blogRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {a.image ? (
                  <Image source={{ uri: a.image }} style={styles.blogImage} resizeMode="cover" />
                ) : (
                  <Ionicons name="document-text-outline" size={22} color={colors.primary} style={{ marginHorizontal: 4 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.blogTitle, { color: colors.text }]} numberOfLines={3}>{a.title}</Text>
                  <Text style={[styles.guideMeta, { color: colors.textTertiary }]}>
                    {new Date(a.publishedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })} · emis.asia
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.disclaimer, { backgroundColor: colors.surfaceSunken }]}>
          <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
          <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
            Educational information only, not medical advice. Always confirm with your clinician, stoma nurse or dietitian.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: '700', paddingHorizontal: 20, paddingTop: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, paddingHorizontal: 20, marginTop: 4 },
  groupTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginBottom: 10 },
  guideRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, gap: 14 },
  guideIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  guideTitle: { fontSize: 16, fontWeight: '700' },
  guideSummary: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  guideMeta: { fontSize: 12, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  blogRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, gap: 12 },
  blogImage: { width: 72, height: 72, borderRadius: 10 },
  blogTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', margin: 20, padding: 14, borderRadius: 12, gap: 8 },
  disclaimerText: { fontSize: 13, lineHeight: 18, flex: 1 },
});
