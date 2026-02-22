import { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Clock, Calendar } from "lucide-react-native";

function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return "Expired";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

function getUrgencyLevel(totalSeconds) {
  const hours = totalSeconds / 3600;
  if (hours < 48) return "urgent";
  if (hours <= 96) return "warning";
  return "neutral";
}

const COLORS = {
  neutral: {
    bg: "#F0F4FF",
    border: "#D0D9F0",
    text: "#3B4A6B",
    icon: "#5B6B8A",
    accent: "#4F6DDE",
  },
  warning: {
    bg: "#FFF8EB",
    border: "#F5D78E",
    text: "#7A5C00",
    icon: "#C49400",
    accent: "#D4A017",
  },
  urgent: {
    bg: "#FFF0F0",
    border: "#F5A3A3",
    text: "#991B1B",
    icon: "#DC2626",
    accent: "#EF4444",
  },
};

export function CountdownBanner({ expiresAt, dateStatus, onScheduleDate }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const secondsRemaining = useMemo(() => {
    if (!expiresAt) return null;
    const exp = new Date(expiresAt).getTime();
    if (Number.isNaN(exp)) return null;
    return Math.max(0, Math.floor((exp - now) / 1000));
  }, [expiresAt, now]);

  // Don't show if no countdown or if a date is already scheduled
  const hasDateScheduled =
    dateStatus === "proposed" ||
    dateStatus === "locked" ||
    dateStatus === "ready" ||
    dateStatus === "unlocked";

  if (secondsRemaining == null || hasDateScheduled) return null;
  if (secondsRemaining <= 0) return null;

  const urgency = getUrgencyLevel(secondsRemaining);
  const colors = COLORS[urgency];
  const countdownText = formatCountdown(secondsRemaining);

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 4,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Clock size={18} color={colors.icon} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {countdownText}
        </Text>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "500",
            color: colors.text,
            opacity: 0.7,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          Schedule a date to keep this match
        </Text>
      </View>

      <TouchableOpacity
        onPress={onScheduleDate}
        activeOpacity={0.85}
        style={{
          backgroundColor: colors.accent,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 7,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Calendar size={13} color="#fff" />
        <Text
          style={{
            fontSize: 12,
            fontWeight: "800",
            color: "#fff",
          }}
        >
          Schedule
        </Text>
      </TouchableOpacity>
    </View>
  );
}
