import { Redirect } from 'expo-router';
import { useAuth } from '@/utils/auth/useAuth';
import { ActivityIndicator, View } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const { isReady, isAuthenticated } = useAuth();
  const [checkedProfile, setCheckedProfile] = useState(false);
  const [screeningPassed, setScreeningPassed] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    const checkProfile = async () => {
      try {
        const profile = await AsyncStorage.getItem("profile");
        const onboardingSeen = await AsyncStorage.getItem("onboarding_seen");
        
        if (profile) {
          const parsed = JSON.parse(profile);
          // Check if they passed screening
          if (parsed?.screening_result === "pass") {
            setScreeningPassed(true);
            // Check if they completed the full onboarding
            if (onboardingSeen === "true") {
              setOnboardingComplete(true);
            }
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
    // Full flow: Gate → Quiz → Onboarding (12 steps) → Notifications → Home
    if (!screeningPassed) {
      // Not passed quiz yet
      return <Redirect href="/screening/gate" />;
    }
    if (!onboardingComplete) {
      // Passed quiz but not done with onboarding
      return <Redirect href="/onboarding/profile" />;
    }
    // Fully complete, go to home
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/onboarding" />;
}
