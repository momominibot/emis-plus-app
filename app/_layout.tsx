import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ai-assistant" options={{ title: 'Product Assistant' }} />
        <Stack.Screen name="product/[handle]" options={{ title: 'Product' }} />
        <Stack.Screen name="tools/compression" options={{ title: 'Compression Stocking' }} />
        <Stack.Screen name="tools/wound" options={{ title: 'Wound Tracker' }} />
        <Stack.Screen name="tools/ostomy" options={{ title: 'Ostomy Log' }} />
        <Stack.Screen name="tools/intake-output" options={{ title: 'Intake & Output' }} />
        <Stack.Screen name="tools/vitals" options={{ title: 'Vitals Monitor' }} />
        <Stack.Screen name="tools/export" options={{ title: 'Export & Transfer' }} />
      </Stack>
    </ThemeProvider>
  );
}
