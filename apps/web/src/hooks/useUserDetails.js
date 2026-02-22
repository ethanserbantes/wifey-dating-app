import { useState } from "react";
import adminFetch from "@/utils/adminFetch";

export function useUserDetails() {
  const [selectedUser, setSelectedUser] = useState(null);

  const viewUserDetails = async (userId) => {
    try {
      const response = await adminFetch(`/api/admin/users/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedUser(data);
      } else {
        console.error(
          `When fetching /api/admin/users/${userId}, the response was [${response.status}] ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error("Error loading user details:", error);
    }
  };

  const closeUserDetails = () => {
    setSelectedUser(null);
  };

  return {
    selectedUser,
    viewUserDetails,
    closeUserDetails,
    setSelectedUser,
  };
}
