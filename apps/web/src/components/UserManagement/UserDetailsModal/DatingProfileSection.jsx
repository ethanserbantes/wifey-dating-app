import { ProfilePhotos } from "./ProfilePhotos";
import { ProfileVideos } from "./ProfileVideos";
import { ProfilePrompts } from "./ProfilePrompts";
import { ProfileInterests } from "./ProfileInterests";

export function DatingProfileSection({ profileView }) {
  if (!profileView) {
    return null;
  }

  return (
    <div className="border-t border-gray-200 pt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Dating profile (what shows in the app)
      </h3>

      {!profileView.profile ? (
        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
          This user doesn't have a dating profile yet.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Photo verification (for screening) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  Photo verification
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  Status:{" "}
                  <span className="font-semibold">
                    {String(profileView.profile.verification_status || "none")}
                  </span>
                  {profileView.profile.is_verified ? (
                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Verified
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">
                      Not verified
                    </span>
                  )}
                </div>
                {profileView.profile.verification_submitted_at ? (
                  <div className="mt-1 text-xs text-gray-500">
                    Submitted:{" "}
                    {new Date(
                      profileView.profile.verification_submitted_at,
                    ).toLocaleString()}
                  </div>
                ) : null}
              </div>

              {profileView.profile.verification_photo_url ? (
                <a
                  className="text-sm font-semibold text-[#7C3AED] hover:underline"
                  href={profileView.profile.verification_photo_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open verification photo
                </a>
              ) : (
                <div className="text-sm text-gray-500">
                  No verification photo uploaded
                </div>
              )}
            </div>

            {profileView.profile.verification_photo_url ? (
              <div className="mt-3">
                <img
                  src={profileView.profile.verification_photo_url}
                  alt="Verification"
                  className="h-40 w-40 rounded-lg border border-gray-200 object-cover"
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-gray-600">Name</div>
              <div className="text-base font-semibold text-gray-900">
                {profileView.displayName || "(no display name)"}
              </div>

              {profileView.location ? (
                <div className="mt-2 text-sm text-gray-700">
                  <span className="text-gray-600">Location:</span>{" "}
                  <span className="font-medium">{profileView.location}</span>
                </div>
              ) : null}

              {profileView.bio ? (
                <div className="mt-3">
                  <div className="text-sm text-gray-600">Bio</div>
                  <div className="text-sm text-gray-900 whitespace-pre-wrap">
                    {profileView.bio}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-gray-500">(No bio)</div>
              )}

              <div className="mt-3 text-xs text-gray-500">
                Updated:{" "}
                {new Date(profileView.profile.updated_at).toLocaleString()}
              </div>
            </div>

            <div className="space-y-4">
              <ProfilePhotos photos={profileView.photos} />
              <ProfileVideos videos={profileView.videos} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProfilePrompts prompts={profileView.prompts} />
            <ProfileInterests interests={profileView.interests} />
          </div>
        </div>
      )}
    </div>
  );
}
