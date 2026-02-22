import { View, Text, TouchableOpacity, Modal } from "react-native";
import { Clock, Calendar, ShieldCheck } from "lucide-react-native";

export function CountdownRulesModal({ visible, onScheduleDate, onDismiss }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 28,
        }}
      >
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: 20,
            width: "100%",
            maxWidth: 360,
          }}
        >
          {/* Icon */}
          <View
            style={{
              alignSelf: "center",
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#F0F4FF",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Clock size={28} color="#4F6DDE" />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: "#111",
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            How Wifey Works
          </Text>

          {/* Rules */}
          <View style={{ gap: 14, marginBottom: 24 }}>
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <Calendar size={18} color="#4F6DDE" style={{ marginTop: 2 }} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontWeight: "500",
                  color: "#333",
                  lineHeight: 20,
                }}
              >
                You have <Text style={{ fontWeight: "800" }}>7 days</Text> to
                schedule a date inside Wifey.
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <Clock size={18} color="#C49400" style={{ marginTop: 2 }} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontWeight: "500",
                  color: "#333",
                  lineHeight: 20,
                }}
              >
                If no date is scheduled, this match{" "}
                <Text style={{ fontWeight: "800" }}>expires</Text>.
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <ShieldCheck size={18} color="#22C55E" style={{ marginTop: 2 }} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontWeight: "500",
                  color: "#333",
                  lineHeight: 20,
                }}
              >
                Date credits are{" "}
                <Text style={{ fontWeight: "800" }}>protected</Text> when dates
                are scheduled and verified in-app.
              </Text>
            </View>
          </View>

          {/* Buttons */}
          <TouchableOpacity
            onPress={onScheduleDate}
            activeOpacity={0.85}
            style={{
              backgroundColor: "#111",
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>
              Schedule Date
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onDismiss}
            activeOpacity={0.85}
            style={{
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#6B7280" }}>
              Got it
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
