export function ReportsSection({ reports }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Reports Against User ({reports.length})
      </h3>
      {reports.length > 0 ? (
        <div className="space-y-2">
          {reports.map((report) => (
            <div key={report.id} className="bg-gray-50 p-3 rounded-lg text-sm">
              <div className="font-medium">
                {report.report_type} - {report.status}
              </div>
              <div className="text-gray-600 mt-1">{report.description}</div>
              <div className="text-xs text-gray-500 mt-1">
                Reported by: {report.reporter_email || "Anonymous"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-sm">No reports</p>
      )}
    </div>
  );
}
