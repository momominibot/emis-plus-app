import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getProductByHandle } from '@/lib/shopify';
import { Product } from '@/lib/types';

export default function ProductDetailScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (handle) loadProduct();
  }, [handle]);

  async function loadProduct() {
    try {
      const p = await getProductByHandle(handle);
      setProduct(p);
    } catch { /* not configured */ }
    setLoading(false);
  }

  function buyNow() {
    Linking.openURL(`https://emis.asia/products/${handle}`);
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Product' }} />
        <Text style={{ padding: 20, color: colors.textSecondary }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Product' }} />
        <Text style={{ padding: 20, color: colors.textSecondary }}>Product not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ title: product.title }} />
      <ScrollView>
        {product.image ? (
          <Image source={{ uri: product.image }} style={styles.image} />
        ) : (
          <View style={[styles.image, { backgroundColor: colors.border }]} />
        )}
        <View style={{ padding: 16 }}>
          <Text style={[styles.vendor, { color: colors.textSecondary }]}>{product.vendor}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{product.title}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.primary }]}>S${product.price}</Text>
            {product.compareAtPrice && parseFloat(product.compareAtPrice) > parseFloat(product.price) && (
              <Text style={[styles.compareAt, { color: colors.textSecondary }]}>S${product.compareAtPrice}</Text>
            )}
          </View>

          {product.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {product.tags.slice(0, 5).map((tag, i) => (
                <View key={i} style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Description</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>{product.description || 'No description available.'}</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View>
          <Text style={[styles.bottomPrice, { color: colors.text }]}>S${product.price}</Text>
        </View>
        <TouchableOpacity style={[styles.buyBtn, { backgroundColor: colors.primary }]} onPress={buyNow}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Buy on EMIS+</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  image: { width: '100%', height: 300 },
  vendor: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  price: { fontSize: 24, fontWeight: '800' },
  compareAt: { fontSize: 16, textDecorationLine: 'line-through' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontSize: 11, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  description: { fontSize: 14, lineHeight: 22 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderTopWidth: 1 },
  bottomPrice: { fontSize: 20, fontWeight: '800' },
  buyBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
});
