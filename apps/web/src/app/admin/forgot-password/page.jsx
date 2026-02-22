"use client";

import { useMemo, useState } from "react";

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("ethanserbantes@gmail.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [resetPath, setResetPath] = useState(null);

  const normalizedEmail = useMemo(() => {
    return String(email || "")
      .trim()
      .toLowerCase();
  }, [email]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setResetPath(null);

    try {
      const resp = await fetch("/api/admin/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || "Could not request reset");
      }

      setSuccess(data.message || "Check your email for a reset link.");
      if (data.resetPath) {
        setResetPath(data.resetPath);
      }
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
          Reset password
        </h1>
        <p className="text-gray-600 mb-8">
          Enter your admin email and we’ll send a reset link.
        </p>

        <form onSubmit={onSubmit} className="space-y-6">
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

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
              {success}
              {resetPath ? (
                <div className="mt-3">
                  <div className="text-xs text-green-900 font-semibold">
                    Dev link (not shown in production):
                  </div>
                  <a className="break-all underline" href={resetPath}>
                    {resetPath}
                  </a>
                </div>
              ) : null}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF1744] text-white py-3 rounded-lg font-medium hover:bg-[#E01535] transition-colors disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <div className="text-sm text-gray-600">
            <a className="hover:text-gray-900" href="/admin">
              Back to sign in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
