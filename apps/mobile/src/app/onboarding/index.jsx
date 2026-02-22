import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const COUPLE_IMAGES = [
  {
    uri: "https://raw.createusercontent.com/09ac536f-5e0c-4bb4-aa8d-8e14af5a4ce4/",
    alt: "Romantic couple at dinner",
  },
  {
    uri: "https://raw.createusercontent.com/953ffe16-bc4a-4834-b313-1f57f967cbbe/",
    alt: "Couple walking in park",
  },
  {
    uri: "https://raw.createusercontent.com/c58fb4e4-eceb-4d64-b6af-57f2e1de36e1/",
    alt: "Couple on rooftop",
  },
];

const SERIF_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});

export default function OnboardingWelcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasUser, setHasUser] = useState(false);

  const CTA_GRADIENT = ["#FF4FD8", "#7C3AED"];

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const userRaw = await AsyncStorage.getItem("user");
        if (!cancelled) {
          setHasUser(!!userRaw);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setHasUser(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const markSeenAndContinue = useCallback(async () => {
    try {
      await AsyncStorage.setItem("onboarding_seen", "true");
    } catch (e) {
      console.error(e);
    }

    if (hasUser) {
      router.replace("/home");
      return;
    }

    router.replace("/auth/login");
  }, [hasUser, router]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0D0B14",
        }}
      >
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const photoColH = SCREEN_H * 0.52;
  const leftW = SCREEN_W * 0.48;
  const rightW = SCREEN_W * 0.48;
  const gap = 6;

  return (
    <View style={{ flex: 1, backgroundColor: "#0D0B14" }}>
      <StatusBar style="light" />

      {/* ── Photo collage ── */}
      <View
        style={{
          width: SCREEN_W,
          height: photoColH + insets.top,
          paddingTop: insets.top,
          flexDirection: "row",
          justifyContent: "center",
          gap: gap,
          overflow: "hidden",
        }}
      >
        {/* Left tall photo */}
        <View
          style={{
            width: leftW,
            height: photoColH,
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <Image
            source={COUPLE_IMAGES[0].uri}
            alt={COUPLE_IMAGES[0].alt}
            contentFit="cover"
            transition={400}
            style={{ width: "100%", height: "100%" }}
          />
        </View>

        {/* Right column — two stacked photos */}
        <View
          style={{
            width: rightW,
            height: photoColH,
            gap: gap,
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            <Image
              source={COUPLE_IMAGES[1].uri}
              alt={COUPLE_IMAGES[1].alt}
              contentFit="cover"
              transition={400}
              style={{ width: "100%", height: "100%" }}
            />
          </View>
          <View
            style={{
              flex: 1,
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            <Image
              source={COUPLE_IMAGES[2].uri}
              alt={COUPLE_IMAGES[2].alt}
              contentFit="cover"
              transition={400}
              style={{ width: "100%", height: "100%" }}
            />
          </View>
        </View>
      </View>

      {/* Soft gradient fade over bottom of photos */}
      <LinearGradient
        colors={["transparent", "#0D0B14"]}
        style={{
          position: "absolute",
          top: photoColH + insets.top - 80,
          left: 0,
          right: 0,
          height: 80,
        }}
      />

      {/* ── Copy & CTA ── */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 28,
          justifyContent: "space-between",
          paddingTop: 20,
          paddingBottom: insets.bottom + 20,
        }}
      >
        {/* Text block */}
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontFamily: SERIF_FONT,
              fontSize: 36,
              fontWeight: "700",
              color: "#FFFFFF",
              textAlign: "center",
              lineHeight: 44,
              letterSpacing: 0.3,
            }}
          >
            Find someone{"\n"}worth keeping.
          </Text>

          <Text
            style={{
              marginTop: 14,
              fontSize: 15,
              color: "rgba(255,255,255,0.6)",
              textAlign: "center",
              lineHeight: 22,
              maxWidth: 300,
              fontWeight: "500",
            }}
          >
            Wifey screens for serious intent, so every match is someone ready
            for a real connection.
          </Text>
        </View>

        {/* Bottom section */}
        <View style={{ alignItems: "center", gap: 16 }}>
          {/* Get Started button */}
          <TouchableOpacity
            onPress={markSeenAndContinue}
            activeOpacity={0.9}
            style={{
              width: "100%",
              maxWidth: 340,
              borderRadius: 16,
              overflow: "hidden",
              shadowColor: "#FF4FD8",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.35,
              shadowRadius: 16,
            }}
          >
            <LinearGradient
              colors={CTA_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingVertical: 18, alignItems: "center" }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "800",
                  color: "#fff",
                  letterSpacing: 0.5,
                }}
              >
                Get Started
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Subtle tagline */}
          <Text
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.3)",
              fontWeight: "600",
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            Dating, done differently
          </Text>
        </View>
      </View>
    </View>
  );
}
