import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { sendChatMessage, ChatMessage } from '@/lib/ai';

const QUICK_PROMPTS = [
  'Which wound dressing should I use?',
  'How do I choose compression stockings?',
  'What ostomy supplies do I need?',
  'How does delivery work?',
];

export default function AIAssistantScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hi! I'm the EMIS+ product assistant. I can help you find the right wound care, ostomy supplies, compression wear, and more.\n\nJust describe what you need and I'll suggest products. Remember: I help with product selection only, not medical diagnosis.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const reply = await sendChatMessage(messages, text);
      setMessages(prev => [...prev, reply]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble responding. Please try again.' }]);
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Product assistant' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg, i) => (
            <View key={i} style={[
              styles.messageBubble,
              msg.role === 'user'
                ? [styles.userBubble, { backgroundColor: colors.primary }]
                : [styles.assistantBubble, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }],
            ]}>
              <Text style={[
                styles.messageText,
                { color: msg.role === 'user' ? colors.onPrimary : colors.text },
              ]}>{msg.content}</Text>
              {msg.links && msg.links.length > 0 && (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {msg.links.map((l, j) => (
                    <TouchableOpacity
                      key={j}
                      style={[styles.productSuggestion, { backgroundColor: colors.primaryLight }]}
                      onPress={() => Linking.openURL(l.url)}
                    >
                      <Text style={[styles.suggestionTitle, { color: colors.primaryInk }]}>{l.title}</Text>
                      <Text style={[styles.suggestionPrice, { color: colors.textSecondary }]}>{l.note}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
          {messages.length <= 1 && (
            <View style={styles.quickWrap}>
              {QUICK_PROMPTS.map(p => (
                <TouchableOpacity key={p} style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => send(p)}>
                  <Text style={[styles.quickText, { color: colors.primaryInk }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {loading && (
            <View style={[styles.typing, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textSecondary }}>●●●</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
            placeholder="Ask about products..."
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            multiline
          />
          <TouchableOpacity style={[styles.sendBtn, { backgroundColor: colors.primary }]} onPress={() => send(input)} disabled={loading}>
            <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messageBubble: { maxWidth: '85%', padding: 14, borderRadius: 16 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  productSuggestion: { padding: 10, borderRadius: 10 },
  suggestionTitle: { fontSize: 14, fontWeight: '700' },
  suggestionPrice: { fontSize: 12, marginTop: 2 },
  typing: { alignSelf: 'flex-start', padding: 12, borderRadius: 16, borderBottomLeftRadius: 4 },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  quickText: { fontSize: 14, fontWeight: '600' },
  inputBar: { flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, alignItems: 'flex-end' },
  input: { flex: 1, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 24, fontSize: 16, maxHeight: 110, minHeight: 48 },
  sendBtn: { paddingHorizontal: 20, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
});
