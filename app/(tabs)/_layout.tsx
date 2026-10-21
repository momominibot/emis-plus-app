import { Tabs } from 'expo-router';
import FloatingTabBar from '@/components/FloatingTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: 'Tools',
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
        }}
      />
    </Tabs>
  );
}
