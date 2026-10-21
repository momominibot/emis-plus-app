// Sign-in for EMIS+: a 6-digit code by email, plus Apple and Google when
// they are switched on. Deliberately plain; the app's design pass restyles it.
//
// With `confirmEmail`, it instead asks an already signed-in member for a code
// sent to their own address, which connects their emis.asia orders (needed
// after a Google sign-in on an address Google does not run).

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import AppleSignInButton from '@/components/AppleSignInButton';
import { APPLE_ENABLED, GOOGLE_ENABLED } from '@/lib/auth/config';
import { sendEmailCode, signInWithApple, signInWithGoogle, verifyEmailCode, type FlowResult } from '@/lib/auth/session';

const RESEND_AFTER_S = 60;

interface Props {
  intro?: string;
  confirmEmail?: string;
  onConfirmed?: () => void;
}

export default function SignInPanel({ intro, confirmEmail, onConfirmed }: Props) {
  const colors = Colors[useColorScheme()];
  const confirming = confirmEmail !== undefined;
  const [email, setEmail] = useState(confirmEmail ?? '');
  const [code, setCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function step(action: () => Promise<FlowResult>, onOk?: () => void) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result && !result.ok) setMessage({ ok: false, text: result.message });
    if (result?.ok) onOk?.();
  }

  const sendCode = () =>
    step(() => sendEmailCode(confirmEmail ?? email), () => {
      setCodeSentTo((confirmEmail ?? email).trim());
      setCode('');
      setWait(RESEND_AFTER_S);
      setMessage({ ok: true, text: 'We emailed you a 6-digit code. It can take a minute to arrive.' });
    });

  const input = [styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{confirming ? 'Connect your emis.asia orders' : 'Sign in to EMIS+'}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {intro ??
          (confirming
            ? `To show orders and Health Points for ${confirmEmail}, confirm it with a 6-digit code we email you.`
            : 'Use the email address you shop with on emis.asia, so your orders and Health Points find you.')}
      </Text>

      {codeSentTo === null && confirming ? (
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={sendCode} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Sending...' : 'Email me a code'}</Text>
        </TouchableOpacity>
      ) : codeSentTo === null ? (
        <>
          <TextInput
            style={input}
            placeholder="Email address"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            onSubmitEditing={sendCode}
          />
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={sendCode} disabled={busy}>
            <Text style={styles.btnText}>{busy ? 'Sending...' : 'Email me a code'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[styles.body, { color: colors.text }]}>Code sent to {codeSentTo}</Text>
          <TextInput
            style={[input, styles.code]}
            placeholder="6-digit code"
            placeholderTextColor={colors.textTertiary}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
            textContentType="oneTimeCode"
            maxLength={6}
            onSubmitEditing={() => step(() => verifyEmailCode(codeSentTo, code), onConfirmed)}
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
            onPress={() => step(() => verifyEmailCode(codeSentTo, code), onConfirmed)}
            disabled={busy}
          >
            <Text style={styles.btnText}>{busy ? 'Checking...' : confirming ? 'Confirm' : 'Sign in'}</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            {confirming ? (
              <View />
            ) : (
              <TouchableOpacity onPress={() => { setCodeSentTo(null); setMessage(null); }}>
                <Text style={[styles.link, { color: colors.primary }]}>Use a different email</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={sendCode} disabled={wait > 0 || busy}>
              <Text style={[styles.link, { color: wait > 0 ? colors.textTertiary : colors.primary }]}>
                {wait > 0 ? `Send again in ${wait}s` : 'Send a new code'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {message && <Text style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}>{message.text}</Text>}

      {!confirming && (APPLE_ENABLED || GOOGLE_ENABLED) && (
        <>
          <Text style={[styles.or, { color: colors.textTertiary }]}>or</Text>
          {APPLE_ENABLED && <AppleSignInButton disabled={busy} onPress={() => step(signInWithApple)} />}
          {GOOGLE_ENABLED && (
            <TouchableOpacity
              style={[styles.btn, styles.outline, { borderColor: colors.borderStrong, opacity: busy ? 0.6 : 1 }]}
              onPress={() => step(signInWithGoogle)}
              disabled={busy}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>Continue with Google</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, borderWidth: 1, padding: 18, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  input: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 16 },
  code: { fontSize: 22, letterSpacing: 6, textAlign: 'center' },
  btn: { padding: 13, borderRadius: 10, alignItems: 'center' },
  outline: { borderWidth: 1 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { fontSize: 14, fontWeight: '600', paddingVertical: 6 },
  message: { fontSize: 14, fontWeight: '600' },
  or: { textAlign: 'center', fontSize: 13 },
});
