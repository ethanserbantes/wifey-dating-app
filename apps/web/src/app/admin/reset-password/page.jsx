"use client";

import { useEffect, useMemo, useState } from "react";

function getTokenFromLocation() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("token") || "";
  } catch {
    return "";
  }
}

export default function AdminResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const t = getTokenFromLocation();
    setToken(t);
  }, []);

  const canSubmit = useMemo(() => {
    return Boolean(token) && Boolean(password) && password === confirm;
  }, [confirm, password, token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const resp = await fetch("/api/admin/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || "Could not reset password");
      }

      setSuccess(true);
    } catch (e2) {
      console.error(e2);
      setError(e2.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Set a new password
        </h1>
        <p className="text-gray-600 mb-8">This link expires in about 1 hour.</p>

        {success ? (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
            <div className="font-semibold">Password updated</div>
            <div className="mt-1">
              You can now{" "}
              <a className="underline" href="/admin">
                sign in
              </a>
              .
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            {!token ? (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-3 rounded-lg text-sm">
                Missing token. Please open the reset link again.
              </div>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
                placeholder="Re-enter password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full bg-[#FF1744] text-white py-3 rounded-lg font-medium hover:bg-[#E01535] transition-colors disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
