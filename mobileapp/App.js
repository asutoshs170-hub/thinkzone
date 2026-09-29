import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
// Custom UUID v4 — avoids crypto.getRandomValues() which is unsupported in Expo Go
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Configuration ────────────────────────────────────────────────────────────
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured");
}

const STORAGE_KEYS = {
  selectedUser: "selectedUser",
  questionnaire: "cachedQuestionnaire",
  offlineQueue: "offlineQueue",
  cachedSchools: "cachedSchools",
};

const demoUsers = [
  { userId: "U1001", name: "Asha Patra" },
  { userId: "U1002", name: "Ramesh Nayak" },
  { userId: "U1003", name: "Sunita Das" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function getIstDateParts(dateInput) {
  const value = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(value);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    clearTimeout(timeoutId);
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }

    if (!response.ok) {
      const errorMessage =
        data?.error || `Request failed with status ${response.status}`;
      const err = new Error(errorMessage);
      err.statusCode = response.status;
      throw err;
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Check that the server is running.");
    }
    throw err;
  }
}

// ─── Offline Queue helpers ────────────────────────────────────────────────────

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.offlineQueue);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(STORAGE_KEYS.offlineQueue, JSON.stringify(queue));
}

// Global sync lock — prevents multiple concurrent sync processes
let _syncInProgress = false;

async function syncQueuedVisits() {
  if (_syncInProgress) return { syncedCount: 0, pendingCount: 0 };
  _syncInProgress = true;

  let syncedCount = 0;
  let pendingCount = 0;

  try {
    const queue = await readQueue();
    if (!queue.length) return { syncedCount: 0, pendingCount: 0 };

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      const pendingItems = queue.filter((i) => i.status === "Pending");
      return { syncedCount: 0, pendingCount: pendingItems.length };
    }

    // Only attempt Pending items
    const updated = [...queue];

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      if (item.status !== "Pending") continue;

      try {
        await fetchJson(`${API_BASE_URL}/api/visits`, {
          method: "POST",
          body: JSON.stringify({
            clientId: item.clientId,
            userId: item.userId,
            udiseCode: item.udiseCode,
            visitedAt: item.visitedAt,
            answers: item.answers,
          }),
        });
        // 200/201 → Synced to MongoDB database
        updated[i] = { ...item, status: "Synced", failureReason: "" };
        syncedCount++;
      } catch (error) {
        const statusCode = error.statusCode;
        if (statusCode && statusCode >= 400 && statusCode < 500) {
          // 4xx validation error → Failed, never retry
          updated[i] = {
            ...item,
            status: "Failed",
            failureReason: error.message || "Validation error",
          };
        } else {
          // Network error / 5xx → keep as Pending for next retry when online
          updated[i] = {
            ...item,
            status: "Pending",
            failureReason: error.message || "Network error",
          };
          pendingCount++;
        }
      }
    }

    await writeQueue(updated);
    return { syncedCount, pendingCount };
  } finally {
    _syncInProgress = false;
  }
}

async function precacheData() {
  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    // Cache current questionnaire so user can fill form while offline
    const q = await fetchJson(`${API_BASE_URL}/api/questionnaires/current`);
    if (q && q.questions) {
      await AsyncStorage.setItem(STORAGE_KEYS.questionnaire, JSON.stringify(q));
    }

    // Cache school list for offline school selection
    const s = await fetchJson(`${API_BASE_URL}/api/schools?page=1&limit=50`);
    if (s && s.items) {
      await AsyncStorage.setItem(
        STORAGE_KEYS.cachedSchools,
        JSON.stringify(s.items),
      );
    }
  } catch (_) {
    // Silent fail in background precache
  }
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function ChooseUserScreen({ onSelectUser }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Choose User</Text>
      {demoUsers.map((user) => (
        <TouchableOpacity
          key={user.userId}
          style={styles.optionCard}
          onPress={() => onSelectUser(user)}
        >
          <Text style={styles.optionText}>{user.name}</Text>
          <Text style={styles.optionSub}>{user.userId}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SelectSchoolScreen({ user, onSchoolSelect, onBack }) {
  const [districtCode, setDistrictCode] = useState("");
  const [blockCode, setBlockCode] = useState("");
  const [search, setSearch] = useState("");
  const [schools, setSchools] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [isOffline, setIsOffline] = useState(false);

  // Load cached schools on mount
  useEffect(() => {
    const loadCached = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.cachedSchools);
        if (raw) {
          const data = JSON.parse(raw);
          if (Array.isArray(data) && data.length) {
            setSchools(data);
          }
        }
      } catch (_) {
        // ignore
      }
    };
    loadCached();
  }, []);

  // Debounced fetch when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSchools(1, true);
    }, 350);
    return () => clearTimeout(timer);
  }, [districtCode, blockCode, search]);

  const fetchSchools = async (nextPage = 1, reset = false) => {
    setLoading(true);
    setError("");
    setIsOffline(false);

    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: "10",
      });

      if (districtCode.trim())
        query.append("districtCode", districtCode.trim());
      if (blockCode.trim()) query.append("blockCode", blockCode.trim());
      if (search.trim()) query.append("search", search.trim());

      const result = await fetchJson(
        `${API_BASE_URL}/api/schools?${query.toString()}`,
      );
      const items = result.items || [];
      const finalItems = reset ? items : [...schools, ...items];
      setSchools(finalItems);
      setHasMore(nextPage < (result.totalPages || 1));
      setPage(nextPage);

      // Cache results for offline use
      if (reset && items.length > 0) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.cachedSchools,
          JSON.stringify(finalItems),
        );
      }
    } catch (err) {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        setIsOffline(true);
        setError("You are offline. Showing cached schools.");
      } else {
        setError(err.message || "Unable to load schools. Check server.");
      }
      if (reset) {
        // Keep cached data visible — don't clear schools
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Select School</Text>
      <Text style={styles.label}>User: {user.name}</Text>

      {isOffline ? (
        <Text style={styles.warningText}>
          ⚠️ Offline — showing cached schools
        </Text>
      ) : null}

      <TextInput
        value={districtCode}
        placeholder="District code (e.g. 2101)"
        style={styles.input}
        onChangeText={setDistrictCode}
      />
      <TextInput
        value={blockCode}
        placeholder="Block code (e.g. 210101)"
        style={styles.input}
        onChangeText={setBlockCode}
      />
      <TextInput
        value={search}
        placeholder="Search school name or UDISE code"
        style={styles.input}
        onChangeText={setSearch}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={schools}
        keyExtractor={(item) => item.udiseCode}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.schoolCard}
            onPress={() => onSchoolSelect(item)}
          >
            <Text style={styles.schoolName}>{item.schoolName}</Text>
            <Text style={styles.optionSub}>UDISE: {item.udiseCode}</Text>
            <Text style={styles.optionSub}>
              {item.blockName} · {item.districtName}
            </Text>
          </TouchableOpacity>
        )}
        onEndReached={() => {
          if (!loading && hasMore) {
            fetchSchools(page + 1, false);
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading ? <Text style={styles.emptyText}>Loading...</Text> : null
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>
              {isOffline
                ? "No cached schools available. Please go online."
                : "No schools found."}
            </Text>
          ) : null
        }
      />

      <View style={styles.rowButtons}>
        <Button title="Back" onPress={onBack} />
      </View>
    </View>
  );
}

function VisitFormScreen({ user, school, onVisitSaved, onBack }) {
  const [questionnaire, setQuestionnaire] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    const loadQuestionnaire = async () => {
      setLoading(true);

      // Check cached questionnaire first
      let cached = null;
      try {
        const cachedRaw = await AsyncStorage.getItem(
          STORAGE_KEYS.questionnaire,
        );
        if (cachedRaw) {
          cached = JSON.parse(cachedRaw);
          if (cached && cached.questions) {
            setQuestionnaire(cached);
          }
        }
      } catch (_) {
        // ignore
      }

      // Try fetching fresh from server
      try {
        const result = await fetchJson(
          `${API_BASE_URL}/api/questionnaires/current`,
        );
        setQuestionnaire(result);
        setError("");
        await AsyncStorage.setItem(
          STORAGE_KEYS.questionnaire,
          JSON.stringify(result),
        );
      } catch (err) {
        if (cached && cached.questions) {
          // Validate cached month
          const nowMonth = getIstDateParts(new Date()).month;
          const nowYear = getIstDateParts(new Date()).year;
          if (cached.month !== nowMonth || cached.year !== nowYear) {
            setQuestionnaire(null);
            setError(
              "Cached questionnaire is from an older month. Please go online to refresh.",
            );
          } else {
            setOfflineMode(true);
          }
        } else {
          setError(
            err.message || "Could not load questionnaire. Please go online.",
          );
        }
      } finally {
        setLoading(false);
      }
    };

    loadQuestionnaire();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setOfflineMode(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const updateAnswer = (questionId, value) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  };

  const validateAnswers = () => {
    if (!questionnaire || !questionnaire.questions)
      return "No questionnaire loaded.";
    for (const q of questionnaire.questions) {
      if (!q.required) continue;
      const val = answers[q.id];
      if (val === undefined || val === null || val === "") {
        return `"${q.text}" is required.`;
      }
    }
    return null;
  };

  const submitVisit = async () => {
    if (!questionnaire) {
      Alert.alert("Error", "Questionnaire not loaded.");
      return;
    }

    const validationError = validateAnswers();
    if (validationError) {
      Alert.alert("Missing answer", validationError);
      return;
    }

    setSubmitting(true);
    try {
      const visitPayload = {
        clientId: generateUUID(),
        userId: user.userId,
        udiseCode: school.udiseCode,
        visitedAt: new Date().toISOString(),
        answers: Object.entries(answers).map(([questionId, value]) => ({
          questionId,
          value,
        })),
      };

      // 1. Save to local storage FIRST (Pending)
      const queue = await readQueue();
      queue.push({
        ...visitPayload,
        status: "Pending",
        schoolName: school.schoolName,
        createdAt: new Date().toISOString(),
        failureReason: "",
      });
      await writeQueue(queue);

      // 2. Check network connectivity
      const netState = await NetInfo.fetch();
      let wasSynced = false;

      if (netState.isConnected) {
        // Try immediate sync to MongoDB Atlas
        await syncQueuedVisits();
        const finalQueue = await readQueue();
        const thisItem = finalQueue.find(
          (i) => i.clientId === visitPayload.clientId,
        );
        if (thisItem && thisItem.status === "Synced") {
          wasSynced = true;
        }
      }

      if (wasSynced) {
        Alert.alert(
          "Visit Submitted ✓",
          "You are online. Your visit has been saved directly to MongoDB Atlas database.",
        );
      } else {
        Alert.alert(
          "Saved Offline 📁",
          "You are currently offline. Your visit is saved safely on your device (not in MongoDB database yet).\n\nWhen you reconnect to the internet, it will automatically sync to the database.",
        );
      }
      onVisitSaved();
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to save visit.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.screen,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Text>Loading questionnaire...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Visit Form</Text>
      <Text style={styles.label}>School: {school.schoolName}</Text>
      <Text style={styles.label}>User: {user.name}</Text>

      {offlineMode ? (
        <Text style={styles.warningText}>
          ⚠️ Offline — using cached questionnaire
        </Text>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <ScrollView style={{ width: "100%" }}>
        {questionnaire?.questions?.map((question) => {
          const selected = answers[question.id];
          return (
            <View key={question.id} style={styles.questionCard}>
              <Text style={styles.questionText}>
                {question.text}
                {question.required ? (
                  <Text style={{ color: "#dc2626" }}> *</Text>
                ) : null}
              </Text>

              {question.type === "yesNo" ? (
                <View style={styles.rowButtons}>
                  {["Yes", "No"].map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.choiceBtn,
                        selected === option && styles.choiceBtnSelected,
                      ]}
                      onPress={() => updateAnswer(question.id, option)}
                    >
                      <Text
                        style={[
                          styles.choiceBtnText,
                          selected === option && styles.choiceBtnTextSelected,
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {question.type === "number" ? (
                <TextInput
                  keyboardType="numeric"
                  placeholder={question.placeholder || "Enter number"}
                  style={styles.input}
                  value={answers[question.id]?.toString() || ""}
                  onChangeText={(text) => {
                    const n = text === "" ? "" : Number(text);
                    updateAnswer(question.id, n);
                  }}
                />
              ) : null}

              {question.type === "singleChoice" ? (
                <View>
                  {question.options?.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.choiceBtn,
                        selected === option && styles.choiceBtnSelected,
                        { marginBottom: 8 },
                      ]}
                      onPress={() => updateAnswer(question.id, option)}
                    >
                      <Text
                        style={[
                          styles.choiceBtnText,
                          selected === option && styles.choiceBtnTextSelected,
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {question.type === "text" ? (
                <TextInput
                  placeholder={question.placeholder || "Type here"}
                  style={styles.input}
                  value={answers[question.id] || ""}
                  onChangeText={(text) => updateAnswer(question.id, text)}
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.rowButtons}>
        <Button title="Back" onPress={onBack} disabled={submitting} />
        <Button
          title={submitting ? "Saving..." : "Submit Visit"}
          onPress={submitVisit}
          disabled={submitting || !questionnaire}
        />
      </View>
    </View>
  );
}

function MyVisitsScreen({ user, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadVisits();
  }, [user]);

  const loadVisits = async () => {
    setLoading(true);
    try {
      // First try to auto-sync any pending items if online
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        await syncQueuedVisits();
      }

      // Load server visits + local queue, then deduplicate by clientId
      const [serverData, queue] = await Promise.allSettled([
        fetchJson(
          `${API_BASE_URL}/api/visits?userId=${user.userId}&page=1&limit=50`,
        ),
        readQueue(),
      ]);

      const serverItems =
        serverData.status === "fulfilled"
          ? (serverData.value.items || []).map((item) => ({
              ...item,
              source: "server",
              status: item.status || "Synced",
            }))
          : [];

      const localQueue =
        queue.status === "fulfilled"
          ? queue.value
              .filter((item) => item.userId === user.userId)
              .map((item) => ({ ...item, source: "local" }))
          : [];

      // Build a map: clientId → item, preferring server data
      const byClientId = new Map();

      // Add local items first
      for (const item of localQueue) {
        byClientId.set(item.clientId, item);
      }

      // Overwrite with server data (server is authoritative in MongoDB)
      for (const item of serverItems) {
        byClientId.set(item.clientId, item);
      }

      // Sort newest first
      const merged = Array.from(byClientId.values()).sort((a, b) => {
        const ta = new Date(a.visitedAt || a.createdAt).getTime();
        const tb = new Date(b.visitedAt || b.createdAt).getTime();
        return tb - ta;
      });

      setItems(merged);
    } catch (err) {
      console.warn("MyVisits error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        Alert.alert(
          "Device Offline",
          "You are currently offline. Please connect to WiFi or mobile internet to save pending visits to MongoDB Atlas.",
        );
        return;
      }

      const res = await syncQueuedVisits();
      if (res.syncedCount > 0) {
        Alert.alert(
          "Sync Complete ✓",
          `${res.syncedCount} offline visit(s) have been successfully saved to MongoDB Atlas database!`,
        );
      } else if (res.pendingCount > 0) {
        Alert.alert(
          "Sync Incomplete",
          `Could not reach backend server. ${res.pendingCount} visit(s) remain saved on phone.`,
        );
      } else {
        Alert.alert(
          "All Synced ✓",
          "All your visits are already up to date in the MongoDB Atlas database.",
        );
      }

      await loadVisits();
    } catch (err) {
      Alert.alert("Sync Error", err.message || "Failed to sync");
    } finally {
      setSyncing(false);
    }
  };

  const statusColor = (status) => {
    if (status === "Synced") return "#16a34a"; // Green
    if (status === "Failed") return "#dc2626"; // Red
    return "#d97706"; // Amber (Pending / Offline)
  };

  const statusLabel = (status) => {
    if (status === "Synced") return "🟢 Synced (MongoDB)";
    if (status === "Failed") return "🔴 Failed";
    return "🟠 Saved on Phone (Offline)";
  };

  const pendingCount = items.filter((i) => i.status === "Pending").length;
  const syncedCount = items.filter((i) => i.status === "Synced").length;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>My Visits</Text>

      {/* Sync summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryNumber}>{syncedCount}</Text>
          <Text style={styles.summaryLabel}>In Database</Text>
        </View>
        <View style={styles.summaryCol}>
          <Text style={[styles.summaryNumber, { color: "#d97706" }]}>
            {pendingCount}
          </Text>
          <Text style={styles.summaryLabel}>Saved on Phone</Text>
        </View>
        {pendingCount > 0 ? (
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={handleManualSync}
            disabled={syncing}
          >
            <Text style={styles.syncBtnText}>
              {syncing ? "Syncing..." : "🔄 Sync Now"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? <Text style={styles.emptyText}>Loading visits...</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item, index) =>
          `${item.clientId || item._id || "local"}-${index}`
        }
        renderItem={({ item }) => (
          <View style={styles.visitCard}>
            <Text style={styles.schoolName}>
              {item.schoolName || item.udiseCode}
            </Text>
            <Text style={styles.optionSub}>
              {new Date(item.visitedAt || item.createdAt).toLocaleString(
                "en-IN",
                {
                  timeZone: "Asia/Kolkata",
                },
              )}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusColor(item.status || "Pending") },
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {statusLabel(item.status || "Pending")}
                </Text>
              </View>
            </View>
            {item.failureReason ? (
              <Text
                style={[styles.optionSub, { color: "#dc2626", marginTop: 4 }]}
              >
                ✕ {item.failureReason}
              </Text>
            ) : null}
            <Text style={[styles.optionSub, { fontSize: 11, marginTop: 4 }]}>
              ID: {item.clientId}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No visits recorded yet.</Text>
          ) : null
        }
      />

      <View style={styles.rowButtons}>
        <Button
          title={syncing ? "Syncing..." : "🔄 Sync & Refresh"}
          onPress={handleManualSync}
        />
        <Button title="Back" onPress={onBack} />
      </View>
    </View>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("choose-user");
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // On mount: restore user session + subscribe to connectivity changes
  useEffect(() => {
    const init = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.selectedUser);
        if (raw) {
          setSelectedUser(JSON.parse(raw));
          setScreen("select-school");
        }
      } catch (_) {
        // ignore
      } finally {
        setAppReady(true);
      }

      // Check network status on startup
      const netState = await NetInfo.fetch();
      const online = Boolean(netState.isConnected);
      setIsOnline(online);

      if (online) {
        // Auto-sync any visits submitted in past offline sessions
        await syncQueuedVisits();
        // Pre-cache questionnaire and schools so offline mode works smoothly
        precacheData();
      }
    };

    init();

    // Auto-sync whenever internet connectivity is restored
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected);
      setIsOnline(online);
      if (online) {
        syncQueuedVisits();
        precacheData();
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSelectUser = async (user) => {
    setSelectedUser(user);
    setScreen("select-school");
    await AsyncStorage.setItem(STORAGE_KEYS.selectedUser, JSON.stringify(user));
  };

  const handleSchoolSelect = (school) => {
    setSelectedSchool(school);
    setScreen("visit-form");
  };

  const handleBackToUser = () => setScreen("choose-user");
  const handleBackToSchool = () => setScreen("select-school");
  const handleVisitSaved = () => setScreen("my-visits");

  if (!appReady) {
    return (
      <View style={styles.loading}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Offline banner — visible whenever user is offline */}
      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            📶 Offline Mode: Data will be stored on phone and saved to MongoDB
            when online
          </Text>
        </View>
      ) : null}

      {screen === "choose-user" ? (
        <ChooseUserScreen onSelectUser={handleSelectUser} />
      ) : null}

      {screen === "select-school" && selectedUser ? (
        <SelectSchoolScreen
          user={selectedUser}
          onSchoolSelect={handleSchoolSelect}
          onBack={handleBackToUser}
        />
      ) : null}

      {screen === "visit-form" && selectedUser && selectedSchool ? (
        <VisitFormScreen
          user={selectedUser}
          school={selectedSchool}
          onVisitSaved={handleVisitSaved}
          onBack={handleBackToSchool}
        />
      ) : null}

      {screen === "my-visits" && selectedUser ? (
        <MyVisitsScreen user={selectedUser} onBack={handleBackToUser} />
      ) : null}

      {selectedUser ? (
        <View style={styles.footerBar}>
          <TouchableOpacity onPress={() => setScreen("select-school")}>
            <Text style={styles.footerText}>🏫 Schools</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen("my-visits")}>
            <Text style={styles.footerText}>📁 Visits</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await AsyncStorage.removeItem(STORAGE_KEYS.selectedUser);
              setSelectedUser(null);
              setScreen("choose-user");
            }}
          >
            <Text style={styles.footerText}>👤 Logout</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  screen: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f7fb",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 16,
    color: "#111827",
  },
  optionCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  optionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  optionSub: {
    color: "#6b7280",
    marginTop: 4,
    fontSize: 13,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 15,
  },
  label: {
    fontSize: 15,
    marginBottom: 8,
    color: "#374151",
  },
  schoolCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  schoolName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  questionCard: {
    marginBottom: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    elevation: 1,
  },
  questionText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#111827",
  },
  choiceBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    marginHorizontal: 4,
  },
  choiceBtnSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  choiceBtnText: {
    color: "#374151",
    fontWeight: "500",
  },
  choiceBtnTextSelected: {
    color: "#2563eb",
    fontWeight: "700",
  },
  rowButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  errorText: {
    color: "#b91c1c",
    marginBottom: 8,
    fontSize: 13,
  },
  warningText: {
    color: "#92400e",
    backgroundColor: "#fef3c7",
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
    fontSize: 13,
  },
  visitCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  footerBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    backgroundColor: "#111827",
  },
  footerText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 20,
    color: "#9ca3af",
    fontSize: 14,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  offlineBanner: {
    backgroundColor: "#d97706",
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  offlineBannerText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  summaryCol: {
    alignItems: "center",
    paddingHorizontal: 8,
  },
  summaryNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#16a34a",
  },
  summaryLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
    fontWeight: "500",
  },
  syncBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  syncBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
