import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, Rect, Line, Polyline, Ellipse } from 'react-native-svg';

const PATHS: Record<string, React.ReactNode> = {
  'home': <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />,
  'home-outline': <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" fill="none" strokeWidth="1.8" />,
  'bag': <Path d="M6 7h12l1 13H5L6 7zm3 0a3 3 0 0 1 6 0" />,
  'bag-outline': <Path d="M6 7h12l1 13H5L6 7zm3 0a3 3 0 0 1 6 0" fill="none" strokeWidth="1.8" />,
  'cube': <Path d="M12 2l9 5v10l-9 5-9-5V7l9-5zm0 0v20M3 7l9 5 9-5" />,
  'cube-outline': <Path d="M12 2l9 5v10l-9 5-9-5V7l9-5zm0 0v20M3 7l9 5 9-5" fill="none" strokeWidth="1.8" />,
  'medkit': <Path d="M4 7h16v13H4V7zm4 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 12h4M12 10v4" />,
  'medkit-outline': <Path d="M4 7h16v13H4V7zm4 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 12h4M12 10v4" fill="none" strokeWidth="1.8" />,
  'person': <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0" />,
  'person-outline': <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0" fill="none" strokeWidth="1.8" />,
  'search': <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35" fill="none" strokeWidth="1.8" strokeLinecap="round" />,
  'bandage': <><Path d="M9 15l6-6" /><Path d="M8 12a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4z" /><Path d="M10 10h.01M14 14h.01" /></>,
  'water': <Path d="M12 2s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />,
  'fitness': <><Path d="M6 4v16M18 4v16" /><Path d="M2 8v8M22 8v8" /><Path d="M6 12h12" /></>,
  'heart': <Path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />,
  'chatbubble': <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z" />,
  'chevron-forward': <Path d="M9 6l6 6-6 6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  'shield-checkmark': <><Path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z" /><Path d="M9 12l2 2 4-4" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  'close-circle': <><Circle cx="12" cy="12" r="9" /><Path d="M9 9l6 6M15 9l-6 6" fill="none" strokeWidth="1.8" strokeLinecap="round" /></>,
  'alert-circle-outline': <><Circle cx="12" cy="12" r="9" fill="none" strokeWidth="1.8" /><Path d="M12 8v5M12 16h.01" strokeWidth="1.8" strokeLinecap="round" /></>,
  'lock-closed': <><Rect x="4" y="10" width="16" height="11" rx="2" /><Path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" strokeWidth="1.8" /></>,
  'canteen': <><Path d="M8 4h8v3l2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9l2-2V4z" /><Path d="M8 4h8M10 13h4" fill="none" strokeWidth="1.8" /></>,
  'pulse': <Path d="M3 12h4l2-6 4 12 2-6h6" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  'share-outline': <><Circle cx="18" cy="5" r="3" fill="none" strokeWidth="1.8" /><Circle cx="6" cy="12" r="3" fill="none" strokeWidth="1.8" /><Circle cx="18" cy="19" r="3" fill="none" strokeWidth="1.8" /><Path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" fill="none" strokeWidth="1.8" /></>,
  'information-circle': <><Circle cx="12" cy="12" r="9" fill="none" strokeWidth="1.8" /><Path d="M12 11v5M12 8h.01" strokeWidth="1.8" strokeLinecap="round" /></>,
  'gift-outline': <><Rect x="3" y="8" width="18" height="4" rx="1" fill="none" strokeWidth="1.8" /><Path d="M5 12v9h14v-9M12 8v13M12 8s-2-4-5-4-3 3 0 4 5 0 5 0zm0 0s2-4 5-4 3 3 0 4-5 0-5 0z" fill="none" strokeWidth="1.8" /></>,
  'card-outline': <><Rect x="2" y="5" width="20" height="14" rx="2" fill="none" strokeWidth="1.8" /><Path d="M2 10h20" strokeWidth="1.8" /></>,
  'card': <><Rect x="2" y="5" width="20" height="14" rx="2" /><Path d="M2 10h20" stroke="#fff" strokeWidth="1.5" /></>,
  'call-outline': <Path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="none" strokeWidth="1.8" strokeLinejoin="round" />,
  'settings-outline': <><Circle cx="12" cy="12" r="3" fill="none" strokeWidth="1.8" /><Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" fill="none" strokeWidth="1.8" /></>,
  'time': <><Circle cx="12" cy="12" r="9" fill="none" strokeWidth="1.8" /><Path d="M12 7v5l3 2" fill="none" strokeWidth="1.8" strokeLinecap="round" /></>,
  'car': <><Path d="M3 13l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v5h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3v-5z" /><Path d="M3 13h18" fill="none" strokeWidth="1.5" /></>,
  'checkmark-circle': <><Circle cx="12" cy="12" r="9" /><Path d="M8 12l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

export default function Icon({ name, size = 24, color = '#000' }: IconProps) {
  const path = PATHS[name];
  if (!path) {
    return <View style={{ width: size, height: size }} />;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color}>
      {path}
    </Svg>
  );
}
