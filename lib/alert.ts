// Drop-in for React Native's Alert.alert that also works in the web build,
// where the built-in Alert does nothing. Native keeps the system dialog.
import { Alert as RNAlert, Platform, type AlertButton } from 'react-native';

function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    RNAlert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons || []).filter(b => b.style !== 'cancel');
  const cancel = (buttons || []).find(b => b.style === 'cancel');
  if (!actions.length) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  if (window.confirm(text)) actions[actions.length - 1].onPress?.();
  else cancel?.onPress?.();
}

export const Alert = { alert };
