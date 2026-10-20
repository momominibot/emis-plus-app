// Web: play the YouTube short inline (privacy-enhanced embed).
import { createElement } from 'react';
import { View } from 'react-native';
import { reelEmbedUrl } from '@/lib/education/reels';

export default function ReelPlayer({ id, title }: { id: string; title: string }) {
  return (
    <View style={{ width: '100%', maxWidth: 360, aspectRatio: 9 / 16, alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
      {createElement('iframe', {
        src: reelEmbedUrl(id),
        title,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        allowFullScreen: true,
        style: { width: '100%', height: '100%', border: 0 },
      })}
    </View>
  );
}
