"use client";

import { useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { UserFilters } from "@/components/UserManagement/UserFilters";
import { UsersTable } from "@/components/UserManagement/UsersTable";
import { Pagination } from "@/components/UserManagement/Pagination";
import { UserDetailsModal } from "@/components/UserManagement/UserDetailsModal/UserDetailsModal";
import { getProfileView } from "@/utils/profileHelpers";

import { useUserManagement } from "../../../hooks/useUserManagement";
import { useUserDetails } from "../../../hooks/useUserDetails";
import { useUserActions } from "../../../hooks/useUserActions";
import { useProfileEditor } from "../../../hooks/useProfileEditor";

export default function EngagementPage() {
  const {
    users,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
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
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    page,
    setPage,
    total,
    loadUsers,
  } = useUserManagement({
    initialSortBy: "likes_received",
    initialSortDir: "desc",
  });

  const { selectedUser, viewUserDetails, closeUserDetails, setSelectedUser } =
    useUserDetails();

  const { handleResetUser, handleDeleteUser } = useUserActions(
    loadUsers,
    setSelectedUser,
  );

  const {
    profileSaving,
    profileError,
    profileDraft,
    setProfileDraft,
    setBasicsField,
    saveProfile,
  } = useProfileEditor(selectedUser);

  const selectedProfileView = useMemo(
    () => getProfileView(selectedUser),
    [selectedUser],
  );

  const handleSaveProfile = () => {
    saveProfile(setSelectedUser);
  };

  return (
    <AdminLayout currentPage="engagement">
      <div className="p-8">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Engagement</h1>
            <p className="text-gray-600 mt-1">
              Sort users by likes and skips they have received.
            </p>
          </div>

          <a
            href="/admin/users"
            className="text-sm font-medium text-[#FF1744] hover:text-[#D50032]"
          >
            Go to User Management →
          </a>
        </div>

        <UserFilters
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          genderFilter={genderFilter}
          setGenderFilter={setGenderFilter}
          hasProfileFilter={hasProfileFilter}
          setHasProfileFilter={setHasProfileFilter}
          verifiedFilter={verifiedFilter}
          setVerifiedFilter={setVerifiedFilter}
          ageMin={ageMin}
          setAgeMin={setAgeMin}
          ageMax={ageMax}
          setAgeMax={setAgeMax}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortDir={sortDir}
          setSortDir={setSortDir}
          total={total}
        />

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
            </div>
          ) : (
            <>
              <UsersTable
                users={users}
                onViewDetails={viewUserDetails}
                onResetUser={handleResetUser}
                onDeleteUser={handleDeleteUser}
              />

              <Pagination page={page} total={total} onPageChange={setPage} />
            </>
          )}
        </div>
      </div>

      <UserDetailsModal
        selectedUser={selectedUser}
        onClose={closeUserDetails}
        onResetUser={handleResetUser}
        onDeleteUser={handleDeleteUser}
        profileView={selectedProfileView}
        profileSaving={profileSaving}
        profileError={profileError}
        profileDraft={profileDraft}
        setProfileDraft={setProfileDraft}
        setBasicsField={setBasicsField}
        onSaveProfile={handleSaveProfile}
      />
    </AdminLayout>
  );
}
