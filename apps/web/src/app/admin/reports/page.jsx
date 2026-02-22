"use client";

import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import adminFetch from "@/utils/adminFetch";

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await adminFetch(
        `/api/admin/reports?status=${statusFilter}`,
      );
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports);
      }
    } catch (error) {
      console.error("Error loading reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (reportId, newStatus, notes = null) => {
    try {
      const response = await adminFetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          status: newStatus,
          ...(notes && { resolutionNotes: notes }),
        }),
      });

      if (response.ok) {
        alert("Report updated successfully");
        loadReports();
        setSelectedReport(null);
      }
    } catch (error) {
      console.error("Error updating report:", error);
      alert("Failed to update report");
    }
  };

  return (
    <AdminLayout currentPage="reports">
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">User Reports</h1>

        {/* Status Filter */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-2">
            {["PENDING", "INVESTIGATING", "RESOLVED", "DISMISSED"].map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    statusFilter === status
                      ? "bg-[#FF1744] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {status}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Reports List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
              No reports with status: {statusFilter}
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          report.report_type === "HARASSMENT"
                            ? "bg-red-100 text-red-800"
                            : report.report_type === "SPAM"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {report.report_type}
                      </span>
                      <span className="text-sm text-gray-600">
                        {new Date(report.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 mb-2">
                      <strong>Reported User:</strong> {report.reported_email}
                    </div>
                    <div className="text-sm text-gray-700 mb-2">
                      <strong>Reporter:</strong>{" "}
                      {report.reporter_email || "Anonymous"}
                    </div>
                    <p className="text-gray-900 mt-2">{report.description}</p>
                  </div>
                  <button
                    onClick={() => setSelectedReport(report)}
                    className="ml-4 px-4 py-2 bg-[#FF1744] text-white rounded-lg hover:bg-[#D50032] transition-colors text-sm"
                  >
                    Review
                  </button>
                </div>

                {report.assigned_to_email && (
                  <div className="text-xs text-gray-600 mt-2">
                    Assigned to: {report.assigned_to_email}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Review Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Review Report
            </h2>

            <div className="space-y-4 mb-6">
              <div>
                <span className="text-sm font-medium text-gray-700">Type:</span>
                <span className="ml-2">{selectedReport.report_type}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">
                  Reported User:
                </span>
                <span className="ml-2">{selectedReport.reported_email}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">
                  Reporter:
                </span>
                <span className="ml-2">
                  {selectedReport.reporter_email || "Anonymous"}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">
                  Description:
                </span>
                <p className="mt-1 text-gray-900">
                  {selectedReport.description}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() =>
                  handleUpdateStatus(selectedReport.id, "INVESTIGATING")
                }
                className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
              >
                Start Investigating
              </button>
              <button
                onClick={() => {
                  const notes = prompt("Resolution notes:");
                  if (notes)
                    handleUpdateStatus(selectedReport.id, "RESOLVED", notes);
                }}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Resolve
              </button>
              <button
                onClick={() => {
                  const notes = prompt("Dismissal reason:");
                  if (notes)
                    handleUpdateStatus(selectedReport.id, "DISMISSED", notes);
                }}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Dismiss
              </button>
            </div>

            <button
              onClick={() => setSelectedReport(null)}
              className="w-full mt-4 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
