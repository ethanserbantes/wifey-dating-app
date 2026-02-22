import { Search } from "lucide-react";

export function UserFilters({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  total,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  showSort = true,
  // filters
  genderFilter,
  setGenderFilter,
  hasProfileFilter,
  setHasProfileFilter,
  verifiedFilter,
  setVerifiedFilter,
  ageMin,
  setAgeMin,
  ageMax,
  setAgeMax,
}) {
  const canSort =
    showSort &&
    typeof setSortBy === "function" &&
    typeof setSortDir === "function";

  const canFilterProfile =
    typeof setGenderFilter === "function" &&
    typeof setHasProfileFilter === "function" &&
    typeof setVerifiedFilter === "function" &&
    typeof setAgeMin === "function" &&
    typeof setAgeMax === "function";

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center">
        <div className="relative md:w-[320px] w-full">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
        >
          <option value="">All statuses</option>
          <option value="PENDING_SCREENING">Pending screening</option>
          <option value="APPROVED">Approved</option>
          <option value="COOLDOWN">Cooldown</option>
          <option value="LIFETIME_INELIGIBLE">Lifetime ineligible</option>
        </select>

        {canFilterProfile ? (
          <>
            <select
              value={hasProfileFilter || ""}
              onChange={(e) => setHasProfileFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
              title="Has dating profile"
            >
              <option value="">All profiles</option>
              <option value="yes">Has profile</option>
              <option value="no">No profile</option>
            </select>

            <select
              value={genderFilter || ""}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
              title="Gender"
            >
              <option value="">All genders</option>
              <option value="man">Man</option>
              <option value="woman">Woman</option>
              <option value="non-binary">Non-binary</option>
              <option value="other">Other</option>
            </select>

            <select
              value={verifiedFilter || ""}
              onChange={(e) => setVerifiedFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
              title="Verification"
            >
              <option value="">All verification</option>
              <option value="yes">Verified only</option>
              <option value="no">Not verified</option>
            </select>

            <input
              type="number"
              inputMode="numeric"
              min={18}
              placeholder="Age min"
              value={ageMin || ""}
              onChange={(e) => setAgeMin(e.target.value)}
              className="w-[120px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
            />
            <input
              type="number"
              inputMode="numeric"
              min={18}
              placeholder="Age max"
              value={ageMax || ""}
              onChange={(e) => setAgeMax(e.target.value)}
              className="w-[120px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
            />
          </>
        ) : null}

        {canSort ? (
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
              title="Sort by"
            >
              <option value="created_at">Newest</option>
              <option value="likes_received">Most likes received</option>
              <option value="skips_received">Most skips received</option>
              <option value="like_ratio">Best like ratio</option>
              <option value="age">Age</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
            </select>

            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
              title="Sort direction"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        ) : null}

        <div className="text-sm text-gray-600 flex items-center md:ml-auto">
          <span className="font-semibold">{total}</span>
          <span className="ml-1">total users</span>
        </div>
      </div>
    </div>
  );
}
