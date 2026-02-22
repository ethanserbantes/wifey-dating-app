export function UserInfoSection({ user }) {
  const likes =
    typeof user?.likes_received === "number" ? user.likes_received : 0;
  const skips =
    typeof user?.skips_received === "number" ? user.skips_received : 0;

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        User Information
      </h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-600">Status:</span>
          <span className="ml-2 font-medium">{user.status}</span>
        </div>
        <div>
          <span className="text-gray-600">Screening Phase:</span>
          <span className="ml-2 font-medium">
            {user.screening_phase || "N/A"}
          </span>
        </div>

        <div>
          <span className="text-gray-600">Likes received:</span>
          <span className="ml-2 font-medium">{likes}</span>
        </div>
        <div>
          <span className="text-gray-600">Skips received:</span>
          <span className="ml-2 font-medium">{skips}</span>
        </div>

        <div>
          <span className="text-gray-600">Created:</span>
          <span className="ml-2 font-medium">
            {new Date(user.created_at).toLocaleDateString()}
          </span>
        </div>
        {user.cooldown_until && (
          <div>
            <span className="text-gray-600">Cooldown Until:</span>
            <span className="ml-2 font-medium">
              {new Date(user.cooldown_until).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
