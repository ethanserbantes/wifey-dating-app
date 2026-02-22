export function ProfileBasicsEditor({
  profileError,
  profileDraft,
  setProfileDraft,
  setBasicsField,
  profileSaving,
  onSaveProfile,
}) {
  return (
    <div className="border-t border-gray-200 pt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Profile basics (shown in the app)
      </h3>

      {profileError ? (
        <div className="bg-red-50 border border-red-200 text-red-900 text-sm p-3 rounded-lg mb-3">
          {profileError}
        </div>
      ) : null}

      <div className="flex items-center gap-4 mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
          <input
            type="checkbox"
            checked={Boolean(profileDraft.isVerified)}
            onChange={(e) =>
              setProfileDraft((prev) => ({
                ...prev,
                isVerified: e.target.checked,
              }))
            }
            className="h-4 w-4"
          />
          Verified
        </label>
        <p className="text-xs text-gray-500">
          Only answered fields show up in the Basics card.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Height
          </label>
          <input
            value={profileDraft.basics.height}
            onChange={(e) => setBasicsField("height", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder={`e.g. 5'8" or 173 cm`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sexuality
          </label>
          <select
            value={profileDraft.basics.sexuality}
            onChange={(e) => setBasicsField("sexuality", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">(not set)</option>
            <option value="Straight">Straight</option>
            <option value="Gay">Gay</option>
            <option value="Lesbian">Lesbian</option>
            <option value="Bisexual">Bisexual</option>
            <option value="Pansexual">Pansexual</option>
            <option value="Asexual">Asexual</option>
            <option value="Queer">Queer</option>
            <option value="Questioning">Questioning</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Looking for
          </label>
          <input
            value={profileDraft.basics.lookingFor}
            onChange={(e) => setBasicsField("lookingFor", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g. A relationship"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Job title
          </label>
          <input
            value={profileDraft.basics.jobTitle}
            onChange={(e) => setBasicsField("jobTitle", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g. Bartender"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company
          </label>
          <input
            value={profileDraft.basics.company}
            onChange={(e) => setBasicsField("company", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g. Willow"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Education
          </label>
          <input
            value={profileDraft.basics.education}
            onChange={(e) => setBasicsField("education", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g. UT Austin"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onSaveProfile}
          disabled={profileSaving}
          className="px-4 py-2 bg-[#FF1744] text-white rounded-lg hover:bg-[#D50032] disabled:opacity-50"
        >
          {profileSaving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
