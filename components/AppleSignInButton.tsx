// Android and web: a plain Apple button; sign-in goes through the browser.
import { Text, TouchableOpacity } from 'react-native';

export default function AppleSignInButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={{ backgroundColor: '#000', padding: 13, borderRadius: 10, alignItems: 'center', opacity: disabled ? 0.6 : 1 }}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Continue with Apple"
    >
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Continue with Apple</Text>
    </TouchableOpacity>
  );
}
