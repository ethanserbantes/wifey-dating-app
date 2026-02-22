"use client";

import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import adminFetch from "@/utils/adminFetch";

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(null);

  useEffect(() => {
    // Load admin from the real cookie-backed session first.
    // (localStorage is best-effort only and can be cleared.)
    const loadAdmin = async () => {
      try {
        const resp = await adminFetch("/api/admin/me");
        if (resp.ok) {
          const data = await resp.json().catch(() => ({}));
          const nextAdmin = data?.admin || null;
          setAdmin(nextAdmin);
          if (typeof window !== "undefined" && nextAdmin) {
            localStorage.setItem("admin", JSON.stringify(nextAdmin));
          }
          return;
        }
      } catch (e) {
        console.error("[DASHBOARD] Error loading admin session:", e);
      }

      // Fallback: legacy localStorage (helps in dev / old sessions)
      try {
        const adminData = localStorage.getItem("admin");
        if (adminData) {
          setAdmin(JSON.parse(adminData));
        }
      } catch (e) {
        console.error("[DASHBOARD] Error reading admin from localStorage:", e);
      }
    };

    loadAdmin();
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      console.log("[DASHBOARD] Fetching analytics...");
      const response = await adminFetch("/api/admin/analytics");
      console.log("[DASHBOARD] Analytics response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("[DASHBOARD] Analytics data:", data);
        setAnalytics(data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("[DASHBOARD] Analytics error response:", errorData);
      }
    } catch (error) {
      console.error("[DASHBOARD] Error loading analytics:", error);
      console.error("[DASHBOARD] Error message:", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout currentPage="dashboard">
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {admin?.role === "OWNER" && (
            <a
              href="/admin/quiz-builder"
              className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Quiz Builder
              </h3>
              <p className="text-sm text-gray-600">
                Visual editor for building and managing quizzes
              </p>
            </a>
          )}

          {admin && ["OWNER", "ADMIN", "MODERATOR"].includes(admin?.role) && (
            <a
              href="/admin/fake-profiles"
              className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Fake Profiles
              </h3>
              <p className="text-sm text-gray-600">
                Create seed dating profiles (photos, videos, prompts, basics)
              </p>
            </a>
          )}

          {admin && ["OWNER", "ADMIN", "MODERATOR"].includes(admin?.role) && (
            <a
              href="/admin/users"
              className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                User Management
              </h3>
              <p className="text-sm text-gray-600">
                View and manage user accounts and bans
              </p>
            </a>
          )}

          {admin && ["OWNER", "ADMIN", "MODERATOR"].includes(admin?.role) && (
            <a
              href="/admin/reports"
              className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                User Reports
              </h3>
              <p className="text-sm text-gray-600">
                Review and manage user reports
              </p>
            </a>
          )}

          <a
            href="/admin/support"
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Support Tickets
            </h3>
            <p className="text-sm text-gray-600">
              Handle user support requests
            </p>
          </a>

          {/* Always show these quick links (AdminLayout already gates access). */}
          <a
            href="/admin/analytics"
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Screening Analytics
            </h3>
            <p className="text-sm text-gray-600">
              View screening performance and where people drop.
            </p>
          </a>

          <a
            href="/admin/categories"
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Categories
            </h3>
            <p className="text-sm text-gray-600">
              Add/edit category options + emojis shown in the app.
            </p>
          </a>

          {admin?.role === "OWNER" && (
            <a
              href="/admin/admins"
              className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Admin Roles
              </h3>
              <p className="text-sm text-gray-600">
                Manage admin users and permissions
              </p>
            </a>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
          </div>
        ) : (
          analytics && (
            <div className="space-y-6">
              {/* User Stats */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  User Statistics
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-700">
                      {analytics.users?.total || 0}
                    </div>
                    <div className="text-sm text-gray-600">Total Users</div>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-700">
                      {analytics.users?.activeSessions || 0}
                    </div>
                    <div className="text-sm text-gray-600">
                      Currently Active
                    </div>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-purple-700">
                      {analytics.users?.newToday || 0}
                    </div>
                    <div className="text-sm text-gray-600">New Today</div>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-indigo-700">
                      {analytics.users?.newThisWeek || 0}
                    </div>
                    <div className="text-sm text-gray-600">New This Week</div>
                  </div>

                  <div className="bg-teal-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-teal-700">
                      {analytics.users?.byStatus?.APPROVED || 0}
                    </div>
                    <div className="text-sm text-gray-600">Approved Users</div>
                  </div>
                </div>

                {/* User Status Breakdown */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Users by Status
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-lg font-bold text-gray-900">
                        {analytics.users?.byStatus?.PENDING_SCREENING || 0}
                      </div>
                      <div className="text-xs text-gray-600">
                        Pending Screening
                      </div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-lg font-bold text-gray-900">
                        {analytics.users?.byStatus?.APPROVED || 0}
                      </div>
                      <div className="text-xs text-gray-600">Approved</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-lg font-bold text-gray-900">
                        {analytics.users?.byStatus?.COOLDOWN || 0}
                      </div>
                      <div className="text-xs text-gray-600">Cooldown</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-lg font-bold text-gray-900">
                        {analytics.users?.byStatus?.LIFETIME_INELIGIBLE || 0}
                      </div>
                      <div className="text-xs text-gray-600">Ineligible</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Support & Moderation Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Support Tickets */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    Support Tickets
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Total</span>
                      <span className="text-lg font-bold text-gray-900">
                        {analytics.supportTickets?.total || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Open</span>
                      <span className="text-lg font-bold text-orange-700">
                        {analytics.supportTickets?.open || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">In Progress</span>
                      <span className="text-lg font-bold text-yellow-700">
                        {analytics.supportTickets?.inProgress || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Resolved</span>
                      <span className="text-lg font-bold text-green-700">
                        {analytics.supportTickets?.resolved || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* User Reports */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    User Reports
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Total</span>
                      <span className="text-lg font-bold text-gray-900">
                        {analytics.userReports?.total || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Pending</span>
                      <span className="text-lg font-bold text-orange-700">
                        {analytics.userReports?.pending || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Investigating
                      </span>
                      <span className="text-lg font-bold text-yellow-700">
                        {analytics.userReports?.investigating || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Resolved</span>
                      <span className="text-lg font-bold text-green-700">
                        {analytics.userReports?.resolved || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bans */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    Active Bans
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-600 mb-2">
                        Screening Bans
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Active</span>
                        <span className="font-bold text-red-700">
                          {analytics.bans?.screening?.active || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Permanent</span>
                        <span className="font-bold text-gray-900">
                          {analytics.bans?.screening?.permanent || 0}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-gray-200 pt-3">
                      <div className="text-sm text-gray-600 mb-2">
                        Behavior Bans
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Active</span>
                        <span className="font-bold text-red-700">
                          {analytics.bans?.behavior?.active || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Permanent</span>
                        <span className="font-bold text-gray-900">
                          {analytics.bans?.behavior?.permanent || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Screening Stats */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  Screening Statistics
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900">
                      {analytics.screening?.total || 0}
                    </div>
                    <div className="text-sm text-gray-600">Total Attempts</div>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-700">
                      {analytics.screening?.outcomes?.APPROVED || 0}
                    </div>
                    <div className="text-sm text-gray-600">Approved</div>
                  </div>

                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-red-700">
                      {analytics.screening?.outcomes?.FAILED || 0}
                    </div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-700">
                      {analytics.screening?.outcomes?.COOLDOWN || 0}
                    </div>
                    <div className="text-sm text-gray-600">Cooldown</div>
                  </div>
                </div>

                {analytics.screening?.phaseFailures &&
                  analytics.screening.phaseFailures.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Phase Failure Distribution
                      </h3>
                      <div className="space-y-2">
                        {analytics.screening.phaseFailures.map((pf) => (
                          <div key={pf.phase} className="flex items-center">
                            <span className="text-sm text-gray-600 w-24">
                              Phase {pf.phase}
                            </span>
                            <div className="flex-1 bg-gray-200 rounded-full h-4">
                              <div
                                className="bg-[#FF1744] h-4 rounded-full"
                                style={{
                                  width: `${(pf.count / analytics.screening.total) * 100}%`,
                                }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-600 ml-4 w-12 text-right">
                              {pf.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )
        )}
      </div>
    </AdminLayout>
  );
}
