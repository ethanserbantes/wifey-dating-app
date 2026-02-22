"use client";

import { useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useUserManagement } from "../../../hooks/useUserManagement";
import { useUserDetails } from "../../../hooks/useUserDetails";
import { useUserActions } from "../../../hooks/useUserActions";
import { useProfileEditor } from "../../../hooks/useProfileEditor";
import { getProfileView } from "@/utils/profileHelpers";
import { UserFilters } from "@/components/UserManagement/UserFilters";
import { UsersTable } from "@/components/UserManagement/UsersTable";
import { Pagination } from "@/components/UserManagement/Pagination";
import { UserDetailsModal } from "@/components/UserManagement/UserDetailsModal/UserDetailsModal";

export default function UserManagementPage() {
  const {
    users,
    loading,
    error,
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
  } = useUserManagement();

  const { selectedUser, viewUserDetails, closeUserDetails, setSelectedUser } =
    useUserDetails();

  const {
    handleApproveUser,
    handleResetUser,
    handlePartialResetUser,
    handleDeleteUser,
  } = useUserActions(loadUsers, setSelectedUser);

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
    <AdminLayout currentPage="users">
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          User Management
        </h1>

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

        {error ? (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-900 rounded-lg p-4 flex items-start justify-between gap-4">
            <div className="text-sm">{error}</div>
            <button
              className="px-3 py-1.5 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700"
              onClick={loadUsers}
            >
              Retry
            </button>
          </div>
        ) : null}

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
                onApproveUser={handleApproveUser}
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
        onApproveUser={handleApproveUser}
        onResetUser={handleResetUser}
        onPartialResetUser={handlePartialResetUser}
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
