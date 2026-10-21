// Gentle motion for illustrations: a slow drift loop and a fade-in on mount.
// Built on React Native's Animated so it behaves the same on web, iOS and
// Android with no extra native modules. Honours the system "reduce motion"
// setting by rendering still.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(v => { if (alive) setReduce(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', v => setReduce(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

/** Slow up-and-down float with a hint of tilt and breathing scale. */
export function Drift({
  children, style, amplitude = 6, duration = 5200, delay = 0, tilt = 1.2, scale = 0.02,
}: { children: ReactNode; style?: StyleProp<ViewStyle>; amplitude?: number; duration?: number; delay?: number; tilt?: number; scale?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) { t.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(t, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(t, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce, duration, delay]);
  return (
    <Animated.View style={[style, {
      transform: [
        { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [amplitude, -amplitude] }) },
        { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`-${tilt}deg`, `${tilt}deg`] }) },
        { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + scale] }) },
      ],
    }]}>
      {children}
    </Animated.View>
  );
}

/** Fade and rise into place when the screen mounts. */
export function Rise({ children, style, delay = 0, distance = 14 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number; distance?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Soft coloured circle that drifts behind an illustration. */
export function Blob({ color, size, top, left, right, bottom, opacity = 0.18, duration = 7000, delay = 0 }: {
  color: string; size: number; top?: number; left?: number; right?: number; bottom?: number; opacity?: number; duration?: number; delay?: number;
}) {
  return (
    <Drift style={{ position: 'absolute', top, left, right, bottom }} amplitude={8} duration={duration} delay={delay} tilt={0} scale={0.06}>
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity }} />
    </Drift>
  );
}
