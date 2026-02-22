"use client";

import { useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useQuery } from "@tanstack/react-query";
import adminFetch from "@/utils/adminFetch";

async function fetchAnalytics() {
  const response = await adminFetch("/api/admin/analytics");
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `When fetching /api/admin/analytics, the response was [${response.status}] ${response.statusText} ${text}`,
    );
  }
  return response.json();
}

function prettyGender(g) {
  const s = String(g || "").trim();
  if (!s) return "Unknown";
  if (s.toLowerCase() === "male") return "Male";
  if (s.toLowerCase() === "female") return "Female";
  if (s.toLowerCase() === "unknown") return "Unknown";
  return s;
}

function prettyReason(r) {
  const s = String(r || "").trim();
  if (!s) return "Unknown";
  if (s === "phase_threshold") return "Phase threshold";
  if (s === "lifetime_rule") return "Lifetime rule";
  if (s === "hard_weight") return "Hard-ban answer";
  if (s === "unknown") return "Unknown";
  return s;
}

function prettyUnmatchReason(code) {
  const c = String(code || "").trim();
  if (!c) return "Unknown";
  if (c === "NOT_INTERESTED") return "Not interested";
  if (c === "NOT_READY_TO_MEET") return "Not ready to meet";
  if (c === "NO_LONGER_LOOKING") return "No longer looking";
  if (c === "UNCOMFORTABLE") return "Uncomfortable";
  if (c === "SAFETY_CONCERN") return "Safety concern";
  if (c === "OTHER") return "Other";
  if (c === "UNKNOWN") return "Unknown";
  return c;
}

export default function AnalyticsPage() {
  const {
    data: analytics,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: fetchAnalytics,
  });

  const screeningTotal = analytics?.screening?.total || 0;
  const outcomes = analytics?.screening?.outcomes || {};

  const passRateByGender = Array.isArray(analytics?.screening?.passRateByGender)
    ? analytics.screening.passRateByGender
    : [];

  const failReasons = Array.isArray(analytics?.screening?.failReasons)
    ? analytics.screening.failReasons
    : [];

  const questionDropoff = Array.isArray(analytics?.screening?.questionDropoff)
    ? analytics.screening.questionDropoff
    : [];

  const questionDropoffRows = useMemo(() => {
    return questionDropoff.map((q) => {
      const text = String(q.questionText || "");
      const shortText =
        text.length > 120 ? `${text.slice(0, 117)}…` : text || "—";

      return {
        ...q,
        shortText,
      };
    });
  }, [questionDropoff]);

  const unmatchByReason = Array.isArray(
    analytics?.unmatches?.last30DaysByReason,
  )
    ? analytics.unmatches.last30DaysByReason
    : [];

  const unmatchRecent = Array.isArray(analytics?.unmatches?.recent)
    ? analytics.unmatches.recent
    : [];

  return (
    <AdminLayout currentPage="analytics">
      <div className="p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Screening Analytics
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Quick read on screening performance and where people drop.
            </p>
          </div>

          <button
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
          </div>
        ) : error ? (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-red-700">
              Could not load analytics.
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {String(error?.message || "")}
            </div>
          </div>
        ) : analytics ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-3xl font-bold text-gray-900">
                  {screeningTotal}
                </div>
                <div className="text-sm text-gray-600 mt-1">Total Attempts</div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-3xl font-bold text-green-600">
                  {outcomes.APPROVED || 0}
                </div>
                <div className="text-sm text-gray-600 mt-1">Approved</div>
                <div className="text-xs text-gray-500 mt-1">
                  {screeningTotal > 0
                    ? Math.round(
                        ((outcomes.APPROVED || 0) / screeningTotal) * 100,
                      )
                    : 0}
                  %
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-3xl font-bold text-red-600">
                  {outcomes.FAILED || 0}
                </div>
                <div className="text-sm text-gray-600 mt-1">Failed</div>
                <div className="text-xs text-gray-500 mt-1">
                  {screeningTotal > 0
                    ? Math.round(
                        ((outcomes.FAILED || 0) / screeningTotal) * 100,
                      )
                    : 0}
                  %
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-3xl font-bold text-yellow-600">
                  {outcomes.COOLDOWN || 0}
                </div>
                <div className="text-sm text-gray-600 mt-1">Cooldown</div>
                <div className="text-xs text-gray-500 mt-1">
                  {screeningTotal > 0
                    ? Math.round(
                        ((outcomes.COOLDOWN || 0) / screeningTotal) * 100,
                      )
                    : 0}
                  %
                </div>
              </div>
            </div>

            {/* Pass rate by gender */}
            {passRateByGender.length > 0 ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Pass Rate by Gender
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Based on each user’s latest completed screening attempt.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Gender
                        </th>
                        <th className="px-4 py-2 text-right text-gray-700">
                          Users
                        </th>
                        <th className="px-4 py-2 text-right text-gray-700">
                          Approved
                        </th>
                        <th className="px-4 py-2 text-right text-gray-700">
                          Pass rate
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {passRateByGender.map((row) => {
                        const genderLabel = prettyGender(row.gender);
                        const total = row.total || 0;
                        const approved = row.approved || 0;
                        const passRate = row.passRate || 0;

                        return (
                          <tr
                            key={String(row.gender)}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-4 py-2 text-gray-900">
                              {genderLabel}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              {total}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              {approved}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-900 font-semibold">
                              {passRate}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Fail reasons */}
            {failReasons.length > 0 ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Fail Reasons Distribution
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Best-effort inference (hard-ban answer vs lifetime rule vs
                  phase threshold).
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Outcome
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Reason
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Phase
                        </th>
                        <th className="px-4 py-2 text-right text-gray-700">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {failReasons.map((row, idx) => {
                        const outcomeLabel = String(row.outcome || "");
                        const reasonLabel = prettyReason(row.reason);
                        const phaseLabel = row.phase ? String(row.phase) : "—";
                        const count = row.count || 0;
                        const key = `${outcomeLabel}-${reasonLabel}-${phaseLabel}-${idx}`;

                        return (
                          <tr key={key} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900">
                              {outcomeLabel}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {reasonLabel}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {phaseLabel}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-900 font-semibold">
                              {count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Question-level dropoff */}
            {questionDropoffRows.length > 0 ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Question-level Dropoff
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  For each question: how often someone answers it, and how often
                  they do NOT proceed to the next question.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Question
                        </th>
                        <th className="px-4 py-2 text-right text-gray-700">
                          Answered
                        </th>
                        <th className="px-4 py-2 text-right text-gray-700">
                          Dropoff %
                        </th>
                        <th className="px-4 py-2 text-right text-gray-700">
                          Fail-last count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {questionDropoffRows.slice(0, 30).map((row) => {
                        const answered = row.attemptsAnswered || 0;
                        const drop = row.dropoffPercent || 0;
                        const failLast = row.failLastQuestionCount || 0;
                        const qKey = `q-${row.questionId}`;

                        return (
                          <tr key={qKey} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900 max-w-[680px]">
                              <div className="font-medium">
                                #{row.questionId}
                              </div>
                              <div className="text-gray-700 mt-1">
                                {row.shortText}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              {answered}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-900 font-semibold">
                              {drop}%
                            </td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              {failLast}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Existing sections */}
            {analytics.screening?.phaseFailures &&
            analytics.screening.phaseFailures.length > 0 ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Phase Failure Distribution
                </h2>
                <div className="space-y-3">
                  {analytics.screening.phaseFailures.map((pf) => {
                    const widthPct =
                      screeningTotal > 0
                        ? (pf.count / screeningTotal) * 100
                        : 0;

                    return (
                      <div key={pf.phase}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">
                            Phase {pf.phase}
                          </span>
                          <span className="text-gray-600">
                            {pf.count} failures
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-[#FF1744] h-3 rounded-full transition-all"
                            style={{ width: `${widthPct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {analytics.screening?.cooldownUsers &&
            analytics.screening.cooldownUsers.length > 0 ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Users on Cooldown
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    ({analytics.screening.cooldownUsers.length} temporarily
                    restricted)
                  </span>
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  These users showed some inconsistency in answers or aren't
                  mature/respectful enough yet. They'll be able to try again
                  after their cooldown period.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Last Outcome
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Last Attempt
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Cooldown Until
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Time Remaining
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {analytics.screening.cooldownUsers.map((user) => {
                        const cooldownDate = new Date(user.cooldownUntil);
                        const now = new Date();
                        const hoursRemaining = Math.ceil(
                          (cooldownDate - now) / (1000 * 60 * 60),
                        );
                        const daysRemaining = Math.floor(hoursRemaining / 24);

                        const timeRemainingLabel =
                          daysRemaining > 0
                            ? `${daysRemaining}d ${hoursRemaining % 24}h`
                            : `${hoursRemaining}h`;

                        const lastAttemptLabel = user.lastAttemptAt
                          ? new Date(user.lastAttemptAt).toLocaleString()
                          : "-";

                        return (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900">
                              {user.email}
                            </td>
                            <td className="px-4 py-2">
                              <span className="inline-block px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                                {user.lastOutcome || "COOLDOWN"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-600">
                              {lastAttemptLabel}
                            </td>
                            <td className="px-4 py-2 text-gray-600">
                              {cooldownDate.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-gray-600 font-medium">
                              {timeRemainingLabel}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {analytics.screening?.recentAttempts &&
            analytics.screening.recentAttempts.length > 0 ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Recent Attempts
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Outcome
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Started
                        </th>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Completed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {analytics.screening.recentAttempts
                        .slice(0, 20)
                        .map((attempt) => {
                          const outcomeLabel = attempt.outcome;
                          const startedLabel = new Date(
                            attempt.started_at,
                          ).toLocaleString();
                          const completedLabel = attempt.completed_at
                            ? new Date(attempt.completed_at).toLocaleString()
                            : "-";

                          const outcomeClassName =
                            outcomeLabel === "APPROVED"
                              ? "bg-green-100 text-green-800"
                              : outcomeLabel === "FAILED"
                                ? "bg-red-100 text-red-800"
                                : outcomeLabel === "COOLDOWN"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : outcomeLabel === "LIFETIME_INELIGIBLE"
                                    ? "bg-gray-100 text-gray-800"
                                    : "bg-blue-100 text-blue-800";

                          return (
                            <tr key={attempt.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-900">
                                {attempt.email}
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`inline-block px-2 py-1 rounded-full text-xs ${outcomeClassName}`}
                                >
                                  {outcomeLabel}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-gray-600">
                                {startedLabel}
                              </td>
                              <td className="px-4 py-2 text-gray-600">
                                {completedLabel}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Unmatch analytics */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Unmatches
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Last 30 days, grouped by reason.
              </p>

              {unmatchByReason.length === 0 ? (
                <div className="text-sm text-gray-600">No unmatches yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700">
                          Reason
                        </th>
                        <th className="px-4 py-2 text-right text-gray-700">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {unmatchByReason.map((row, idx) => {
                        const reasonLabel = prettyUnmatchReason(row.reasonCode);
                        const count = row.count || 0;
                        const key = `${row.reasonCode || "unknown"}-${idx}`;

                        return (
                          <tr key={key} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900">
                              {reasonLabel}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-900 font-semibold">
                              {count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {unmatchRecent.length > 0 ? (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Recent
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-gray-700">
                            When
                          </th>
                          <th className="px-4 py-2 text-left text-gray-700">
                            Actor
                          </th>
                          <th className="px-4 py-2 text-left text-gray-700">
                            Other
                          </th>
                          <th className="px-4 py-2 text-left text-gray-700">
                            Reason
                          </th>
                          <th className="px-4 py-2 text-left text-gray-700">
                            Match ID
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {unmatchRecent.slice(0, 20).map((row) => {
                          const whenLabel = row.createdAt
                            ? new Date(row.createdAt).toLocaleString()
                            : "—";
                          const actorLabel =
                            row.actorEmail || `User #${row.actorUserId}`;
                          const otherLabel =
                            row.otherEmail || `User #${row.otherUserId}`;
                          const reasonLabel = prettyUnmatchReason(
                            row.reasonCode,
                          );
                          const matchIdLabel =
                            row.matchId != null ? String(row.matchId) : "—";

                          return (
                            <tr
                              key={String(row.id)}
                              className="hover:bg-gray-50"
                            >
                              <td className="px-4 py-2 text-gray-600">
                                {whenLabel}
                              </td>
                              <td className="px-4 py-2 text-gray-900">
                                {actorLabel}
                              </td>
                              <td className="px-4 py-2 text-gray-900">
                                {otherLabel}
                              </td>
                              <td className="px-4 py-2 text-gray-700">
                                {reasonLabel}
                              </td>
                              <td className="px-4 py-2 text-gray-600">
                                {matchIdLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
