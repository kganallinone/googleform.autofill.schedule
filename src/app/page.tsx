// components/ScheduleManager.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Send,
  Loader2,
  Copy,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Lock,
  Unlock,
  History,
  ChevronDown,
  ChevronUp,
  Clock,
  BarChart3,
  Database,
  Users,
  Calendar,
  Activity,
  Search,
  Eye,
  EyeOff,
  FileText,
  AlertTriangle,
  Check,
  XCircle,
  LayoutDashboard,
  ListTodo,
  Settings,
  Zap,
  Timer,
} from "lucide-react";

interface Schedule {
  id: string;
  Email: string;
  "Name of Clinician": string;
  "Student Number": string;
  "Scheduled Day": string;
  "Shift Schedule ( Saturdays are am pm only, so please use 8-12 and 12-4pm as substitute for 1-5pm)": string;
  "Department / Procedure to do": string;
  "Time Interval Required": string;
}

interface FieldDetail {
  label: string;
  value: string;
}

interface FieldStatus {
  label: string;
  status: string;
  originalValue: string;
  usedValue?: string;
  availableOptions?: string[];
}

// Define skipped field types
interface SkippedFieldObject {
  field: string;
  requestedValue: string;
  reason: string;
  availableOptions?: string[];
}

type SkippedField = string | SkippedFieldObject;

interface SubmissionResult {
  scheduleIndex: number;
  success: boolean;
  message: string;
  timeTaken: string;
  timestamp: string;
  skippedFields: SkippedField[];
  filledFields: FieldDetail[];
  fieldStatuses: FieldStatus[];
}

interface SubmissionResponse {
  success: boolean;
  message: string;
  results: SubmissionResult[];
  summary: {
    total: number;
    successful: number;
    skippedFields: number;
    failed: number;
    fieldIssues: {
      fieldMissing: number;
      optionNotAvailable: number;
      disabled: number;
      other: number;
    };
  };
  totalTime: string;
  averageTime: string;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  type:
    | "submission"
    | "add"
    | "edit"
    | "delete"
    | "duplicate"
    | "bulk_duplicate"
    | "clear_all";
  message: string;
  details?: string;
  success?: boolean;
  scheduleCount?: number;
  submissionDetails?: {
    totalTime: string;
    averageTime: string;
    successRate: string;
    summary: {
      total: number;
      successful: number;
      skippedFields: number;
      failed: number;
      fieldIssues: {
        fieldMissing: number;
        optionNotAvailable: number;
        disabled: number;
        other: number;
      };
    };
    intervals: Array<{
      scheduleIndex: number;
      clinicianName: string;
      success: boolean;
      timeTaken: string;
      timestamp: string;
      skippedFields: SkippedField[];
      fieldCount: number;
      filledFields: FieldDetail[];
      fieldStatuses: FieldStatus[];
    }>;
  };
}

const PASSCODES = ["123456", "654321", "112233"];

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const SHIFTS = ["8-12 AM shift", "12-4 PM shift", "4-8 PM shift"];

const DEPARTMENTS = [
  "OD / OP",
  "Prothodontics",
  "Endodontics",
  "Operative Dentistry",
  "Periodontics",
  "Oral Surgery",
  "Orthodontics",
  "Pediatrics",
  "TYPO",
];

const TIME_INTERVALS = ["4 hrs", "2hrs", "1hr"];

// Field Details Modal Component
const FieldDetailsModal = ({
  isOpen,
  onClose,
  title,
  fieldStatuses,
  skippedFields,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fieldStatuses?: FieldStatus[];
  skippedFields?: SkippedField[];
}) => {
  if (!isOpen) return null;

  const normalizedSkippedFields = Array.isArray(skippedFields)
    ? skippedFields
    : [];

  const hasSkipped = normalizedSkippedFields.length > 0;
  const isObjectSkipped =
    normalizedSkippedFields.length > 0 &&
    typeof normalizedSkippedFields[0] === "object";

  const hasErrors =
    fieldStatuses?.some(
      (f) => f.status === "error" || f.status === "option_not_available",
    ) || false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary Badges */}
          <div className="flex gap-3 mb-4 flex-wrap">
            {hasSkipped && (
              <div className="flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
                <AlertTriangle className="w-4 h-4" />
                {normalizedSkippedFields.length} Skipped Fields
              </div>
            )}
            {hasErrors && (
              <div className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                <XCircle className="w-4 h-4" />
                Has Errors
              </div>
            )}
            {!hasSkipped &&
              !hasErrors &&
              fieldStatuses &&
              fieldStatuses.length > 0 && (
                <div className="flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm">
                  <Check className="w-4 h-4" />
                  All Fields Filled Successfully
                </div>
              )}
          </div>

          {/* Skipped Fields Details - For object format */}
          {isObjectSkipped && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Skipped Fields Details
              </h4>
              {(normalizedSkippedFields as SkippedFieldObject[]).map(
                (skipped, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-700">
                            {skipped.field}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-700 rounded-full">
                            Skipped
                          </span>
                        </div>
                        <div className="mt-1 text-sm">
                          <span className="text-gray-500">Requested: </span>
                          <span className="text-red-600 font-medium">
                            {skipped.requestedValue}
                          </span>
                        </div>
                        <div className="mt-1 text-sm">
                          <span className="text-gray-500">Reason: </span>
                          <span className="text-amber-700">
                            {skipped.reason}
                          </span>
                        </div>
                        {skipped.availableOptions &&
                          skipped.availableOptions.length > 0 && (
                            <div className="mt-2">
                              <span className="text-xs text-gray-500">
                                Available Options:{" "}
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {skipped.availableOptions.map(
                                  (option, optIdx) => (
                                    <span
                                      key={optIdx}
                                      className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                                    >
                                      {option}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 ml-2" />
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          {/* Skipped Fields Summary - For string format */}
          {!isObjectSkipped && hasSkipped && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">Skipped Fields:</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(normalizedSkippedFields as string[]).map((field, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-sm"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Field Statuses */}
          {fieldStatuses && fieldStatuses.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">
                Field Details
              </h4>
              {fieldStatuses.map((field, idx) => {
                const status = field.status || "unknown";
                const isFilled = status === "filled";
                const isSkipped =
                  status === "skipped" ||
                  status === "skip" ||
                  status === "option_not_available";
                const isError = status === "error" || status === "failed";

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border ${
                      isFilled
                        ? "bg-emerald-50 border-emerald-200"
                        : isSkipped
                          ? "bg-amber-50 border-amber-200"
                          : isError
                            ? "bg-red-50 border-red-200"
                            : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-700">
                            {field.label || "Unknown Field"}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              isFilled
                                ? "bg-emerald-200 text-emerald-700"
                                : isSkipped
                                  ? "bg-amber-200 text-amber-700"
                                  : isError
                                    ? "bg-red-200 text-red-700"
                                    : "bg-gray-200 text-gray-700"
                            }`}
                          >
                            {status === "option_not_available"
                              ? "option not available"
                              : status}
                          </span>
                        </div>

                        {field.usedValue && (
                          <div className="mt-1 text-sm">
                            <span className="text-gray-500">Used Value: </span>
                            <span className="text-gray-800 font-medium">
                              {field.usedValue}
                            </span>
                          </div>
                        )}

                        {field.originalValue &&
                          field.originalValue !== field.usedValue && (
                            <div className="mt-1 text-sm">
                              <span className="text-gray-500">Original: </span>
                              <span className="text-blue-600">
                                {field.originalValue}
                              </span>
                            </div>
                          )}

                        {!field.usedValue && field.originalValue && (
                          <div className="mt-1 text-sm">
                            <span className="text-gray-500">Value: </span>
                            <span className="text-gray-800 font-medium">
                              {field.originalValue}
                            </span>
                          </div>
                        )}

                        {field.availableOptions &&
                          field.availableOptions.length > 0 && (
                            <div className="mt-2">
                              <span className="text-xs text-gray-500">
                                Available Options:{" "}
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {field.availableOptions.map(
                                  (option, optIdx) => (
                                    <span
                                      key={optIdx}
                                      className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                                    >
                                      {option}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </div>

                      {isFilled && (
                        <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      )}
                      {isSkipped && (
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      )}
                      {isError && (
                        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No field details available</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Toast Component
const Toast = ({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info" | "warning";
  onClose: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = {
    success: "bg-emerald-50 border-emerald-500 text-emerald-800",
    error: "bg-red-50 border-red-500 text-red-800",
    info: "bg-blue-50 border-blue-500 text-blue-800",
    warning: "bg-amber-50 border-amber-500 text-amber-800",
  };

  const IconComponent = {
    success: CheckCircle,
    error: AlertCircle,
    info: RefreshCw,
    warning: AlertTriangle,
  };

  const SelectedIcon = IconComponent[type];

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 rounded-xl border-l-4 shadow-xl max-w-md animate-slide-in backdrop-blur-sm ${bgColor[type]}`}
    >
      <div className="flex items-start gap-3">
        <SelectedIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Passcode Lock Component
const PasscodeLock = ({
  onUnlock,
}: {
  onUnlock: (passcode: string) => void;
}) => {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const MAX_ATTEMPTS = 5;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      setError("Too many failed attempts. Please refresh the page.");
      return;
    }

    if (PASSCODES.includes(passcode)) {
      onUnlock(passcode);
      setError("");
      setPasscode("");
      setAttempts(0);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setError(
        `Invalid passcode. ${MAX_ATTEMPTS - newAttempts} attempts remaining.`,
      );
      setPasscode("");
      if (newAttempts >= MAX_ATTEMPTS) {
        setIsLocked(true);
        setError(
          "Too many failed attempts. Please refresh the page to try again.",
        );
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 max-w-md w-full border border-white/20">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Schedule Manager
          </h1>
          <p className="text-gray-500 mt-1">Enter passcode to access</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label
              htmlFor="passcode"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Enter 6-digit passcode
            </label>
            <input
              id="passcode"
              type="password"
              maxLength={6}
              value={passcode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "");
                if (value.length <= 6) {
                  setPasscode(value);
                  setError("");
                }
              }}
              placeholder="••••••"
              className={`w-full px-4 py-3 text-center text-2xl tracking-[1em] border-2 rounded-xl focus:ring-4 focus:ring-indigo-200 focus:border-indigo-500 transition-all ${
                error ? "border-red-300 bg-red-50" : "border-gray-200"
              }`}
              autoFocus
              disabled={isLocked}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLocked || passcode.length !== 6}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            <Unlock className="w-5 h-5" />
            Unlock
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            {isLocked
              ? "🔒 Locked • Please refresh"
              : "🔑 Contact administrator for passcode"}
          </p>
        </div>
      </div>
    </div>
  );
};

// Statistics Cards Component
const StatsCards = ({ schedules }: { schedules: Schedule[] }) => {
  const uniqueClinicians = new Set(schedules.map((s) => s["Name of Clinician"]))
    .size;
  const dayCount = new Set(schedules.map((s) => s["Scheduled Day"])).size;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-600 font-medium">Total Schedules</p>
            <p className="text-2xl font-bold text-blue-800">
              {schedules.length}
            </p>
          </div>
          <div className="w-10 h-10 bg-blue-200 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-blue-600" />
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-emerald-600 font-medium">Clinicians</p>
            <p className="text-2xl font-bold text-emerald-800">
              {uniqueClinicians}
            </p>
          </div>
          <div className="w-10 h-10 bg-emerald-200 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-600" />
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-purple-600 font-medium">Days Covered</p>
            <p className="text-2xl font-bold text-purple-800">{dayCount}</p>
          </div>
          <div className="w-10 h-10 bg-purple-200 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-purple-600" />
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-amber-600 font-medium">Departments</p>
            <p className="text-2xl font-bold text-amber-800">
              {
                new Set(schedules.map((s) => s["Department / Procedure to do"]))
                  .size
              }
            </p>
          </div>
          <div className="w-10 h-10 bg-amber-200 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-amber-600" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Tab Component
const TabButton = ({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
  count?: number;
}) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 ${
        active
          ? "bg-white shadow-md text-indigo-600 border border-indigo-200"
          : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
      }`}
    >
      <Icon className={`w-4 h-4 ${active ? "text-indigo-600" : ""}`} />
      <span className="font-medium text-sm">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            active
              ? "bg-indigo-100 text-indigo-600"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};

export default function ScheduleManager() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formUrl, setFormUrl] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    message: string;
    isError: boolean;
    details?: SubmissionResponse;
  } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDay, setFilterDay] = useState<string>("");
  const [filterDepartment, setFilterDepartment] = useState<string>("");
  const [isFormVisible, setIsFormVisible] = useState(true);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activeTab, setActiveTab] = useState<"schedules" | "history">(
    "schedules",
  );
  const [showStats, setShowStats] = useState(true);
  const [selectedFieldDetails, setSelectedFieldDetails] = useState<{
    isOpen: boolean;
    title: string;
    fieldStatuses?: FieldStatus[];
    skippedFields?: SkippedField[];
  }>({
    isOpen: false,
    title: "",
  });

  const [submissionProgress, setSubmissionProgress] = useState<{
    current: number;
    total: number;
    status: "idle" | "running" | "complete" | "error";
    results: SubmissionResult[];
    summary?: {
      total: number;
      successful: number;
      skippedFields: number;
      failed: number;
      fieldIssues: {
        fieldMissing: number;
        optionNotAvailable: number;
        disabled: number;
        other: number;
      };
    };
    totalTime?: string;
    averageTime?: string;
  }>({
    current: 0,
    total: 0,
    status: "idle",
    results: [],
  });

  const [formData, setFormData] = useState<Omit<Schedule, "id">>({
    Email: "",
    "Name of Clinician": "",
    "Student Number": "",
    "Scheduled Day": "Monday",
    "Shift Schedule ( Saturdays are am pm only, so please use 8-12 and 12-4pm as substitute for 1-5pm)":
      "8-12 AM shift",
    "Department / Procedure to do": "OD / OP",
    "Time Interval Required": "4 hrs",
  });

  useEffect(() => {
    const auth = sessionStorage.getItem("scheduleManagerAuth");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const saved = localStorage.getItem("schedules");
      if (saved) {
        try {
          setSchedules(JSON.parse(saved));
        } catch (e) {
          console.error("Error loading schedules:", e);
        }
      }

      const savedUrl = localStorage.getItem("formUrl");
      if (savedUrl) {
        setFormUrl(savedUrl);
      }

      const savedLogs = localStorage.getItem("activityLogs");
      if (savedLogs) {
        try {
          setActivityLogs(JSON.parse(savedLogs));
        } catch (e) {
          console.error("Error loading activity logs:", e);
        }
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem("schedules", JSON.stringify(schedules));
    }
  }, [schedules, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem("formUrl", formUrl);
    }
  }, [formUrl, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem("activityLogs", JSON.stringify(activityLogs));
    }
  }, [activityLogs, isAuthenticated]);

  const handleUnlock = (passcode: string) => {
    setIsAuthenticated(true);
    sessionStorage.setItem("scheduleManagerAuth", "true");
    sessionStorage.setItem("scheduleManagerPasscode", passcode);
  };

  const showToast = (
    message: string,
    type: "success" | "error" | "info" | "warning",
  ) => {
    setToast({ message, type });
  };

  const addActivityLog = (
    type: ActivityLog["type"],
    message: string,
    details?: string,
    success?: boolean,
    scheduleCount?: number,
    submissionDetails?: ActivityLog["submissionDetails"],
  ) => {
    const log: ActivityLog = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
      success,
      scheduleCount,
      submissionDetails,
    };
    setActivityLogs((prev) => [log, ...prev].slice(0, 100));
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      Email: "",
      "Name of Clinician": "",
      "Student Number": "",
      "Scheduled Day": "Monday",
      "Shift Schedule ( Saturdays are am pm only, so please use 8-12 and 12-4pm as substitute for 1-5pm)":
        "8-12 AM shift",
      "Department / Procedure to do": "OD / OP",
      "Time Interval Required": "4 hrs",
    });
    setEditingId(null);
  };

  const handleAddSchedule = () => {
    if (!formData.Email || !formData["Name of Clinician"]) {
      showToast("Please fill in at least Email and Clinician Name", "error");
      return;
    }

    const newSchedule: Schedule = {
      ...formData,
      id: Date.now().toString(),
    };

    setSchedules((prev) => [...prev, newSchedule]);
    addActivityLog(
      "add",
      `Added schedule for ${newSchedule["Name of Clinician"]}`,
      `Email: ${newSchedule.Email}`,
      true,
    );
    resetForm();
    showToast("✅ Schedule added successfully!", "success");
  };

  const handleEditSchedule = (id: string) => {
    const schedule = schedules.find((s) => s.id === id);
    if (schedule) {
      const { id: _, ...rest } = schedule;
      setFormData(rest);
      setEditingId(id);
      setIsFormVisible(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleUpdateSchedule = () => {
    if (!editingId) return;
    if (!formData.Email || !formData["Name of Clinician"]) {
      showToast("Please fill in at least Email and Clinician Name", "error");
      return;
    }

    const updatedSchedule = { ...formData, id: editingId };
    setSchedules((prev) =>
      prev.map((s) => (s.id === editingId ? updatedSchedule : s)),
    );
    addActivityLog(
      "edit",
      `Updated schedule for ${updatedSchedule["Name of Clinician"]}`,
      `ID: ${editingId}`,
      true,
    );
    resetForm();
    showToast("✅ Schedule updated successfully!", "success");
  };

  const handleDeleteSchedule = (id: string) => {
    const schedule = schedules.find((s) => s.id === id);
    if (confirm("Are you sure you want to delete this schedule?")) {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      if (schedule) {
        addActivityLog(
          "delete",
          `Deleted schedule for ${schedule["Name of Clinician"]}`,
          `ID: ${id}`,
          true,
        );
      }
      showToast("🗑️ Schedule deleted successfully!", "info");
    }
  };

  const handleDuplicateSchedule = (id: string) => {
    const schedule = schedules.find((s) => s.id === id);
    if (schedule) {
      const { id: _, ...rest } = schedule;
      const newSchedule: Schedule = {
        ...rest,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      };
      setSchedules((prev) => [...prev, newSchedule]);
      addActivityLog(
        "duplicate",
        `Duplicated schedule for ${schedule["Name of Clinician"]}`,
        `Original ID: ${id}`,
        true,
      );
      showToast("📋 Schedule duplicated successfully!", "success");
    }
  };

  const handleBulkDuplicate = () => {
    if (schedules.length === 0) {
      showToast("No schedules to duplicate", "error");
      return;
    }
    const duplicates = schedules.map((s) => ({
      ...s,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    }));
    setSchedules((prev) => [...prev, ...duplicates]);
    addActivityLog(
      "bulk_duplicate",
      `Bulk duplicated ${duplicates.length} schedules`,
      undefined,
      true,
      duplicates.length,
    );
    showToast(`📋 Duplicated ${duplicates.length} schedule(s)!`, "success");
  };

  const handleSubmitToGoogleForm = async () => {
    if (!formUrl) {
      showToast("Please enter a Google Form URL", "error");
      return;
    }

    if (schedules.length === 0) {
      showToast("No schedules to submit", "error");
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);
    setSubmissionProgress({
      current: 0,
      total: schedules.length,
      status: "running",
      results: [],
    });

    try {
      const response = await fetch("/api/auto-gf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formUrl,
          action: "submit",
          schedules: schedules.map(({ id, ...rest }) => rest),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: SubmissionResponse = await response.json();

      setSubmissionProgress({
        current: data.results.length,
        total: data.results.length,
        status: data.success ? "complete" : "error",
        results: data.results,
        summary: data.summary,
        totalTime: data.totalTime,
        averageTime: data.averageTime,
      });

      const intervals = data.results.map((result, idx) => {
        const schedule = schedules[idx];
        return {
          scheduleIndex: result.scheduleIndex,
          clinicianName: schedule?.["Name of Clinician"] || "Unknown",
          success: result.success,
          timeTaken: result.timeTaken,
          timestamp: result.timestamp,
          skippedFields: result.skippedFields || [],
          fieldCount: result.filledFields?.length || 0,
          filledFields: result.filledFields || [],
          fieldStatuses: result.fieldStatuses || [],
        };
      });

      const successCount = data.summary?.successful || 0;
      const failureCount = data.summary?.failed || 0;
      const totalSkipped = data.summary?.skippedFields || 0;

      addActivityLog(
        "submission",
        `📊 ${successCount}/${data.results.length} schedules processed (${totalSkipped} with skips, ${failureCount} failed)`,
        `Form URL: ${formUrl}`,
        data.success,
        data.results.length,
        {
          totalTime: data.totalTime,
          averageTime: data.averageTime,
          successRate: `${((successCount / data.results.length) * 100).toFixed(
            1,
          )}%`,
          summary: data.summary,
          intervals: intervals,
        },
      );

      setSubmitStatus({
        message: data.success ? `✅ ${data.message}` : `⚠️ ${data.message}`,
        isError: !data.success,
        details: data,
      });

      if (data.success) {
        showToast(`✅ ${data.message}`, "success");
      } else {
        showToast(`⚠️ ${data.message}`, "error");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Submission failed";
      setSubmitStatus({
        message: `❌ ${errorMessage}`,
        isError: true,
      });
      showToast(`❌ ${errorMessage}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSchedules = schedules.filter((schedule) => {
    const matchesSearch =
      schedule.Email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule["Name of Clinician"]
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      schedule["Student Number"].includes(searchTerm);
    const matchesDay = filterDay
      ? schedule["Scheduled Day"] === filterDay
      : true;
    const matchesDepartment = filterDepartment
      ? schedule["Department / Procedure to do"] === filterDepartment
      : true;
    return matchesSearch && matchesDay && matchesDepartment;
  });

  const uniqueDays = [...new Set(schedules.map((s) => s["Scheduled Day"]))];
  const uniqueDepartments = [
    ...new Set(schedules.map((s) => s["Department / Procedure to do"])),
  ];

  if (!isAuthenticated) {
    return <PasscodeLock onUnlock={handleUnlock} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        {/* Field Details Modal */}
        <FieldDetailsModal
          isOpen={selectedFieldDetails.isOpen}
          onClose={() => setSelectedFieldDetails({ isOpen: false, title: "" })}
          title={selectedFieldDetails.title}
          fieldStatuses={selectedFieldDetails.fieldStatuses}
          skippedFields={selectedFieldDetails.skippedFields}
        />

        {/* Header */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg p-6 mb-6 border border-white/20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-3">
                <span>📋 Schedule Management</span>
                <span className="text-sm font-normal bg-gradient-to-r from-indigo-100 to-purple-100 px-3 py-1 rounded-full text-gray-700">
                  {schedules.length} total
                </span>
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage and submit schedules to Google Forms
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setShowStats(!showStats)}
                className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-200 transition-all text-sm flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                {showStats ? "Hide Stats" : "Show Stats"}
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem("scheduleManagerAuth");
                  sessionStorage.removeItem("scheduleManagerPasscode");
                  setIsAuthenticated(false);
                }}
                className="px-3 py-2 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition-all text-sm flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Lock
              </button>
            </div>
          </div>
        </div>

        {/* Statistics */}
        {showStats && <StatsCards schedules={schedules} />}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white/60 backdrop-blur-sm p-1.5 rounded-2xl border border-gray-200 shadow-sm">
          <TabButton
            active={activeTab === "schedules"}
            onClick={() => setActiveTab("schedules")}
            icon={LayoutDashboard}
            label="Schedules"
            count={schedules.length}
          />
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            icon={History}
            label="History"
            count={activityLogs.length}
          />
        </div>

        {/* Schedules Tab */}
        {activeTab === "schedules" && (
          <div className="space-y-6">
            {/* Google Form Configuration */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                Google Form Configuration
              </h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="Enter Google Form URL"
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                />
                <button
                  onClick={handleSubmitToGoogleForm}
                  disabled={isSubmitting || schedules.length === 0}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Submit All ({schedules.length})
                    </>
                  )}
                </button>
              </div>

              {/* Submission Results */}
              {!isSubmitting &&
                submissionProgress.status === "complete" &&
                submissionProgress.results.length > 0 && (
                  <div className="mt-4">
                    {/* Summary Cards */}
                    {submissionProgress.summary && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                          <div className="text-xs text-emerald-600 font-medium">
                            Successful
                          </div>
                          <div className="text-xl font-bold text-emerald-700">
                            {submissionProgress.summary.successful}
                          </div>
                        </div>
                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                          <div className="text-xs text-amber-600 font-medium">
                            Skipped Fields
                          </div>
                          <div className="text-xl font-bold text-amber-700">
                            {submissionProgress.summary.skippedFields}
                          </div>
                        </div>
                        <div className="bg-red-50 p-3 rounded-xl border border-red-200">
                          <div className="text-xs text-red-600 font-medium">
                            Failed
                          </div>
                          <div className="text-xl font-bold text-red-700">
                            {submissionProgress.summary.failed}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                          <div className="text-xs text-blue-600 font-medium">
                            Total Time
                          </div>
                          <div className="text-xl font-bold text-blue-700">
                            {submissionProgress.totalTime}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Results Table */}
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                              #
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                              Status
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                              Message
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
                              Time
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                              Timestamp
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">
                              Fields
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">
                              Details
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {submissionProgress.results.map((result, idx) => {
                            const schedule = schedules[idx];
                            return (
                              <tr
                                key={idx}
                                className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                              >
                                <td className="px-3 py-2 font-mono text-xs">
                                  #{result.scheduleIndex}
                                </td>
                                <td className="px-3 py-2">
                                  {result.success ? (
                                    <span className="text-emerald-600">
                                      ✅ Success
                                    </span>
                                  ) : (
                                    <span className="text-red-600">
                                      ❌ Failed
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {result.message}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {result.timeTaken}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {result.timestamp}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {result.skippedFields &&
                                  result.skippedFields.length > 0 ? (
                                    <span
                                      className="text-amber-600 text-xs"
                                      title={`Skipped: ${result.skippedFields.length} field(s)`}
                                    >
                                      ⚠️ {result.filledFields?.length || 0}
                                    </span>
                                  ) : (
                                    <span className="text-emerald-600 text-xs">
                                      ✅ {result.filledFields?.length || 0}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => {
                                      setSelectedFieldDetails({
                                        isOpen: true,
                                        title: `Field Details - ${
                                          schedule?.["Name of Clinician"] ||
                                          "Schedule"
                                        }`,
                                        fieldStatuses:
                                          result.fieldStatuses || [],
                                        skippedFields:
                                          result.skippedFields || [],
                                      });
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mx-auto"
                                  >
                                    <Eye className="w-3 h-3" />
                                    View
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {submitStatus &&
                !isSubmitting &&
                submissionProgress.status !== "complete" && (
                  <div
                    className={`mt-4 p-4 rounded-xl flex items-center gap-2 ${
                      submitStatus.isError
                        ? "bg-red-100 text-red-700 border border-red-200"
                        : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    {submitStatus.isError ? (
                      <AlertCircle className="w-5 h-5" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    {submitStatus.message}
                  </div>
                )}
            </div>

            {/* Add/Edit Form */}
            {isFormVisible && (
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200 transition-all duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
                    {editingId ? (
                      <>
                        <Edit2 className="w-5 h-5 text-blue-600" />
                        Edit Schedule
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5 text-blue-600" />
                        Add New Schedule
                      </>
                    )}
                  </h2>
                  {editingId && (
                    <button
                      onClick={resetForm}
                      className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
                    >
                      <X className="w-4 h-4" /> Cancel Editing
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <input
                    type="email"
                    name="Email"
                    value={formData.Email}
                    onChange={handleInputChange}
                    placeholder="Email *"
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                  />
                  <input
                    type="text"
                    name="Name of Clinician"
                    value={formData["Name of Clinician"]}
                    onChange={handleInputChange}
                    placeholder="Name of Clinician *"
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                  />
                  <input
                    type="text"
                    name="Student Number"
                    value={formData["Student Number"]}
                    onChange={handleInputChange}
                    placeholder="Student Number"
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                  />
                  <select
                    name="Scheduled Day"
                    value={formData["Scheduled Day"]}
                    onChange={handleInputChange}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                  >
                    {DAYS.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                  <select
                    name="Shift Schedule ( Saturdays are am pm only, so please use 8-12 and 12-4pm as substitute for 1-5pm)"
                    value={
                      formData[
                        "Shift Schedule ( Saturdays are am pm only, so please use 8-12 and 12-4pm as substitute for 1-5pm)"
                      ]
                    }
                    onChange={handleInputChange}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                  >
                    {SHIFTS.map((shift) => (
                      <option key={shift} value={shift}>
                        {shift}
                      </option>
                    ))}
                  </select>
                  <select
                    name="Department / Procedure to do"
                    value={formData["Department / Procedure to do"]}
                    onChange={handleInputChange}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  <select
                    name="Time Interval Required"
                    value={formData["Time Interval Required"]}
                    onChange={handleInputChange}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                  >
                    {TIME_INTERVALS.map((interval) => (
                      <option key={interval} value={interval}>
                        {interval}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-col sm:flex-row gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
                    <button
                      onClick={
                        editingId ? handleUpdateSchedule : handleAddSchedule
                      }
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                    >
                      <Save className="w-5 h-5" />
                      {editingId ? "Update Schedule" : "Add Schedule"}
                    </button>
                    {editingId && (
                      <button
                        onClick={resetForm}
                        className="px-6 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <X className="w-5 h-5" />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Schedules List */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
                  📅 Schedules
                  <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {filteredSchedules.length} shown
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <div className="flex gap-2 flex-1 sm:flex-initial">
                    <div className="relative flex-1 sm:w-48">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                      />
                    </div>
                    <select
                      value={filterDay}
                      onChange={(e) => setFilterDay(e.target.value)}
                      className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                    >
                      <option value="">All Days</option>
                      {uniqueDays.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterDepartment}
                      onChange={(e) => setFilterDepartment(e.target.value)}
                      className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all bg-gray-50"
                    >
                      <option value="">All Depts</option>
                      {uniqueDepartments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleBulkDuplicate}
                      disabled={schedules.length === 0}
                      className="px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                    >
                      <Copy className="w-4 h-4" />
                      <span className="hidden sm:inline">Duplicate All</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete all schedules?")) {
                          setSchedules([]);
                          addActivityLog(
                            "clear_all",
                            "Cleared all schedules",
                            undefined,
                            true,
                            0,
                          );
                          showToast("All schedules cleared", "info");
                        }
                      }}
                      className="px-3 py-2 text-red-600 hover:text-red-800 text-sm flex items-center gap-1 border-2 border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Clear All</span>
                    </button>
                    <button
                      onClick={() => setIsFormVisible(!isFormVisible)}
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all text-sm flex items-center gap-2"
                    >
                      {isFormVisible ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                      {isFormVisible ? "Hide Form" : "Show Form"}
                    </button>
                  </div>
                </div>
              </div>

              {schedules.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-7xl mb-4">📭</div>
                  <p className="text-gray-500 text-xl font-medium">
                    No schedules added yet
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    Click "Show Form" and add your first schedule above!
                  </p>
                </div>
              ) : filteredSchedules.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    No schedules match your search criteria
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="min-w-full inline-block align-middle">
                    <div className="overflow-hidden shadow-sm rounded-xl">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                              Email
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                              Clinician
                            </th>
                            <th className="hidden md:table-cell px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                              Student #
                            </th>
                            <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                              Day
                            </th>
                            <th className="hidden lg:table-cell px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                              Shift
                            </th>
                            <th className="hidden xl:table-cell px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                              Dept.
                            </th>
                            <th className="hidden xl:table-cell px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                              Time
                            </th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredSchedules.map((schedule) => (
                            <tr
                              key={schedule.id}
                              className="hover:bg-gray-50 transition-colors"
                            >
                              <td
                                className="px-3 py-3 text-sm truncate max-w-[120px]"
                                title={schedule.Email}
                              >
                                {schedule.Email}
                              </td>
                              <td
                                className="px-3 py-3 text-sm font-medium truncate max-w-[120px]"
                                title={schedule["Name of Clinician"]}
                              >
                                {schedule["Name of Clinician"]}
                              </td>
                              <td className="hidden md:table-cell px-3 py-3 text-sm truncate max-w-[80px]">
                                {schedule["Student Number"]}
                              </td>
                              <td className="hidden sm:table-cell px-3 py-3 text-sm">
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                  {schedule["Scheduled Day"]}
                                </span>
                              </td>
                              <td className="hidden lg:table-cell px-3 py-3 text-sm truncate max-w-[120px]">
                                {
                                  schedule[
                                    "Shift Schedule ( Saturdays are am pm only, so please use 8-12 and 12-4pm as substitute for 1-5pm)"
                                  ]
                                }
                              </td>
                              <td className="hidden xl:table-cell px-3 py-3 text-sm truncate max-w-[100px]">
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                  {schedule["Department / Procedure to do"]}
                                </span>
                              </td>
                              <td className="hidden xl:table-cell px-3 py-3 text-sm">
                                {schedule["Time Interval Required"]}
                              </td>
                              <td className="px-3 py-3 text-sm">
                                <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
                                  <button
                                    onClick={() =>
                                      handleEditSchedule(schedule.id)
                                    }
                                    className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDuplicateSchedule(schedule.id)
                                    }
                                    className="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition-colors"
                                    title="Duplicate"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteSchedule(schedule.id)
                                    }
                                    className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                Activity History
              </h2>
              <button
                onClick={() => {
                  if (confirm("Clear all activity logs?")) {
                    setActivityLogs([]);
                    showToast("History cleared", "info");
                  }
                }}
                className="text-sm text-red-600 hover:text-red-800 transition-colors"
              >
                Clear All
              </button>
            </div>
            {activityLogs.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-7xl mb-4">📭</div>
                <p className="text-gray-500 text-xl font-medium">
                  No activity yet
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Submit schedules to see activity history
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {activityLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-xl border ${
                      log.success === false
                        ? "bg-red-50 border-red-200"
                        : log.type === "submission"
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-gray-50 border-gray-200"
                    } hover:shadow-md transition-shadow`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            log.type === "submission"
                              ? "bg-emerald-200 text-emerald-800"
                              : log.type === "add"
                                ? "bg-blue-200 text-blue-800"
                                : log.type === "edit"
                                  ? "bg-amber-200 text-amber-800"
                                  : log.type === "delete"
                                    ? "bg-red-200 text-red-800"
                                    : "bg-purple-200 text-purple-800"
                          }`}
                        >
                          {log.type.replace("_", " ").toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-gray-800">
                          {log.message}
                        </span>
                        {log.scheduleCount !== undefined && (
                          <span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full">
                            {log.scheduleCount} items
                          </span>
                        )}
                        {log.success !== undefined && (
                          <span className="text-xs">
                            {log.success ? "✅" : "❌"}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {log.details && (
                      <p className="text-xs text-gray-500 mt-1">
                        {log.details}
                      </p>
                    )}

                    {log.submissionDetails && log.type === "submission" && (
                      <div className="mt-3">
                        <div className="flex gap-4 text-xs mb-3 flex-wrap">
                          <span className="font-medium">
                            Total:{" "}
                            <span className="text-emerald-700">
                              {log.submissionDetails.totalTime}
                            </span>
                          </span>
                          <span className="font-medium">
                            Avg:{" "}
                            <span className="text-blue-700">
                              {log.submissionDetails.averageTime}
                            </span>
                          </span>
                          <span className="font-medium">
                            Success Rate:{" "}
                            <span className="text-purple-700">
                              {log.submissionDetails.successRate}
                            </span>
                          </span>
                          {log.submissionDetails.summary && (
                            <>
                              <span className="font-medium">
                                Successful:{" "}
                                <span className="text-emerald-700">
                                  {log.submissionDetails.summary.successful}
                                </span>
                              </span>
                              <span className="font-medium">
                                Skipped:{" "}
                                <span className="text-amber-700">
                                  {log.submissionDetails.summary.skippedFields}
                                </span>
                              </span>
                            </>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-2 py-1 text-left">#</th>
                                <th className="px-2 py-1 text-left">
                                  Clinician
                                </th>
                                <th className="px-2 py-1 text-left">Status</th>
                                <th className="px-2 py-1 text-right">Time</th>
                                <th className="px-2 py-1 text-left">
                                  Timestamp
                                </th>
                                <th className="px-2 py-1 text-center">
                                  Fields
                                </th>
                                <th className="px-2 py-1 text-center">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {log.submissionDetails.intervals.map(
                                (item, idx) => (
                                  <tr
                                    key={idx}
                                    className="border-t border-gray-100"
                                  >
                                    <td className="px-2 py-1 font-mono">
                                      #{item.scheduleIndex}
                                    </td>
                                    <td
                                      className="px-2 py-1 max-w-[100px] truncate"
                                      title={item.clinicianName}
                                    >
                                      {item.clinicianName}
                                    </td>
                                    <td className="px-2 py-1">
                                      {item.success ? "✅" : "❌"}
                                    </td>
                                    <td className="px-2 py-1 text-right font-mono">
                                      {item.timeTaken}
                                    </td>
                                    <td className="px-2 py-1 text-left text-xs text-gray-500">
                                      {item.timestamp || "—"}
                                    </td>
                                    <td className="px-2 py-1 text-center">
                                      {item.skippedFields &&
                                      item.skippedFields.length > 0 ? (
                                        <span
                                          className="text-amber-600"
                                          title={`Skipped: ${item.skippedFields.length} field(s)`}
                                        >
                                          ⚠️{item.fieldCount || 0}
                                        </span>
                                      ) : (
                                        <span className="text-emerald-600">
                                          ✅{item.fieldCount || 0}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1 text-center">
                                      <button
                                        onClick={() => {
                                          setSelectedFieldDetails({
                                            isOpen: true,
                                            title: `Field Details - ${item.clinicianName}`,
                                            fieldStatuses:
                                              item.fieldStatuses || [],
                                            skippedFields:
                                              item.skippedFields || [],
                                          });
                                        }}
                                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mx-auto"
                                      >
                                        <Eye className="w-3 h-3" />
                                        View
                                      </button>
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <style jsx global>{`
          @keyframes slide-in {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          .animate-slide-in {
            animation: slide-in 0.3s ease-out;
          }
        `}</style>
      </div>
    </div>
  );
}
