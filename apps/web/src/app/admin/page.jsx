"use client";

import { useMemo, useState } from "react";
import { setAdminSessionToken } from "@/utils/adminFetch";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("ethanserbantes@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showSetup, setShowSetup] = useState(false);

  const normalizedEmail = useMemo(() => {
    return String(email || "")
      .trim()
      .toLowerCase();
  }, [email]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Keep localStorage for legacy pages, but the real auth is cookie-based now.
      localStorage.setItem("admin", JSON.stringify(data.admin));

      // Fallback (in case cookies are blocked): store the session token.
      if (data.sessionToken) {
        setAdminSessionToken(data.sessionToken);
      }

      window.location.href = "/admin/dashboard";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Setup failed");
      }

      // After setup, immediately log in.
      await handleLogin({ preventDefault: () => {} });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Wifey Admin</h1>
        <p className="text-gray-600 mb-8">Sign in to manage the platform</p>

        <form
          onSubmit={showSetup ? handleSetup : handleLogin}
          className="space-y-6"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
              placeholder="you@domain.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF1744] text-white py-3 rounded-lg font-medium hover:bg-[#E01535] transition-colors disabled:opacity-50"
          >
            {loading
              ? "Working…"
              : showSetup
                ? "Create Owner Account"
                : "Sign In"}
          </button>

          <div className="flex items-center justify-between text-sm">
            <a
              className="text-gray-600 hover:text-gray-900"
              href="/admin/forgot-password"
            >
              Forgot password?
            </a>
            <button
              type="button"
              onClick={() => setShowSetup((v) => !v)}
              className="text-gray-600 hover:text-gray-900"
            >
              {showSetup ? "Back to sign in" : "First time setup"}
            </button>
          </div>

          {showSetup ? (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
              <div className="font-semibold text-gray-800">
                One-time owner setup
              </div>
              <div className="mt-1">
                This only works if there are no admins yet, and only for{" "}
                <strong>ethanserbantes@gmail.com</strong>.
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
