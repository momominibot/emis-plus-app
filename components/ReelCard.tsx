// Portrait card for one EMIS+ reel (Learn tab row and series list).
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatLength, reelThumb, type Reel } from '@/lib/education/reels';

export default function ReelCard({ reel, isNew = false }: { reel: Reel; isNew?: boolean }) {
  const colors = Colors[useColorScheme()];
  return (
    <Link href={`/reel/${reel.id}`} asChild>
      <TouchableOpacity style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface, borderColor: colors.border }])} accessibilityLabel={`Watch: ${reel.title}`}>
        <View style={styles.thumbWrap}>
          <Image source={{ uri: reelThumb(reel.id) }} style={styles.thumb} resizeMode="cover" />
          <View style={styles.play}>
            <Ionicons name="play" size={18} color="#fff" />
          </View>
          <Text style={styles.length}>{formatLength(reel.seconds)}</Text>
          {isNew ? <Text style={[styles.badge, { backgroundColor: '#8A5A00' }]}>NEW</Text> : null}
        </View>
        <Text style={[styles.ep, { color: colors.primary }]}>EP {reel.episode} · {reel.topic.toUpperCase()}</Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={4}>{reel.title}</Text>
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { width: 164, borderRadius: 16, borderWidth: 1, padding: 8 },
  thumbWrap: { width: '100%', aspectRatio: 9 / 16, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
  thumb: { width: '100%', height: '100%' },
  play: { position: 'absolute', top: '45%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: 9 },
  length: { position: 'absolute', right: 6, bottom: 6, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  badge: { position: 'absolute', left: 6, top: 6, color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  ep: { fontSize: 10, fontWeight: '800', marginTop: 8, letterSpacing: 0.3 },
  title: { fontSize: 14, fontWeight: '600', lineHeight: 19, marginTop: 3, minHeight: 76 },
});
