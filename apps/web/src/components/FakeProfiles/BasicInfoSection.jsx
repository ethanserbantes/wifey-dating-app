import LocationAutocompleteInput from "../LocationAutocompleteInput";

function formatCategoryLabel(cat) {
  const name = String(cat?.name || "").trim();
  const emoji = String(cat?.emoji || "").trim();
  if (!name) return "";
  return emoji ? `${emoji} ${name}` : name;
}

export function BasicInfoSection({
  draft,
  setDraftField,
  categories,
  setPreferenceField,
}) {
  const categoryValue = String(draft.preferences?.category || "");

  const activeCategories = Array.isArray(categories)
    ? categories.filter((c) => c?.is_active === true)
    : [];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display name
          </label>
          <input
            value={draft.displayName}
            onChange={(e) => setDraftField("displayName", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
            placeholder="e.g. Olivia"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Age
            </label>
            <input
              value={draft.age}
              onChange={(e) => setDraftField("age", e.target.value)}
              type="number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
              placeholder="27"
              min={18}
              max={99}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender
            </label>
            <select
              value={draft.gender}
              onChange={(e) => setDraftField("gender", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="nonbinary">Non-binary</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location
          </label>
          <LocationAutocompleteInput
            value={draft.location}
            onChange={(v) => setDraftField("location", v)}
            placeholder="e.g. Austin, TX"
            types="(cities)"
            inputClassName="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={categoryValue}
              onChange={(e) =>
                typeof setPreferenceField === "function"
                  ? setPreferenceField("category", e.target.value)
                  : null
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
              disabled={typeof setPreferenceField !== "function"}
            >
              <option value="">(not set)</option>
              {activeCategories.map((c) => {
                const label = formatCategoryLabel(c);
                const key = `cat-${c.id}`;
                const val = String(c.name || "");
                return (
                  <option key={key} value={val}>
                    {label}
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              This controls where the profile shows up in Discover → Browse by
              Category.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={Boolean(draft.isVisible)}
                onChange={(e) => setDraftField("isVisible", e.target.checked)}
                className="h-4 w-4"
              />
              Visible in feed
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={Boolean(draft.isVerified)}
                onChange={(e) => setDraftField("isVerified", e.target.checked)}
                className="h-4 w-4"
              />
              Verified
            </label>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          About
        </label>
        <textarea
          value={draft.bio}
          onChange={(e) => setDraftField("bio", e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
          placeholder="Short bio..."
        />
      </div>
    </>
  );
}
