import {
  LayoutDashboard,
  BarChart3,
  LogOut,
  PenTool,
  Users,
  Shield,
  AlertTriangle,
  MessageSquare,
  UserPlus,
  Heart,
  BadgeCheck,
  KeyRound,
  Tag,
} from "lucide-react";
import { useEffect, useState } from "react";
import adminFetch, { setAdminSessionToken } from "@/utils/adminFetch";

export default function AdminLayout({ children, currentPage }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const resp = await adminFetch("/api/admin/me");
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");

          // If we have a bad/stale token, clear it so the next login works cleanly.
          if (resp.status === 401) {
            try {
              localStorage.removeItem("admin");
            } catch {
              // ignore
            }
            setAdminSessionToken(null);
          }

          if (!cancelled) {
            setAdmin(null);
            setLoadError(
              `Admin session not found (status ${resp.status}). ${text || ""}`.trim(),
            );
          }
          return;
        }

        const data = await resp.json();
        const nextAdmin = data?.admin || null;
        if (!cancelled) {
          setAdmin(nextAdmin);
          // Keep localStorage in sync so existing pages that read it keep working.
          if (typeof window !== "undefined" && nextAdmin) {
            localStorage.setItem("admin", JSON.stringify(nextAdmin));
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setAdmin(null);
          setLoadError(e?.message || "Could not load admin session");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await adminFetch("/api/admin/logout", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem("admin");
    setAdminSessionToken(null);
    window.location.href = "/admin";
  };

  const handleClearSession = () => {
    try {
      localStorage.removeItem("admin");
    } catch {
      // ignore
    }
    setAdminSessionToken(null);
    window.location.href = "/admin";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF1744]"></div>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6">
          <div className="text-lg font-semibold text-gray-900">
            Admin session expired
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Please sign in again.
          </div>
          {loadError ? (
            <div className="mt-4 text-xs text-gray-500 break-words">
              {loadError}
            </div>
          ) : null}
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <a
              href="/admin"
              className="inline-block bg-[#FF1744] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#E01535] text-center"
            >
              Go to sign in
            </a>
            <button
              type="button"
              onClick={handleClearSession}
              className="inline-block bg-gray-100 text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 text-center"
            >
              Clear session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Define navigation items with role requirements
  const navItems = [
    {
      name: "Dashboard",
      href: "/admin/dashboard",
      icon: LayoutDashboard,
      id: "dashboard",
      roles: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"],
    },
    {
      name: "Quiz Builder",
      href: "/admin/quiz-builder",
      icon: PenTool,
      id: "quiz-builder",
      roles: ["OWNER", "ADMIN"], // allow admins in production to manage quizzes
    },
    {
      name: "Quiz Configurations",
      href: "/admin/quiz-config",
      icon: PenTool,
      id: "quiz-config",
      roles: ["OWNER", "ADMIN"],
    },
    {
      name: "User Management",
      href: "/admin/users",
      icon: Users,
      id: "users",
      roles: ["OWNER", "ADMIN", "MODERATOR"],
    },
    {
      name: "Photo Verification",
      href: "/admin/verifications",
      icon: BadgeCheck,
      id: "verifications",
      roles: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"],
    },
    {
      name: "Engagement",
      href: "/admin/engagement",
      icon: Heart,
      id: "engagement",
      roles: ["OWNER", "ADMIN", "MODERATOR"],
    },
    {
      name: "Likes Throttle",
      href: "/admin/likes-throttle",
      icon: Heart,
      id: "likes-throttle",
      roles: ["OWNER", "ADMIN"],
    },
    {
      name: "Admin Roles",
      href: "/admin/admins",
      icon: Shield,
      id: "admins",
      roles: ["OWNER"], // OWNER ONLY
    },
    {
      name: "Reports",
      href: "/admin/reports",
      icon: AlertTriangle,
      id: "reports",
      roles: ["OWNER", "ADMIN", "MODERATOR"],
    },
    {
      name: "Support Tickets",
      href: "/admin/support",
      icon: MessageSquare,
      id: "support",
      roles: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"],
    },
    {
      name: "Fake Profiles",
      href: "/admin/fake-profiles",
      icon: UserPlus,
      id: "fake-profiles",
      roles: ["OWNER", "ADMIN", "MODERATOR"],
    },
    {
      name: "Categories",
      href: "/admin/categories",
      icon: Tag,
      id: "categories",
      roles: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"],
    },
    {
      name: "Screening Analytics",
      href: "/admin/analytics",
      icon: BarChart3,
      id: "analytics",
      roles: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"],
    },
    {
      name: "Change Password",
      href: "/admin/change-password",
      icon: KeyRound,
      id: "change-password",
      roles: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"],
    },
  ];

  // Filter nav items based on user role
  const visibleNavItems = navItems.filter((item) =>
    item.roles.includes(admin.role),
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-[#FF1744]">Wifey Admin</h1>
          <p className="text-sm text-gray-600 mt-1">{admin.email}</p>
          <span className="inline-block mt-1 px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
            {admin.role}
          </span>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-[#FF1744] text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{item.name}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 w-full transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto min-w-0">{children}</div>
    </div>
  );
}
