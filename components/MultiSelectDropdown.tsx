"use client";

import React, { useState, useRef, useEffect } from "react";

interface MultiSelectDropdownProps {
  label: string;
  icon?: string;
  options: string[];
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

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isAllSelected = selected.length === 0 || selected.length === options.length;

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((item) => item !== opt));
    } else {
      onChange([...selected, opt]);
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
      return `${placeholderAll} (${options.length})`;
    }
    if (selected.length === 1) {
      return selected[0];
    }
    return `${selected.length} seleccionados`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/80 cursor-pointer min-w-[180px] sm:min-w-[210px] justify-between"
      >
        <div className="flex items-center gap-1.5 truncate">
          <span>{icon}</span>
          <span className="text-slate-400 font-normal">{label}:</span>
          <span className="truncate text-slate-900 dark:text-white font-extrabold">{getTriggerText()}</span>
        </div>
        <span className="text-slate-400 text-[10px] ml-1">▼</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 z-50 w-72 sm:w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900">
          {/* Header Action Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-[11px] font-bold dark:border-slate-800">
            <span className="text-slate-500 uppercase tracking-wider">{label}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 cursor-pointer"
              >
                Todos
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Search Box if > 5 options */}
          {options.length > 5 && (
            <div className="mt-2 mb-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Buscar ${label.toLowerCase()}...`}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          )}

          {/* Options Checklist */}
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">No hay coincidencias</div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selected.includes(opt) || (isAllSelected && selected.length === 0);
                return (
                  <label
                    key={opt}
                    onClick={() => toggleOption(opt)}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer transition ${
                      selected.includes(opt)
                        ? "bg-emerald-50 text-emerald-900 font-bold dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="truncate pr-2">{opt}</span>
                    <input
                      type="checkbox"
                      checked={selected.includes(opt)}
                      onChange={() => {}}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 accent-emerald-500 focus:ring-0 cursor-pointer"
                    />
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
