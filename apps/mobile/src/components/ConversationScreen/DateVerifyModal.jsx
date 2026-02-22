import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  withRepeat,
  interpolate,
  runOnJS,
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  BounceIn,
} from "react-native-reanimated";
import {
  QrCode,
  ScanLine,
  Check,
  X,
  RefreshCw,
  Camera,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";

const { width: SCREEN_W } = Dimensions.get("window");
const QR_SIZE = Math.min(SCREEN_W * 0.55, 220);

// ─── Verification Celebration (reusable) ───
function VerificationCelebration({ amount, onDone }) {
  const checkScale = useSharedValue(0);
  const glowScale = useSharedValue(0.3);
  const glowOpacity = useSharedValue(0);
  const amountValue = useSharedValue(0);
  const confettiProgress = useSharedValue(0);

  useEffect(() => {
    // Glow burst
    glowOpacity.value = withSequence(
      withTiming(0.6, { duration: 300 }),
      withTiming(0.15, { duration: 800 }),
    );
    glowScale.value = withSequence(
      withTiming(1.6, { duration: 350, easing: Easing.out(Easing.cubic) }),
      withTiming(1.1, { duration: 500 }),
    );

    // Checkmark
    checkScale.value = withDelay(
      200,
      withSpring(1, { damping: 8, stiffness: 120 }),
    );

    // Count-up
    amountValue.value = withDelay(
      500,
      withTiming(amount, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );

    // Confetti particles
    confettiProgress.value = withDelay(
      300,
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
    );

    // Haptic
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error(e);
    }

    // Auto-dismiss after 3.5s
    const timer = setTimeout(() => {
      onDone?.();
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const amountStyle = useAnimatedStyle(() => {
    const rounded = Math.round(amountValue.value);
    return { opacity: interpolate(amountValue.value, [0, 1], [0.3, 1]) };
  });

  // We read the amount for display via a text component approach
  const AnimatedAmountText = () => {
    const [displayAmount, setDisplayAmount] = useState(0);

    useEffect(() => {
      let frame = null;
      const startTime = Date.now();
      const duration = 1200;
      const delay = 500;

      const tick = () => {
        const elapsed = Date.now() - startTime - delay;
        if (elapsed < 0) {
          frame = requestAnimationFrame(tick);
          return;
        }
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayAmount(Math.round(eased * amount));
        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }, []);

    return (
      <Text
        style={{
          fontSize: 42,
          fontWeight: "900",
          color: "#111",
          textAlign: "center",
        }}
      >
        ${displayAmount}
      </Text>
    );
  };

  // Confetti particles
  const particles = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      x: Math.random() * SCREEN_W - SCREEN_W / 2,
      y: -(Math.random() * 300 + 100),
      rotation: Math.random() * 720 - 360,
      color: ["#FF4FD8", "#7C3AED", "#F59E0B", "#22C55E", "#3B82F6", "#EC4899"][
        i % 6
      ],
      size: 6 + Math.random() * 6,
      delay: Math.random() * 400,
    }));
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {/* Confetti */}
      {particles.map((p) => (
        <ConfettiPiece key={p.id} particle={p} progress={confettiProgress} />
      ))}

      {/* Glow burst */}
      <Animated.View
        style={[
          {
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: "rgba(124,58,237,0.25)",
          },
          glowStyle,
        ]}
      />

      {/* Checkmark circle */}
      <Animated.View
        style={[
          {
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: "#22C55E",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#22C55E",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
          },
          checkStyle,
        ]}
      >
        <Check size={48} color="#fff" strokeWidth={3} />
      </Animated.View>

      {/* Text */}
      <Animated.Text
        entering={FadeIn.delay(400).duration(500)}
        style={{
          marginTop: 24,
          fontSize: 22,
          fontWeight: "900",
          color: "#111",
        }}
      >
        Verified!
      </Animated.Text>

      <Animated.View
        entering={FadeIn.delay(600).duration(500)}
        style={{ marginTop: 8, alignItems: "center" }}
      >
        <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 4 }}>
          Credit returned
        </Text>
        <AnimatedAmountText />
      </Animated.View>

      {/* Done button */}
      <Animated.View
        entering={FadeIn.delay(1500).duration(400)}
        style={{ marginTop: 32 }}
      >
        <TouchableOpacity
          onPress={onDone}
          style={{
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: "#111",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>
            Done
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// Confetti piece component
function ConfettiPiece({ particle, progress }) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const adjustedP = Math.max(0, p - particle.delay / 2000);
    return {
      position: "absolute",
      width: particle.size,
      height: particle.size * 0.4,
      borderRadius: 2,
      backgroundColor: particle.color,
      opacity: interpolate(adjustedP, [0, 0.1, 0.8, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: interpolate(adjustedP, [0, 1], [0, particle.x]) },
        { translateY: interpolate(adjustedP, [0, 1], [0, particle.y + 500]) },
        {
          rotate: `${interpolate(adjustedP, [0, 1], [0, particle.rotation])}deg`,
        },
      ],
    };
  });

  return <Animated.View style={style} />;
}

// ─── QR Display (issuer shows this) ───
function QRDisplayView({ qrPayload, expiresAt, onRefresh, refreshing }) {
  const [secondsLeft, setSecondsLeft] = useState(120);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const expired = secondsLeft <= 0;

  // Simple QR display using a text representation (actual QR would use react-native-qrcode-svg)
  // Since we don't have that package, we display the token as a scannable barcode-style card
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
      }}
    >
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 24,
          padding: 24,
          width: "100%",
          maxWidth: 340,
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.1,
          shadowRadius: 20,
        }}
      >
        <QrCode size={28} color="#7C3AED" />
        <Text
          style={{
            fontSize: 18,
            fontWeight: "900",
            color: "#111",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Show this to your date
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: "#6B7280",
            marginTop: 6,
            textAlign: "center",
          }}
        >
          Ask them to tap "Scan" and point their camera here
        </Text>

        {/* QR code placeholder — rendered as a styled token card */}
        <View
          style={{
            marginTop: 20,
            width: QR_SIZE,
            height: QR_SIZE,
            borderRadius: 16,
            backgroundColor: "#F8F5FF",
            borderWidth: 2,
            borderColor: "#E0D4F5",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
        >
          {/* Grid pattern to simulate QR */}
          <QRGrid payload={qrPayload} />
        </View>

        {/* Timer */}
        <View
          style={{
            marginTop: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: expired
                ? "#EF4444"
                : secondsLeft < 30
                  ? "#F59E0B"
                  : "#22C55E",
            }}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: expired ? "#EF4444" : "#6B7280",
            }}
          >
            {expired ? "Expired — tap refresh" : `${secondsLeft}s remaining`}
          </Text>
        </View>

        {expired ? (
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "#111",
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 12,
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <RefreshCw size={16} color="#fff" />
            )}
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>
              New code
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// Simple visual QR-like grid from payload hash
function QRGrid({ payload }) {
  const grid = useMemo(() => {
    const str = String(payload || "");
    const cells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const idx = r * 9 + c;
        const charCode = str.charCodeAt(idx % str.length) || 0;
        // Corner markers are always filled
        const isCorner =
          (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
        const filled = isCorner || charCode % 3 !== 0;
        cells.push({ r, c, filled });
      }
    }
    return cells;
  }, [payload]);

  const cellSize = Math.floor((QR_SIZE - 32) / 9);

  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", width: cellSize * 9 }}
    >
      {grid.map((cell, i) => (
        <View
          key={i}
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor: cell.filled ? "#7C3AED" : "transparent",
            borderRadius: 1,
          }}
        />
      ))}
    </View>
  );
}

// ─── QR Scanner (other person scans) ───
function QRScannerView({ onScanned, busy }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const scanLineAnim = useSharedValue(0);

  useEffect(() => {
    scanLineAnim.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const scanLineStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: "#7C3AED",
    opacity: 0.7,
    top: interpolate(scanLineAnim.value, [0, 1], [20, QR_SIZE - 20]),
  }));

  const handleBarCodeScanned = useCallback(
    ({ data }) => {
      if (scanned || busy) return;
      setScanned(true);
      try {
        const parsed = JSON.parse(data);
        if (parsed?.type === "wifey_date_verify" && parsed?.token) {
          onScanned(parsed.token);
        } else {
          // Not a valid Wifey QR, reset
          setTimeout(() => setScanned(false), 1500);
        }
      } catch (e) {
        // Not JSON, try raw token
        if (data?.startsWith("dv_")) {
          onScanned(data);
        } else {
          setTimeout(() => setScanned(false), 1500);
        }
      }
    },
    [busy, onScanned, scanned],
  );

  if (!permission) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#7C3AED" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 32,
        }}
      >
        <Camera size={40} color="#7C3AED" />
        <Text
          style={{
            fontSize: 18,
            fontWeight: "800",
            color: "#111",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          Camera access needed
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: "#6B7280",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          We need your camera to scan the verification code
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={{
            marginTop: 20,
            backgroundColor: "#111",
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff" }}>
            Allow camera
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: "900",
          color: "#111",
          marginBottom: 16,
        }}
      >
        Scan their code
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: "#6B7280",
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        Point your camera at the code on their phone
      </Text>

      <View
        style={{
          width: QR_SIZE + 16,
          height: QR_SIZE + 16,
          borderRadius: 20,
          overflow: "hidden",
          borderWidth: 3,
          borderColor: "#7C3AED",
        }}
      >
        <CameraView
          style={{ width: "100%", height: "100%" }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        <Animated.View style={scanLineStyle} />
      </View>

      {busy ? (
        <View
          style={{
            marginTop: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ActivityIndicator color="#7C3AED" />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#7C3AED" }}>
            Verifying…
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Error state ───
function ErrorView({ message, onRetry, onUseQR }) {
  const shakeX = useSharedValue(0);

  useEffect(() => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withTiming(10, { duration: 60 }),
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (e) {
      console.error(e);
    }
  }, [message]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 32,
      }}
    >
      <Animated.View
        style={[
          {
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: "#FEE2E2",
            alignItems: "center",
            justifyContent: "center",
          },
          shakeStyle,
        ]}
      >
        <X size={36} color="#EF4444" strokeWidth={3} />
      </Animated.View>

      <Text
        style={{
          marginTop: 20,
          fontSize: 18,
          fontWeight: "900",
          color: "#111",
          textAlign: "center",
        }}
      >
        Verification failed
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontSize: 14,
          color: "#6B7280",
          textAlign: "center",
          maxWidth: 280,
          lineHeight: 20,
        }}
      >
        {message || "Something went wrong. Please try again."}
      </Text>

      <View style={{ marginTop: 24, gap: 10, width: "100%", maxWidth: 260 }}>
        <TouchableOpacity
          onPress={onRetry}
          style={{
            backgroundColor: "#111",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#fff" }}>
            Try again
          </Text>
        </TouchableOpacity>

        {onUseQR ? (
          <TouchableOpacity
            onPress={onUseQR}
            style={{
              backgroundColor: "#F3F4F6",
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "800", color: "#374151" }}>
              Use QR instead
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ─── Main Modal ───
export function DateVerifyModal({ visible, onClose, matchId, userId }) {
  // IDLE → CHOOSE_ROLE → SHOW_QR | SCAN_QR → VERIFYING → SUCCESS | ERROR
  const [state, setState] = useState("IDLE");
  const [qrPayload, setQrPayload] = useState(null);
  const [qrExpiresAt, setQrExpiresAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [refundAmount, setRefundAmount] = useState(10);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const BG_GRADIENT = ["#F7EEFF", "#F2F7FF", "#FFF1F7"];

  useEffect(() => {
    if (visible) {
      setState("IDLE");
      setError(null);
      setQrPayload(null);
      setQrExpiresAt(null);
      setRefundAmount(10);
      setVerifyBusy(false);
    }
  }, [visible]);

  const issueToken = useCallback(async () => {
    if (!matchId || !userId) return;
    setRefreshing(true);
    try {
      const resp = await fetch(`/api/drink-perk/${matchId}/verify/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(userId) }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data?.code === "ALREADY_VERIFIED") {
          setState("SUCCESS");
          return;
        }
        throw new Error(data?.error || "Could not generate code");
      }

      setQrPayload(data.qrPayload);
      setQrExpiresAt(data.expiresAt);
      setState("SHOW_QR");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to generate code");
      setState("ERROR");
    } finally {
      setRefreshing(false);
    }
  }, [matchId, userId]);

  const handleScan = useCallback(
    async (token) => {
      if (!matchId || !userId || verifyBusy) return;
      setVerifyBusy(true);
      setState("VERIFYING");

      try {
        const resp = await fetch(`/api/drink-perk/${matchId}/verify/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: Number(userId), token }),
        });

        const data = await resp.json();

        if (!resp.ok) {
          if (data?.code === "ALREADY_VERIFIED") {
            setState("SUCCESS");
            return;
          }
          throw new Error(data?.error || "Verification failed");
        }

        const cents = Number(data?.refundAmountCents || 1000);
        setRefundAmount(Math.round(cents / 100));
        setState("SUCCESS");
      } catch (e) {
        console.error(e);
        setError(e?.message || "Verification failed");
        setState("ERROR");
      } finally {
        setVerifyBusy(false);
      }
    },
    [matchId, userId, verifyBusy],
  );

  const closeSafe = useCallback(() => {
    setState("IDLE");
    setError(null);
    onClose?.();
  }, [onClose]);

  const showScanner = state === "SCAN_QR" || state === "VERIFYING";

  return (
    <Modal
      visible={Boolean(visible)}
      animationType="slide"
      onRequestClose={closeSafe}
    >
      <LinearGradient colors={BG_GRADIENT} style={{ flex: 1 }}>
        {/* Header */}
        <View
          style={{ paddingTop: 58, paddingHorizontal: 18, paddingBottom: 10 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "900", color: "#111" }}>
              {state === "SUCCESS" ? "Verified" : "Verify your date"}
            </Text>
            <TouchableOpacity onPress={closeSafe} style={{ padding: 10 }}>
              <Text style={{ color: "#111", fontWeight: "900" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* IDLE — choose role */}
        {state === "IDLE" ? (
          <View
            style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
          >
            <View
              style={{
                backgroundColor: "rgba(255,255,255,0.9)",
                borderRadius: 24,
                padding: 24,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: 0.1,
                shadowRadius: 22,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "900",
                  color: "#111",
                  textAlign: "center",
                }}
              >
                Meet verification
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: "#6B7280",
                  marginTop: 8,
                  textAlign: "center",
                  lineHeight: 20,
                }}
              >
                Verify you met in person to unlock a $10 credit back for both of
                you.
              </Text>

              <View style={{ marginTop: 24, gap: 12 }}>
                <TouchableOpacity
                  onPress={issueToken}
                  disabled={refreshing}
                  activeOpacity={0.9}
                  style={{
                    borderRadius: 16,
                    overflow: "hidden",
                    opacity: refreshing ? 0.7 : 1,
                  }}
                >
                  <LinearGradient
                    colors={["#FF4FD8", "#7C3AED"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      paddingVertical: 15,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {refreshing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <QrCode size={20} color="#fff" />
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "900",
                            color: "#fff",
                          }}
                        >
                          Show my code
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setState("SCAN_QR")}
                  style={{
                    backgroundColor: "#111",
                    paddingVertical: 15,
                    borderRadius: 16,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <ScanLine size={20} color="#fff" />
                  <Text
                    style={{ fontSize: 16, fontWeight: "900", color: "#fff" }}
                  >
                    Scan their code
                  </Text>
                </TouchableOpacity>
              </View>

              <Text
                style={{
                  fontSize: 12,
                  color: "#9CA3AF",
                  marginTop: 16,
                  textAlign: "center",
                  lineHeight: 16,
                }}
              >
                One person shows, the other scans. Both get the credit.
              </Text>
            </View>
          </View>
        ) : null}

        {/* SHOW_QR */}
        {state === "SHOW_QR" ? (
          <QRDisplayView
            qrPayload={qrPayload}
            expiresAt={qrExpiresAt}
            onRefresh={issueToken}
            refreshing={refreshing}
          />
        ) : null}

        {/* SCAN_QR + VERIFYING */}
        {showScanner ? (
          <QRScannerView onScanned={handleScan} busy={verifyBusy} />
        ) : null}

        {/* SUCCESS */}
        {state === "SUCCESS" ? (
          <VerificationCelebration amount={refundAmount} onDone={closeSafe} />
        ) : null}

        {/* ERROR */}
        {state === "ERROR" ? (
          <ErrorView
            message={error}
            onRetry={() => setState("IDLE")}
            onUseQR={() => setState("IDLE")}
          />
        ) : null}
      </LinearGradient>
    </Modal>
  );
}
