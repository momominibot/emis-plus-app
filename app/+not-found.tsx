import { Link, Redirect, Stack, usePathname } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function NotFoundScreen() {
  const colors = Colors[useColorScheme()];
  const pathname = usePathname();

  // Links to the web build's file names (e.g. the phone-frame preview loads
  // "./index.html") are the home screen, not missing pages.
  if (/(^|\/)index(\.html)?$/.test(pathname)) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="compass-outline" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>We couldn't find that page</Text>
        <Link href="/" style={[styles.link, { color: colors.primary }]}>Go to Home</Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  icon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  link: { fontSize: 16, fontWeight: '700', paddingVertical: 8 },
});
