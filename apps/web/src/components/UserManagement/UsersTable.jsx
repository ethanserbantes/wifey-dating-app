import { Eye, RotateCcw, Trash2, BadgeCheck, CheckCircle2 } from "lucide-react";

export function UsersTable({
  users,
  onViewDetails,
  onApproveUser,
  onResetUser,
  onDeleteUser,
}) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Name
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Phone
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Age
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Gender
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Status
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Likes
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Skips
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Phase
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Created
          </th>
          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {users.map((user) => {
          const likes =
            typeof user.likes_received === "number" ? user.likes_received : 0;
          const skips =
            typeof user.skips_received === "number" ? user.skips_received : 0;

          const displayName = String(user.display_name || "").trim();
          const nameCell = displayName || "(no profile)";
          const phoneCell = String(user.phone || "").trim() || "-";

          const ageCell =
            typeof user.age === "number" && Number.isFinite(user.age)
              ? String(user.age)
              : "-";

          const genderCell = user.gender ? String(user.gender) : "-";
          const isVerified = user.is_verified === true;

          const canApprove =
            typeof onApproveUser === "function" && user.status !== "APPROVED";

          return (
            <tr key={user.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <button
                  onClick={() => onViewDetails(user.id)}
                  className="text-left hover:underline"
                  title="Open user"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="font-medium">{nameCell}</span>
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[#FF1744]">
                        <BadgeCheck size={14} />
                        Verified
                      </span>
                    ) : null}
                  </span>
                </button>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <button
                  onClick={() => onViewDetails(user.id)}
                  className="text-left hover:underline"
                  title="Open user"
                >
                  {phoneCell}
                </button>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                {ageCell}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                {genderCell}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    user.status === "APPROVED"
                      ? "bg-green-100 text-green-800"
                      : user.status === "PENDING_SCREENING"
                        ? "bg-yellow-100 text-yellow-800"
                        : user.status === "COOLDOWN"
                          ? "bg-orange-100 text-orange-800"
                          : "bg-red-100 text-red-800"
                  }`}
                >
                  {user.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                {likes}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                {skips}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {user.screening_phase || "-"}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {new Date(user.created_at).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  onClick={() => onViewDetails(user.id)}
                  className="text-[#FF1744] hover:text-[#D50032] mr-3"
                  title="View details"
                >
                  <Eye size={18} className="inline" />
                </button>

                {canApprove ? (
                  <button
                    onClick={() => onApproveUser(user.id)}
                    className="text-green-600 hover:text-green-800 mr-3"
                    title="Approve (bypass screening)"
                  >
                    <CheckCircle2 size={18} className="inline" />
                  </button>
                ) : null}

                <button
                  onClick={() => onResetUser(user.id)}
                  className="text-blue-600 hover:text-blue-800 mr-3"
                  title="Reset account"
                >
                  <RotateCcw size={18} className="inline" />
                </button>
                <button
                  onClick={() => onDeleteUser(user.id)}
                  className="text-red-600 hover:text-red-800"
                  title="Delete user"
                >
                  <Trash2 size={18} className="inline" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
