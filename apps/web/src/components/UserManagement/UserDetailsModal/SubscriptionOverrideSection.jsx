import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function formatDateShort(value) {
  try {
    if (!value) return "";
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export default function SubscriptionOverrideSection({ userId }) {
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => ["adminUserSubscriptionOverride", userId],
    [userId],
  );

  const overrideQuery = useQuery({
    queryKey,
    enabled: Number.isFinite(Number(userId)),
    queryFn: async () => {
      const resp = await fetch(`/api/admin/users/${userId}/subscription`);
      if (!resp.ok) {
        throw new Error(
          `When fetching /api/admin/users/${userId}/subscription, the response was [${resp.status}] ${resp.statusText}`,
        );
      }
      return resp.json();
    },
  });

  const currentTier = overrideQuery.data?.override?.tier || null;
  const currentExpiresAt = overrideQuery.data?.override?.expiresAt || null;

  const [tier, setTier] = useState("none"); // none | serious | committed
  const [expiresDays, setExpiresDays] = useState("30");
  const [useExpiry, setUseExpiry] = useState(false);

  useEffect(() => {
    const t = String(currentTier || "none");
    if (t === "serious" || t === "committed") {
      setTier(t);
      setUseExpiry(Boolean(currentExpiresAt));
      setExpiresDays("30");
      return;
    }
    setTier("none");
    setUseExpiry(false);
    setExpiresDays("30");
  }, [currentTier, currentExpiresAt]);

  const saveMutation = useMutation({
    mutationFn: async ({ tier: nextTier, expiresAt }) => {
      const resp = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: nextTier, expiresAt }),
      });
      if (!resp.ok) {
        const msg = await resp.json().catch(() => null);
        throw new Error(msg?.error || "Could not save subscription override");
      }
      return resp.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        const msg = await resp.json().catch(() => null);
        throw new Error(msg?.error || "Could not clear subscription override");
      }
      return resp.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const statusLabel = useMemo(() => {
    if (overrideQuery.isLoading) return "Loading…";
    if (overrideQuery.isError) return "Could not load";
    if (!currentTier) return "None";
    return currentTier;
  }, [currentTier, overrideQuery.isError, overrideQuery.isLoading]);

  const expiresLabel = useMemo(() => {
    if (!currentTier) return "";
    if (!currentExpiresAt) return "Never";
    const s = formatDateShort(currentExpiresAt);
    return s ? s : "(invalid date)";
  }, [currentExpiresAt, currentTier]);

  const computedExpiresAt = useMemo(() => {
    if (!useExpiry) return null;
    const daysNum = Number(expiresDays);
    if (!Number.isFinite(daysNum) || daysNum <= 0) return null;
    const dt = new Date();
    dt.setDate(dt.getDate() + Math.floor(daysNum));
    return dt.toISOString();
  }, [expiresDays, useExpiry]);

  const isBusy =
    overrideQuery.isLoading ||
    saveMutation.isPending ||
    clearMutation.isPending;

  const onSave = async () => {
    try {
      const nextTier = tier;
      const expiresAt = computedExpiresAt;
      await saveMutation.mutateAsync({ tier: nextTier, expiresAt });
    } catch (e) {
      console.error(e);
      window.alert(e?.message || "Could not save override");
    }
  };

  const onClear = async () => {
    try {
      await clearMutation.mutateAsync();
    } catch (e) {
      console.error(e);
      window.alert(e?.message || "Could not clear override");
    }
  };

  return (
    <div className="border-t border-gray-200 pt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Subscription override
      </h3>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="text-sm text-gray-700">
          <div>
            <span className="text-gray-600">Current:</span>{" "}
            <span className="font-semibold">{statusLabel}</span>
          </div>
          {currentTier ? (
            <div className="mt-1">
              <span className="text-gray-600">Expires:</span>{" "}
              <span className="font-semibold">{expiresLabel}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-bold text-gray-600">Grant tier</div>
            <select
              value={tier}
              disabled={isBusy}
              onChange={(e) => setTier(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="none">None</option>
              <option value="serious">Serious</option>
              <option value="committed">Committed</option>
            </select>
            <div className="mt-2 text-xs text-gray-500">
              This bypasses RevenueCat for this user.
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-600">Expiry</div>
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={useExpiry}
                disabled={isBusy || tier === "none"}
                onChange={(e) => setUseExpiry(e.target.checked)}
              />
              Auto-expire
            </label>

            <div className="mt-2 flex items-center gap-2">
              <input
                value={expiresDays}
                onChange={(e) => setExpiresDays(e.target.value)}
                disabled={isBusy || tier === "none" || !useExpiry}
                className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                placeholder="30"
              />
              <div className="text-sm text-gray-700">days</div>
            </div>

            {useExpiry && tier !== "none" ? (
              <div className="mt-2 text-xs text-gray-500">
                Will set expiresAt to: {computedExpiresAt || "(invalid)"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex gap-3 flex-wrap">
          <button
            onClick={onSave}
            disabled={isBusy}
            className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white font-semibold disabled:opacity-60"
          >
            Save
          </button>

          <button
            onClick={onClear}
            disabled={isBusy || !currentTier}
            className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-900 font-semibold disabled:opacity-60"
          >
            Clear override
          </button>

          <div className="text-xs text-gray-500 self-center">
            Tip: set to “Committed” for VIPs or testing.
          </div>
        </div>
      </div>
    </div>
  );
}
