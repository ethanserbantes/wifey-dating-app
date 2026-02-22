export function useUserActions(loadUsers, setSelectedUser) {
  const handleApproveUser = async (userId) => {
    if (!confirm("Approve this user now? This will bypass screening.")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/approve`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to approve user");
      }

      const data = await response.json();

      alert("User approved!");
      loadUsers();

      if (setSelectedUser && data?.user?.id) {
        setSelectedUser((prev) => {
          if (!prev?.user || prev.user.id !== data.user.id) {
            return prev;
          }

          return {
            ...prev,
            user: {
              ...(prev.user || {}),
              ...(data.user || {}),
            },
          };
        });
      }
    } catch (error) {
      console.error("Error approving user:", error);
      alert(error.message || "Failed to approve user");
    }
  };

  const handleResetUser = async (userId) => {
    if (
      !confirm(
        "Reset this user's account? They will be able to retake the quiz.",
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/reset`, {
        method: "POST",
      });

      if (response.ok) {
        alert("User account reset successfully!");
        loadUsers();
        if (setSelectedUser) {
          setSelectedUser((prev) => {
            if (prev?.user?.id === userId) {
              return null;
            }
            return prev;
          });
        }
      } else {
        alert("Failed to reset user account");
      }
    } catch (error) {
      console.error("Error resetting user:", error);
      alert("Failed to reset user account");
    }
  };

  const handlePartialResetUser = async (userId) => {
    if (
      !confirm(
        "Partial reset? This clears likes, passes, matches, and feed history for this user (so you can retest). It will NOT change screening status or their profile.",
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/partial-reset`, {
        method: "POST",
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to partially reset user");
      }

      alert(data?.message || "User reset successfully!");
      loadUsers();

      // Refresh the open modal data if it’s the same user.
      if (setSelectedUser) {
        try {
          const detailsResp = await fetch(`/api/admin/users/${userId}`);
          if (detailsResp.ok) {
            const details = await detailsResp.json();
            setSelectedUser(details);
          }
        } catch (e) {
          console.error(
            "Error refreshing user details after partial reset:",
            e,
          );
        }
      }
    } catch (error) {
      console.error("Error partially resetting user:", error);
      alert(error.message || "Failed to partially reset user");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (
      !confirm("Permanently delete this user? This action cannot be undone.")
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/delete`, {
        method: "DELETE",
      });

      if (response.ok) {
        alert("User deleted successfully!");
        loadUsers();
        if (setSelectedUser) {
          setSelectedUser((prev) => {
            if (prev?.user?.id === userId) {
              return null;
            }
            return prev;
          });
        }
      } else {
        alert("Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user");
    }
  };

  return {
    handleApproveUser,
    handleResetUser,
    handlePartialResetUser,
    handleDeleteUser,
  };
}
