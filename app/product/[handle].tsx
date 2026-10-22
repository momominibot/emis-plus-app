import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Linking, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getProductByHandle } from '@/lib/shopify';
import { parseDescription, plainParagraphs, type DescBlock } from '@/lib/productDescription';
import { Product } from '@/lib/types';

export default function ProductDetailScreen() {
  const colors = Colors[useColorScheme()];
  const { width } = useWindowDimensions();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    if (!handle) return;
    let alive = true;
    setLoading(true);
    getProductByHandle(String(handle))
      .then(p => { if (alive) { setProduct(p); setImageIndex(0); } })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [handle]);

  const blocks: DescBlock[] = useMemo(() => {
    if (!product) return [];
    // Fall back to plain text only when the store gave no HTML at all; an empty
    // parse means everything was internal or a written price, so show nothing.
    if (product.descriptionHtml && product.descriptionHtml.trim()) return parseDescription(product.descriptionHtml);
    return plainParagraphs(product.description || '');
  }, [product]);

  function buy() {
    Linking.openURL(product?.url || `https://www.emis.asia/products/${handle}`);
  }

  if (loading || !product) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Product' }} />
        <View style={styles.center}>
          {loading ? <ActivityIndicator color={colors.primary} /> : (
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{failed ? 'Could not load this product. Check your connection.' : 'Product not found.'}</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const images = product.images && product.images.length ? product.images : (product.image ? [product.image] : []);
  const soldOut = product.available === false;
  const onSale = product.compareAtPrice && parseFloat(product.compareAtPrice) > parseFloat(product.price);
  const stage = Math.min(width - 40, 480);
  const specs = blocks.filter(b => b.type === 'spec') as Extract<DescBlock, { type: 'spec' }>[];
  const body = blocks.filter(b => b.type !== 'spec');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: product.vendor || 'Product' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Image stage */}
        <View style={[styles.stage, { backgroundColor: colors.surface, borderColor: colors.border, width: stage, height: stage }]}>
          {images[imageIndex] ? (
            <Image source={{ uri: images[imageIndex] }} style={styles.stageImage} resizeMode="contain" accessibilityLabel={product.title} />
          ) : (
            <Ionicons name="image-outline" size={40} color={colors.textTertiary} />
          )}
        </View>
        {images.length > 1 && (
          <View style={styles.thumbs}>
            {images.map((u, i) => (
              <TouchableOpacity key={u} onPress={() => setImageIndex(i)} accessibilityLabel={`Image ${i + 1} of ${images.length}`}
                style={[styles.thumb, { borderColor: i === imageIndex ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
                <Image source={{ uri: u }} style={styles.thumbImage} resizeMode="contain" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Title block */}
        <View style={styles.titleBlock}>
          {product.vendor ? <Text style={[styles.vendor, { color: colors.textTertiary }]}>{product.vendor.toUpperCase()}</Text> : null}
          <Text style={[styles.title, { color: colors.text }]}>{product.title}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]}>S${product.price}</Text>
            {onSale ? <Text style={[styles.compareAt, { color: colors.textTertiary }]}>S${product.compareAtPrice}</Text> : null}
            <View style={[styles.stockChip, { backgroundColor: soldOut ? colors.surfaceSunken : colors.primaryLight }]}>
              <View style={[styles.stockDot, { backgroundColor: soldOut ? colors.textTertiary : colors.primary }]} />
              <Text style={[styles.stockText, { color: soldOut ? colors.textSecondary : colors.primaryInk }]}>{soldOut ? 'Sold out' : 'Available'}</Text>
            </View>
          </View>
          <View style={[styles.assurance, { borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.assuranceText, { color: colors.textSecondary }]}>Price and stock live from emis.asia. Secure checkout on emis.asia.</Text>
          </View>
        </View>

        {/* Description */}
        {body.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>About this product</Text>
            {body.map((b, i) => {
              if (b.type === 'summary') return (
                <View key={i} style={[styles.summary, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.summaryText, { color: colors.primaryInk }]}>{b.text}</Text>
                </View>
              );
              if (b.type === 'heading') return <Text key={i} style={[styles.heading, { color: colors.text }]}>{b.text}</Text>;
              if (b.type === 'bullet') return (
                <View key={i} style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginTop: 2 }} />
                  <Text style={[styles.bodyText, { color: colors.text, flex: 1 }]}>{b.text}</Text>
                </View>
              );
              return <Text key={i} style={[styles.bodyText, { color: colors.text }]}>{(b as any).text}</Text>;
            })}
          </View>
        )}

        {specs.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: 6 }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Specifications</Text>
            {specs.map((s, i) => (
              <View key={i} style={[styles.specRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Text style={[styles.specKey, { color: colors.textSecondary }]}>{s.key}</Text>
                <Text style={[styles.specValue, { color: colors.text }]}>{s.value}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.note, { color: colors.textTertiary }]}>
          Product information is supplied by the manufacturer. Ask your nurse, pharmacist or doctor if you are unsure which product suits you.
        </Text>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.buyBtn, { backgroundColor: soldOut ? colors.surfaceSunken : colors.primary }]}
          onPress={buy}
          accessibilityRole="button"
        >
          <Ionicons name={soldOut ? 'open-outline' : 'bag-handle-outline'} size={20} color={soldOut ? colors.text : colors.onPrimary} />
          <Text style={[styles.buyText, { color: soldOut ? colors.text : colors.onPrimary }]}>{soldOut ? 'View on emis.asia' : 'Buy on emis.asia'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 20, paddingBottom: 32, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  stage: { alignSelf: 'center', borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden' },
  stageImage: { width: '100%', height: '100%' },
  thumbs: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  thumb: { width: 54, height: 54, borderRadius: 12, borderWidth: 1.5, padding: 4 },
  thumbImage: { width: '100%', height: '100%' },
  titleBlock: { gap: 8 },
  vendor: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  price: { fontSize: 24, fontWeight: '800' },
  compareAt: { fontSize: 16, textDecorationLine: 'line-through' },
  stockChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginLeft: 'auto' },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  stockText: { fontSize: 13, fontWeight: '700' },
  assurance: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  assuranceText: { fontSize: 13, lineHeight: 18, flex: 1 },
  card: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  summary: { borderRadius: 14, padding: 14 },
  summaryText: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  heading: { fontSize: 16, fontWeight: '800', marginTop: 6 },
  bodyText: { fontSize: 15, lineHeight: 23 },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  specRow: { flexDirection: 'row', gap: 12, paddingVertical: 11 },
  specKey: { width: '40%', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  specValue: { flex: 1, fontSize: 14, lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1 },
  buyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 54, borderRadius: 16, maxWidth: 680, width: '100%', alignSelf: 'center' },
  buyText: { fontSize: 17, fontWeight: '800' },
});
