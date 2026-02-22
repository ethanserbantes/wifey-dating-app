import { useState, useEffect, useCallback } from "react";
import adminFetch from "@/utils/adminFetch";

/**
 * Hook for managing user list, search, filters, sort, and pagination
 */
export function useUserManagement(options = {}) {
  const initialSortBy =
    typeof options.initialSortBy === "string" && options.initialSortBy
      ? options.initialSortBy
      : "created_at";

  const initialSortDir =
    options.initialSortDir === "asc" || options.initialSortDir === "desc"
      ? options.initialSortDir
      : "desc";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // filters
  const [genderFilter, setGenderFilter] = useState("");
  const [hasProfileFilter, setHasProfileFilter] = useState(""); // "" | "yes" | "no"
  const [verifiedFilter, setVerifiedFilter] = useState(""); // "" | "yes" | "no"
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");

  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortDir, setSortDir] = useState(initialSortDir);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadUsers = useCallback(async () => {
    const timeoutMs = 15000;

    let timeoutId;
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        sortBy,
        sortDir,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(genderFilter && { gender: genderFilter }),
        ...(hasProfileFilter && { hasProfile: hasProfileFilter }),
        ...(verifiedFilter && { verified: verifiedFilter }),
        ...(ageMin && { ageMin }),
        ...(ageMax && { ageMax }),
      });

      const fetchPromise = adminFetch(`/api/admin/users?${params}`, {
        signal: controller?.signal,
      });

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            controller?.abort();
          } catch (e) {
            // ignore
          }
          reject(new Error("Request timed out"));
        }, timeoutMs);
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(
          `When fetching /api/admin/users, the response was [${response.status}] ${response.statusText}`,
        );
      }

      const data = await response.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch (error) {
      console.error("Error loading users:", error);
      setUsers([]);
      setTotal(0);
      setError(
        "Could not load users. Please try again. If this keeps happening, the server may be taking too long.",
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setLoading(false);
    }
  }, [
    search,
    statusFilter,
    genderFilter,
    hasProfileFilter,
    verifiedFilter,
    ageMin,
    ageMax,
    page,
    sortBy,
    sortDir,
  ]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // When filters/sort change, jump back to page 1.
  useEffect(() => {
    setPage(1);
  }, [
    search,
    statusFilter,
    genderFilter,
    hasProfileFilter,
    verifiedFilter,
    ageMin,
    ageMax,
    sortBy,
    sortDir,
  ]);

  return {
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
  };
}
