import { Redirect } from 'expo-router';
import { useAuth } from '@/utils/auth/useAuth';
import { ActivityIndicator, View } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const { isReady, isAuthenticated } = useAuth();
  const [hasProfile, setHasProfile] = useState(false);
  const [checkedProfile, setCheckedProfile] = useState(false);

  useEffect(() => {
    const checkProfile = async () => {
      try {
        const profile = await AsyncStorage.getItem("profile");
        if (profile) {
          const parsed = JSON.parse(profile);
          // If user has a verified profile, they can skip to quiz
          if (parsed?.is_verified || parsed?.verification_status === "approved") {
            setHasProfile(true);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCheckedProfile(true);
      }
    };

    if (isReady && isAuthenticated) {
      checkProfile();
    } else {
      setCheckedProfile(true);
    }
  }, [isReady, isAuthenticated]);

  if (!isReady || !checkedProfile) {
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
