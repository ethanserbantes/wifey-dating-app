import { Redirect } from 'expo-router';
import { useAuth } from '@/utils/auth/useAuth';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { isReady, isAuthenticated } = useAuth();

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/discover" />;
  }

  return <Redirect href="/onboarding" />;
}
