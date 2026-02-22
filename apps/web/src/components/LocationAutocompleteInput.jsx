"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

function buildLabel(pred) {
  const desc = String(pred?.description || "").trim();
  if (desc) return desc;

  const primary = String(pred?.primary || "").trim();
  const secondary = String(pred?.secondary || "").trim();
  if (!primary) return "";
  return secondary ? `${primary}, ${secondary}` : primary;
}

export default function LocationAutocompleteInput({
  value,
  onChange,
  placeholder,
  types,
  minChars,
  inputClassName,
  listClassName,
}) {
  const safeTypes = String(types || "(cities)");
  const safeMinChars = Number.isFinite(minChars) ? minChars : 2;

  const [isOpen, setIsOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const valueString = useMemo(() => String(value || ""), [value]);
  const query = useMemo(() => valueString.trim(), [valueString]);
  const canSearch = query.length >= safeMinChars;
  const showClear = Boolean(query);

  const resolvedPlaceholder = placeholder || "City, State";
  const resolvedInputClassName =
    inputClassName ||
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF1744] focus:border-transparent";
  const resolvedListClassName =
    listClassName ||
    "absolute z-30 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden";

  const debounceRef = useRef(null);

  useEffect(() => {
    if (!canSearch) {
      setDebouncedQuery("");
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, canSearch]);

  const placesQuery = useQuery({
    queryKey: ["placesAutocomplete", safeTypes, debouncedQuery],
    enabled: Boolean(
      isOpen && debouncedQuery && debouncedQuery.length >= safeMinChars,
    ),
    queryFn: async () => {
      const url = `/api/places/autocomplete?input=${encodeURIComponent(
        debouncedQuery,
      )}&types=${encodeURIComponent(safeTypes)}`;

      const resp = await fetch(url);
      if (!resp.ok) {
        let message = `Places search failed ([${resp.status}] ${resp.statusText})`;
        try {
          const errJson = await resp.json();
          const extra = errJson?.message || errJson?.status || errJson?.error;
          if (extra) {
            message = `${message}: ${extra}`;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      return resp.json();
    },
  });

  const predictions = useMemo(() => {
    const preds = Array.isArray(placesQuery.data?.predictions)
      ? placesQuery.data.predictions
      : [];

    return preds
      .map((p) => ({
        placeId: p?.placeId,
        primary: p?.primary,
        secondary: p?.secondary || "",
        description: p?.description || "",
      }))
      .filter((p) => {
        const hasId = !!String(p.placeId || "").trim();
        const label = buildLabel(p);
        return hasId && !!label;
      });
  }, [placesQuery.data]);

  const onPick = useCallback(
    (item) => {
      const label = buildLabel(item);
      if (!label) return;
      onChange?.(label);
      setIsOpen(false);
    },
    [onChange],
  );

  const showList = useMemo(() => {
    const hasResults = predictions.length > 0;
    const hasError = Boolean(placesQuery.error);
    const isSearching = placesQuery.isFetching;
    return Boolean(
      isOpen && canSearch && (isSearching || hasError || hasResults),
    );
  }, [
    isOpen,
    canSearch,
    placesQuery.error,
    placesQuery.isFetching,
    predictions.length,
  ]);

  const errorMessage = useMemo(() => {
    if (!placesQuery.error) return null;
    return String(placesQuery.error?.message || "Could not search locations");
  }, [placesQuery.error]);

  const isSearching = placesQuery.isFetching;
  const showEmpty =
    !isSearching && !placesQuery.error && predictions.length === 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          value={valueString}
          onChange={(e) => {
            onChange?.(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // Delay closing so a click on an option can register.
            setTimeout(() => setIsOpen(false), 120);
          }}
          className={resolvedInputClassName}
          placeholder={resolvedPlaceholder}
          autoComplete="off"
          autoCapitalize="words"
        />

        {showClear ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange?.("");
              setIsOpen(false);
            }}
            className="text-xs px-2 py-2 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      {showList ? (
        <div className={resolvedListClassName}>
          {errorMessage ? (
            <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">
              {errorMessage}
            </div>
          ) : null}

          {isSearching ? (
            <div className="px-3 py-3 text-sm text-gray-600">Searching…</div>
          ) : null}

          {!isSearching ? (
            <div className="max-h-[240px] overflow-auto">
              {predictions.map((p) => {
                const primary = String(p.primary || "").trim();
                const secondary = String(p.secondary || "").trim();
                const label = buildLabel(p);

                return (
                  <button
                    key={String(p.placeId)}
                    type="button"
                    onMouseDown={(e) => {
                      // Prevent the input from blurring before we handle the click.
                      e.preventDefault();
                      onPick(p);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {primary || label}
                    </div>
                    {secondary ? (
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {secondary}
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {showEmpty ? (
                <div className="px-3 py-3 text-sm text-gray-600">
                  No results.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
