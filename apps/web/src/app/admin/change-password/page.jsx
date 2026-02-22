"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/AdminLayout";
import adminFetch from "@/utils/adminFetch";

export default function AdminChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clientValidationError = useMemo(() => {
    if (!currentPassword || !newPassword || !confirmPassword) return "";
    if (newPassword.length < 8)
      return "New password must be at least 8 characters";
    if (newPassword !== confirmPassword) return "Passwords do not match";
    if (newPassword === currentPassword)
      return "New password must be different";
    return "";
  }, [currentPassword, newPassword, confirmPassword]);

  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword: cp, newPassword: np }) => {
      const resp = await adminFetch("/api/admin/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cp, newPassword: np }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          data?.error ||
            `When fetching /api/admin/password/change, the response was [${resp.status}] ${resp.statusText}`,
        );
      }

      return data;
    },
    onSuccess: () => {
      setError("");
      setSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => {
      console.error(e);
      setSuccess("");
      setError(e?.message || "Could not change password");
    },
  });

  const onSubmit = (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (clientValidationError) {
      setError(clientValidationError);
      return;
    }

    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  const isBusy = changePasswordMutation.isPending;
  const isDisabled =
    isBusy ||
    !currentPassword ||
    !newPassword ||
    !confirmPassword ||
    Boolean(clientValidationError);

  return (
    <AdminLayout currentPage="change-password">
      <div className="p-6">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold text-gray-900">Change password</h2>
          <p className="text-gray-600 mt-1">
            This updates your admin password and signs out other sessions.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
                placeholder="Current password"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent outline-none"
                placeholder="Repeat new password"
                autoComplete="new-password"
              />
            </div>

            {error ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isDisabled}
              className="bg-[#FF1744] text-white px-5 py-3 rounded-lg font-medium hover:bg-[#E01535] transition-colors disabled:opacity-50"
            >
              {isBusy ? "Updating…" : "Update password"}
            </button>

            {clientValidationError && !error ? (
              <div className="text-sm text-gray-500">
                {clientValidationError}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
