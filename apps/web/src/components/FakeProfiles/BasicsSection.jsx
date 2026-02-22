export function BasicsSection({ draft, setBasicsField }) {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Basics</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Height
          </label>
          <input
            value={draft.preferences?.basics?.height || ""}
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
            value={draft.preferences?.basics?.sexuality || ""}
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

        {/* lookingFor removed from fake profile setup */}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Job title
          </label>
          <input
            value={draft.preferences?.basics?.jobTitle || ""}
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
            value={draft.preferences?.basics?.company || ""}
            onChange={(e) => setBasicsField("company", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g. Willow"
          />
          <p className="text-xs text-gray-500 mt-1">
            Shows as “Job title at Company”.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Education
          </label>
          <input
            value={draft.preferences?.basics?.education || ""}
            onChange={(e) => setBasicsField("education", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g. UT Austin"
          />
        </div>
      </div>
    </div>
  );
}
