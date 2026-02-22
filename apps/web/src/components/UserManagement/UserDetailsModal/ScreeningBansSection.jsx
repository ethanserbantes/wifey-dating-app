export function ScreeningBansSection({ bans }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Screening Bans ({bans.length})
      </h3>
      {bans.length > 0 ? (
        <div className="space-y-2">
          {bans.map((ban) => (
            <div
              key={ban.id}
              className="bg-red-50 p-3 rounded-lg text-sm border border-red-200"
            >
              <div className="font-medium text-red-900">{ban.reason}</div>
              <div className="text-gray-600 mt-1">
                {ban.is_permanent
                  ? "Permanent"
                  : ban.expires_at
                    ? `Expires: ${new Date(ban.expires_at).toLocaleDateString()}`
                    : "No expiration"}
              </div>
              {ban.notes && (
                <div className="text-gray-600 mt-1 text-xs">{ban.notes}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-sm">No screening bans</p>
      )}
    </div>
  );
}
