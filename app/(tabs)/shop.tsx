import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, FlatList } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { TabHeader, ui } from '@/components/ui';
import { TAB_BAR_SPACE } from '@/components/FloatingTabBar';
import { getCollections, getProducts, searchProducts } from '@/lib/shopify';
import { Collection, Product } from '@/lib/types';

export default function ShopScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const { category, focus } = useLocalSearchParams<{ category?: string; focus?: string }>();

  const searchRef = useRef<TextInput>(null);

  useEffect(() => {
    loadCollections();
  }, []);

  // Home's search bar sends a fresh focus value on every tap.
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => searchRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [focus]);

  // Home's "Shop by need" tiles open this tab with ?category=<collection handle>
  useEffect(() => {
    const handle = typeof category === 'string' && category ? category : null;
    setActiveCategory(handle);
    loadProducts(handle || undefined);
  }, [category]);

  async function loadCollections() {
    try {
      const cols = await getCollections();
      setCollections(cols);
    } catch { /* not configured */ }
  }

  async function loadProducts(handle?: string) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const prods = await getProducts(handle || undefined);
      if (id === requestId.current) setProducts(prods);
    } catch (e: any) {
      if (id === requestId.current) setError(e.message || 'Failed to load products');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  async function onSearch() {
    if (!searchQuery.trim()) {
      loadProducts(activeCategory || undefined);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    setError(null);
    try {
      const results = await searchProducts(searchQuery);
      if (id === requestId.current) setProducts(results);
    } catch (e: any) {
      if (id === requestId.current) setError(e.message || 'Search failed');
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  }

  function selectCategory(handle: string) {
    const next = activeCategory === handle ? null : handle;
    setActiveCategory(next);
    setSearchQuery('');
    loadProducts(next || undefined);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <TabHeader title="Shop" subtitle="Prices and stock live from emis.asia" />

      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }, ui.cardShadow]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search products..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={onSearch}
          returnKeyType="search"
          ref={searchRef}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); loadProducts(activeCategory || undefined); }} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryBar} contentContainerStyle={styles.categoryScroll}>
        <TouchableOpacity
          style={[styles.categoryChip, { backgroundColor: !activeCategory ? colors.primary : colors.surfaceSunken, borderColor: !activeCategory ? colors.primary : colors.border }]}
          onPress={() => selectCategory('')}
        >
          <Text style={[styles.categoryText, { color: !activeCategory ? colors.onPrimary : colors.textSecondary }]}>All</Text>
        </TouchableOpacity>
        {collections.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.categoryChip, { backgroundColor: activeCategory === c.handle ? colors.primary : colors.surfaceSunken, borderColor: activeCategory === c.handle ? colors.primary : colors.border }]}
            onPress={() => selectCategory(c.handle)}
          >
            <Text style={[styles.categoryText, { color: activeCategory === c.handle ? colors.onPrimary : colors.textSecondary }]} numberOfLines={1}>
              {c.title.replace(/Products Singapore$/i, '').trim()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.resultRow}>
        <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
          {loading ? 'Loading...' : `${products.length} products`}
        </Text>
      </View>

      <FlatList
        data={products}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.productGrid}
        columnWrapperStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <Link href={`/product/${item.handle}`} asChild>
            <TouchableOpacity style={StyleSheet.flatten([styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }, ui.cardShadow])}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.productImage} resizeMode="contain" />
              ) : (
                <View style={[styles.productImage, { backgroundColor: colors.surfaceSunken }]} />
              )}
              {item.available === false && (
                <View style={[styles.soldOut, { backgroundColor: colors.surfaceSunken }]}>
                  <Text style={[styles.soldOutText, { color: colors.textSecondary }]}>Sold out</Text>
                </View>
              )}
              <View style={{ padding: 12 }}>
                {item.vendor && (
                  <Text style={[styles.productVendor, { color: colors.textTertiary }]}>{item.vendor.toUpperCase()}</Text>
                )}
                <Text style={[styles.productName, { color: colors.text }]} numberOfLines={3}>{item.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <Text style={[styles.productPrice, { color: colors.text }]}>S${item.price}</Text>
                  {item.compareAtPrice && parseFloat(item.compareAtPrice) > parseFloat(item.price) && (
                    <Text style={[styles.comparePrice, { color: colors.textTertiary }]}>S${item.compareAtPrice}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Link>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            {error ? (
              <>
                <Ionicons name="alert-circle-outline" size={40} color={colors.textTertiary} />
                <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 8 }}>{error}</Text>
                <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => loadProducts(activeCategory || undefined)}>
                  <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
                {searching ? 'Searching...' : 'No products found'}
              </Text>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: '700', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, paddingHorizontal: 14, height: 50, borderRadius: 14, borderWidth: 1, gap: 10 },
  searchInput: { flex: 1, fontSize: 16 },
  categoryBar: { flexGrow: 0, flexShrink: 0 },
  categoryScroll: { paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  categoryChip: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  categoryText: { fontSize: 13, fontWeight: '700' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  resultCount: { fontSize: 13, fontWeight: '500' },
  productGrid: { padding: 20, gap: 12, paddingBottom: TAB_BAR_SPACE },
  productCard: { flex: 1, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  soldOut: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  soldOutText: { fontSize: 11, fontWeight: '700' },
  productImage: { width: '100%', aspectRatio: 1, backgroundColor: '#fff', padding: 8 },
  productVendor: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, marginBottom: 3 },
  productName: { fontSize: 14, fontWeight: '600', lineHeight: 19, minHeight: 57 },
  productPrice: { fontSize: 16, fontWeight: '800' },
  comparePrice: { fontSize: 13, textDecorationLine: 'line-through', marginLeft: 6 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
});
