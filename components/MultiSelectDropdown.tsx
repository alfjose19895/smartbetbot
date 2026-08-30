"use client";

import React, { useState, useRef, useEffect } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  group?: string;
  badge?: string;
}

interface MultiSelectDropdownProps {
  label: string;
  icon?: string;
  options: (string | DropdownOption)[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholderAll?: string;
}

export function MultiSelectDropdown({
  label,
  icon = "🔍",
  options,
  selected,
  onChange,
  placeholderAll = "Todos",
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Normalize options to DropdownOption
  const normalizedOptions: DropdownOption[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = normalizedOptions.filter(
    (opt) =>
      opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (opt.group && opt.group.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Group by country / category if group is present
  const groups = Array.from(new Set(filteredOptions.map((opt) => opt.group || "")));

  const isAllSelected = selected.length === 0 || selected.length === normalizedOptions.length;

  const toggleOption = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((item) => item !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const toggleGroup = (groupName: string) => {
    const groupValues = normalizedOptions
      .filter((opt) => (opt.group || "") === groupName)
      .map((opt) => opt.value);
    const allGroupSelected = groupValues.every((val) => selected.includes(val));

    if (allGroupSelected) {
      onChange(selected.filter((val) => !groupValues.includes(val)));
    } else {
      const newSelected = Array.from(new Set([...selected, ...groupValues]));
      onChange(newSelected);
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  const handleClear = () => {
    onChange([]);
  };

  const getTriggerText = () => {
    if (isAllSelected) {
      return `${placeholderAll} (${normalizedOptions.length})`;
    }
    if (selected.length === 1) {
      const opt = normalizedOptions.find((o) => o.value === selected[0]);
      return opt ? opt.label : selected[0];
    }
    return `${selected.length} seleccionados`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/80 cursor-pointer min-w-[200px] sm:min-w-[230px] justify-between"
      >
        <div className="flex items-center gap-1.5 truncate">
          <span>{icon}</span>
          <span className="text-slate-500 font-medium">{label}:</span>
          <span className="truncate text-slate-900 dark:text-white font-extrabold">{getTriggerText()}</span>
        </div>
        <span className="text-slate-500 text-[10px] ml-1">▼</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:right-auto mt-2 z-50 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900">
          {/* Header Action Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-[11px] font-bold dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider">{label}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 cursor-pointer font-bold"
              >
                Todos
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer font-semibold"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="mt-2 mb-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Buscar por país o ${label.toLowerCase()}...`}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {/* Options Checklist */}
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">No hay coincidencias</div>
            ) : (
              groups.map((group) => {
                const groupItems = filteredOptions.filter((opt) => (opt.group || "") === group);
                return (
                  <div key={group || "nogroup"} className="space-y-1">
                    {group && (
                      <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/60 rounded-md">
                        <span>{group}</span>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group)}
                          className="text-[9px] text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer lowercase"
                        >
                          seleccionar país
                        </button>
                      </div>
                    )}
                    {groupItems.map((opt) => {
                      const checked = selected.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          onClick={() => toggleOption(opt.value)}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer transition ${
                            checked
                              ? "bg-emerald-50 text-emerald-900 font-bold border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60"
                              : "text-slate-800 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate pr-2">
                            <span className="truncate">{opt.label}</span>
                            {opt.badge && (
                              <span className="shrink-0 rounded bg-slate-200 px-1 py-0.2 text-[9px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:ring-0 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
