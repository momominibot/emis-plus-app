// iOS / Android: open the short in YouTube. Inline playback would need
// react-native-webview and a new native build.
import { View, Image, TouchableOpacity, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { reelThumb, reelWatchUrl } from '@/lib/education/reels';

export default function ReelPlayer({ id, title }: { id: string; title: string }) {
  return (
    <TouchableOpacity
      onPress={() => WebBrowser.openBrowserAsync(reelWatchUrl(id))}
      accessibilityRole="button"
      accessibilityLabel={`Play ${title} on YouTube`}
      style={{ width: '100%', maxWidth: 360, aspectRatio: 9 / 16, alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}
    >
      <Image source={{ uri: reelThumb(id) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: 18 }}>
          <Ionicons name="play" size={36} color="#fff" />
        </View>
        <Text style={{ color: '#fff', fontWeight: '700', marginTop: 10 }}>Play on YouTube</Text>
      </View>
    </TouchableOpacity>
  );
}
