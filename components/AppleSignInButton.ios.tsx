// iOS: Apple's own Sign in with Apple button (Apple's design rules).
import * as AppleAuthentication from 'expo-apple-authentication';
import { useColorScheme } from '@/components/useColorScheme';

export default function AppleSignInButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const dark = useColorScheme() === 'dark';
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={10}
      style={{ height: 48, opacity: disabled ? 0.6 : 1 }}
      onPress={() => !disabled && onPress()}
    />
  );
}
