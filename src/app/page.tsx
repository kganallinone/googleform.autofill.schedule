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

interface SubmissionResponse {
  message: string;
  success: boolean;
  results: Array<{
    success: boolean;
    message: string;
    timeTaken: number;
    timeTakenFormatted: string;
    scheduleIndex: number;
  }>;
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
}

// ====== PASCODE CONFIGURATION ======
// Add your 6-digit passcodes here
const PASSCODES = [
  "123456", // Example passcode
  "654321", // Another example
  "112233", // Add your passcodes here
];

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const SHIFTS = ["8-12 AM shift", "12-4 PM shift", "4-8 PM shif"];

const DEPARTMENTS = [
  "OD / OP",
  "Prothodontics",
  "Endodontics",
  "Operative Dentistry",
  "Periodontics",
  "Oral Sugery",
  "Orthodontics",
  "Pediatrics",
  "TYPO",
];

const TIME_INTERVALS = ["4 hrs", "2hrs", "1hr"];

// Toast notification component
const Toast = ({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = {
    success: "bg-green-50 border-green-500 text-green-800",
    error: "bg-red-50 border-red-500 text-red-800",
    info: "bg-blue-50 border-blue-500 text-blue-800",
  };

  const IconComponent = {
    success: CheckCircle,
    error: AlertCircle,
    info: RefreshCw,
  };

  const SelectedIcon = IconComponent[type];

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 rounded-lg border-l-4 shadow-lg max-w-md animate-slide-in ${bgColor[type]}`}
    >
      <div className="flex items-start gap-3">
        {SelectedIcon && (
          <SelectedIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        )}
        <p className="text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="ml-auto text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Passcode Lock Screen Component
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

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Schedule Manager</h1>
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
              onKeyPress={handleKeyPress}
              placeholder="••••••"
              className={`w-full px-4 py-3 text-center text-2xl tracking-[1em] border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                error ? "border-red-300 bg-red-50" : "border-gray-300"
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
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
          >
            <Unlock className="w-5 h-5" />
            Unlock
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            {isLocked
              ? "Locked • Please refresh"
              : "Contact administrator for passcode"}
          </p>
        </div>
      </div>
    </div>
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
  } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDay, setFilterDay] = useState<string>("");
  const [isFormVisible, setIsFormVisible] = useState(true);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [submissionProgress, setSubmissionProgress] = useState<{
    current: number;
    total: number;
    status: "idle" | "running" | "complete" | "error";
    results: Array<{ index: number; success: boolean; message: string }>;
  }>({
    current: 0,
    total: 0,
    status: "idle",
    results: [],
  });

  // Form state for adding/editing
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

  // Check if already authenticated in session
  useEffect(() => {
    const auth = sessionStorage.getItem("scheduleManagerAuth");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  // Load schedules from localStorage on mount
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

  // Save schedules to localStorage whenever they change
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem("schedules", JSON.stringify(schedules));
    }
  }, [schedules, isAuthenticated]);

  // Save form URL to localStorage
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem("formUrl", formUrl);
    }
  }, [formUrl, isAuthenticated]);

  // Save activity logs to localStorage
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

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const addActivityLog = (
    type: ActivityLog["type"],
    message: string,
    details?: string,
    success?: boolean,
    scheduleCount?: number,
  ) => {
    const log: ActivityLog = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
      success,
      scheduleCount,
    };
    setActivityLogs((prev) => [log, ...prev].slice(0, 100)); // Keep last 100 logs
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
    showToast("Schedule added successfully!", "success");
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
    showToast("Schedule updated successfully!", "success");
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
      showToast("Schedule deleted successfully!", "success");
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
      showToast("Schedule duplicated successfully!", "success");
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
    showToast(`Duplicated ${duplicates.length} schedule(s)!`, "success");
  };

  const submitSingleSchedule = async (
    schedule: Schedule,
    index: number,
  ): Promise<{ success: boolean; message: string; timeTaken: number }> => {
    const startTime = performance.now();

    try {
      const response = await fetch("/api/auto-gf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formUrl,
          action: "submit",
          schedules: [schedule], // Send one at a time
        }),
      });

      const endTime = performance.now();
      const timeTaken = endTime - startTime;

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: SubmissionResponse = await response.json();

      return {
        success: data.success && data.results[0]?.success === true,
        message: data.results[0]?.message || data.message || "Submitted",
        timeTaken,
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        message: error instanceof Error ? error.message : "Submission failed",
        timeTaken: endTime - startTime,
      };
    }
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

    const results: Array<{ index: number; success: boolean; message: string }> =
      [];
    let successCount = 0;
    let failureCount = 0;

    // Submit one schedule at a time
    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i];
      const result = await submitSingleSchedule(schedule, i);

      results.push({
        index: i,
        success: result.success,
        message: result.message,
      });

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }

      setSubmissionProgress({
        current: i + 1,
        total: schedules.length,
        status: "running",
        results: [...results],
      });

      // Small delay between submissions to avoid rate limiting
      if (i < schedules.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Final status
    const allSuccess = failureCount === 0;
    setSubmissionProgress({
      current: schedules.length,
      total: schedules.length,
      status: allSuccess ? "complete" : "error",
      results,
    });

    const summary = `Submitted ${successCount}/${schedules.length} schedules (${failureCount} failed)`;
    addActivityLog(
      "submission",
      summary,
      `Form URL: ${formUrl}`,
      allSuccess,
      schedules.length,
    );

    setSubmitStatus({
      message: allSuccess
        ? `✅ All ${schedules.length} schedule(s) submitted successfully!`
        : `⚠️ ${successCount} succeeded, ${failureCount} failed. Check details below.`,
      isError: !allSuccess,
    });

    if (allSuccess) {
      showToast(
        `All ${schedules.length} schedules submitted successfully!`,
        "success",
      );
    } else {
      showToast(
        `${successCount} succeeded, ${failureCount} failed. Check details.`,
        "error",
      );
    }

    setIsSubmitting(false);
  };

  // Filter schedules
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
    return matchesSearch && matchesDay;
  });

  // Get unique days for filter
  const uniqueDays = [...new Set(schedules.map((s) => s["Scheduled Day"]))];

  // Show passcode lock if not authenticated
  if (!isAuthenticated) {
    return <PasscodeLock onUnlock={handleUnlock} />;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <span>📋 Schedule Management</span>
          <span className="text-sm font-normal text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {schedules.length} total
          </span>
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-sm flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            {showHistory ? "Hide History" : "History"}
            {activityLogs.length > 0 && (
              <span className="bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5 ml-1">
                {activityLogs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsFormVisible(!isFormVisible)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm flex items-center gap-2"
          >
            {isFormVisible ? (
              <X className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {isFormVisible ? "Hide Form" : "Show Form"}
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem("scheduleManagerAuth");
              sessionStorage.removeItem("scheduleManagerPasscode");
              setIsAuthenticated(false);
            }}
            className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm flex items-center gap-2"
          >
            <Lock className="w-4 h-4" />
            Lock
          </button>
        </div>
      </div>

      {/* Activity History */}
      {showHistory && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border border-gray-200 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              Activity History
            </h2>
            <button
              onClick={() => {
                if (confirm("Clear all activity logs?")) {
                  setActivityLogs([]);
                  showToast("History cleared", "info");
                }
              }}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Clear All
            </button>
          </div>
          {activityLogs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border ${
                    log.success === false
                      ? "bg-red-50 border-red-200"
                      : log.type === "submission"
                        ? "bg-green-50 border-green-200"
                        : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          log.type === "submission"
                            ? "bg-green-200 text-green-800"
                            : log.type === "add"
                              ? "bg-blue-200 text-blue-800"
                              : log.type === "edit"
                                ? "bg-yellow-200 text-yellow-800"
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
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {log.details && (
                    <p className="text-xs text-gray-500 mt-1">{log.details}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Google Form URL Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 mb-8 border border-blue-100">
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
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
          <button
            onClick={handleSubmitToGoogleForm}
            disabled={isSubmitting || schedules.length === 0}
            className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {submissionProgress.current}/{submissionProgress.total}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit All ({schedules.length})
              </>
            )}
          </button>
        </div>

        {/* Submission Progress */}
        {isSubmitting && submissionProgress.status === "running" && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Submitting...</span>
              <span>
                {submissionProgress.current}/{submissionProgress.total}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(submissionProgress.current / submissionProgress.total) * 100}%`,
                }}
              />
            </div>
            <div className="mt-2 max-h-32 overflow-y-auto">
              {submissionProgress.results.map((result, idx) => (
                <div
                  key={idx}
                  className={`text-xs py-0.5 ${
                    result.success ? "text-green-600" : "text-red-600"
                  }`}
                >
                  #{idx + 1}: {result.success ? "✅" : "❌"} {result.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {submitStatus && !isSubmitting && (
          <div
            className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
              submitStatus.isError
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
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
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border border-gray-200 transition-all duration-300">
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
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
            <input
              type="text"
              name="Name of Clinician"
              value={formData["Name of Clinician"]}
              onChange={handleInputChange}
              placeholder="Name of Clinician *"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
            <input
              type="text"
              name="Student Number"
              value={formData["Student Number"]}
              onChange={handleInputChange}
              placeholder="Student Number"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
            <select
              name="Scheduled Day"
              value={formData["Scheduled Day"]}
              onChange={handleInputChange}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              {TIME_INTERVALS.map((interval) => (
                <option key={interval} value={interval}>
                  {interval}
                </option>
              ))}
            </select>
            <div className="flex flex-col sm:flex-row gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <button
                onClick={editingId ? handleUpdateSchedule : handleAddSchedule}
                className="flex-1 px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
              >
                <Save className="w-4 h-4" />
                {editingId ? "Update Schedule" : "Add Schedule"}
              </button>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedules List */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
            📅 Schedules
            <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {filteredSchedules.length} shown
            </span>
          </h2>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <div className="flex gap-2 flex-1 sm:flex-initial">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 sm:w-40 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={filterDay}
                onChange={(e) => setFilterDay(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">All Days</option>
                {uniqueDays.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBulkDuplicate}
                disabled={schedules.length === 0}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="px-3 py-1.5 text-red-600 hover:text-red-800 text-sm flex items-center gap-1 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            </div>
          </div>
        </div>

        {schedules.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-gray-500 text-lg">No schedules added yet</p>
            <p className="text-gray-400 text-sm">
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
              <div className="overflow-hidden shadow-sm rounded-lg">
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
                              onClick={() => handleEditSchedule(schedule.id)}
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
                              onClick={() => handleDeleteSchedule(schedule.id)}
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

      {/* Add global styles for animations */}
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
  );
}
