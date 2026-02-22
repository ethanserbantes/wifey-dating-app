"use client";

import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { UserPlus, Trash2 } from "lucide-react";
import adminFetch from "@/utils/adminFetch";

export default function AdminRolesPage() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    email: "",
    password: "",
    role: "SUPPORT",
  });

  const [currentAdmin, setCurrentAdmin] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("admin");
      if (raw) setCurrentAdmin(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      const response = await adminFetch("/api/admin/admins");
      if (response.ok) {
        const data = await response.json();
        setAdmins(data.admins);
      }
    } catch (error) {
      console.error("Error loading admins:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    try {
      const response = await adminFetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAdmin),
      });

      if (response.ok) {
        alert("Admin added successfully");
        setShowAddModal(false);
        setNewAdmin({ email: "", password: "", role: "SUPPORT" });
        loadAdmins();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to add admin");
      }
    } catch (error) {
      console.error("Error adding admin:", error);
      alert("Failed to add admin");
    }
  };

  const handleUpdateRole = async (adminId, newRole) => {
    if (!confirm("Change this admin's role?")) return;

    try {
      const response = await adminFetch("/api/admin/admins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId, role: newRole }),
      });

      if (response.ok) {
        alert("Role updated successfully");
        loadAdmins();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update role");
      }
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update role");
    }
  };

  const handleDeleteAdmin = async (adminId) => {
    if (!confirm("Delete this admin? This cannot be undone.")) return;

    try {
      const response = await adminFetch(`/api/admin/admins?id=${adminId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        alert("Admin deleted successfully");
        loadAdmins();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to delete admin");
      }
    } catch (error) {
      console.error("Error deleting admin:", error);
      alert("Failed to delete admin");
    }
  };

  const roleColors = {
    OWNER: "bg-purple-100 text-purple-800",
    ADMIN: "bg-blue-100 text-blue-800",
    MODERATOR: "bg-green-100 text-green-800",
    SUPPORT: "bg-gray-100 text-gray-800",
  };

  const isOwner = currentAdmin?.role === "OWNER";

  return (
    <AdminLayout currentPage="admins">
      <div className="p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Roles</h1>
          {isOwner && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#FF1744] text-white rounded-lg hover:bg-[#D50032] transition-colors"
            >
              <UserPlus size={20} />
              Add Admin
            </button>
          )}
        </div>

        {/* Role Hierarchy Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Role Hierarchy</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              <strong>OWNER:</strong> Full access including quiz builder
            </li>
            <li>
              <strong>ADMIN:</strong> User management, bans, reports, support
            </li>
            <li>
              <strong>MODERATOR:</strong> Reports, bans, user viewing
            </li>
            <li>
              <strong>SUPPORT:</strong> Support tickets only
            </li>
          </ul>
        </div>

        {/* Admins Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  {isOwner && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {admins.map((admin) => {
                  const isSelf = admin.id === currentAdmin?.id;
                  return (
                    <tr key={admin.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {admin.email}
                        {isSelf && (
                          <span className="ml-2 text-xs text-gray-500">
                            (You)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${roleColors[admin.role]}`}
                        >
                          {admin.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(admin.created_at).toLocaleDateString()}
                      </td>
                      {isOwner && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          {!isSelf && (
                            <>
                              <select
                                value={admin.role}
                                onChange={(e) =>
                                  handleUpdateRole(admin.id, e.target.value)
                                }
                                className="text-sm border border-gray-300 rounded px-2 py-1"
                              >
                                <option value="OWNER">OWNER</option>
                                <option value="ADMIN">ADMIN</option>
                                <option value="MODERATOR">MODERATOR</option>
                                <option value="SUPPORT">SUPPORT</option>
                              </select>
                              <button
                                onClick={() => handleDeleteAdmin(admin.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 size={18} className="inline" />
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Admin Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Add New Admin
            </h2>
            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={newAdmin.email}
                  onChange={(e) =>
                    setNewAdmin({ ...newAdmin, email: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={newAdmin.password}
                  onChange={(e) =>
                    setNewAdmin({ ...newAdmin, password: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={newAdmin.role}
                  onChange={(e) =>
                    setNewAdmin({ ...newAdmin, role: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent"
                >
                  <option value="SUPPORT">Support</option>
                  <option value="MODERATOR">Moderator</option>
                  <option value="ADMIN">Admin</option>
                  <option value="OWNER">Owner</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#FF1744] text-white rounded-lg hover:bg-[#D50032] transition-colors"
                >
                  Add Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
