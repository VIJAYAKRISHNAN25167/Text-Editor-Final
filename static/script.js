/**
 * =============================================================================
 * Smart Diary - Client-side Controller & Stack Management
 * =============================================================================
 * This script coordinates:
 * 1. Stack Data Structure (LIFO) for instantaneous, reliable client Undo / Redo.
 * 2. Asynchronous synchronization with the Python Flask Serverless Backend.
 * 3. Browser File APIs for Save (smart_diary.txt) and Open (.txt).
 * 4. Interactive To-Do List (Add, Select, Toggle Complete, Delete).
 * 5. Full text Find with backdrop mirror highlighting.
 * 6. Light / Dark theme persistence and dynamic font size scaling (8px - 30px).
 * 7. Live real-time statistics (Words, Characters, Lines, Stacks, Tasks).
 * 8. Live ticking Clock (Day, Date, Month, Year, Time).
 * =============================================================================
 */

"use strict";

/* =============================================================================
   DATA STRUCTURE: STACK (LIFO - Last In, First Out)
   =============================================================================
   Mirrors the Python Stack class for responsive client-side operations.
   ============================================================================= */
class Stack {
  constructor(maxSize = 300) {
    this.items = [];
    this.maxSize = maxSize;
  }

  /** Pushes an element onto the top of the stack (O(1)). */
  push(item) {
    if (this.items.length >= this.maxSize) {
      this.items.shift(); // Evict the oldest item to bound memory
    }
    this.items.push(item);
  }

  /** Removes and returns the top element of the stack (O(1)). */
  pop() {
    return this.items.length > 0 ? this.items.pop() : null;
  }

  /** Peeks at the top element without removing it (O(1)). */
  peek() {
    return this.items.length > 0 ? this.items[this.items.length - 1] : null;
  }

  /** Checks if the stack is empty (O(1)). */
  empty() {
    return this.items.length === 0;
  }

  /** Clears all elements from the stack (O(1)). */
  clear() {
    this.items = [];
  }

  /** Returns current number of items in the stack (O(1)). */
  size() {
    return this.items.length;
  }
}

// Client Stack Instances for Undo / Redo
const undoStack = new Stack();
const redoStack = new Stack();

/* -----------------------------------------------------------------------------
   Storage Keys and Configuration Constants
   ----------------------------------------------------------------------------- */
const STORAGE_KEYS = {
  DIARY: "smart_diary_content_v2",
  TASKS: "smart_diary_tasks_v2",
  THEME: "smart_diary_theme_v2",
  FONT_SIZE: "smart_diary_font_size_v2"
};

const FONT_LIMITS = {
  MIN: 8,
  MAX: 30,
  STEP: 2,
  DEFAULT: 18
};

const TYPING_DEBOUNCE_MS = 650;
const SERVER_SYNC_DEBOUNCE_MS = 1200;

/* -----------------------------------------------------------------------------
   DOM Element Selectors
   ----------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

const diaryEditor = $("diaryEditor");
const editorBackdrop = $("editorBackdrop");
const syncBadge = $("syncBadge");

// Toolbar Buttons
const newBtn = $("newBtn");
const openBtn = $("openBtn");
const openFileInput = $("openFileInput");
const saveBtn = $("saveBtn");
const undoBtn = $("undoBtn");
const redoBtn = $("redoBtn");
const findBtn = $("findBtn");
const themeBtn = $("themeBtn");
const themeIcon = $("themeIcon");
const clearBtn = $("clearBtn");
const fontDownBtn = $("fontDown");
const fontUpBtn = $("fontUp");
const fontLabel = $("fontLabel");

// Find UI
const findBar = $("findBar");
const findInput = $("findInput");
const findCount = $("findCount");
const findPrev = $("findPrev");
const findNext = $("findNext");
const findClose = $("findClose");

// Tasks UI
const taskForm = $("taskForm");
const taskInput = $("taskInput");
const taskList = $("taskList");
const taskEmptyMsg = $("taskEmptyMsg");
const completeTaskBtn = $("completeTaskBtn");
const deleteTaskBtn = $("deleteTaskBtn");

// Stats UI
const statWords = $("statWords");
const statChars = $("statChars");
const statLines = $("statLines");
const statUndo = $("statUndo");
const statRedo = $("statRedo");
const statTasks = $("statTasks");

// Clock UI
const clockDate = $("clockDate");
const clockTime = $("clockTime");

// Toast
const toastMessage = $("toastMessage");

/* -----------------------------------------------------------------------------
   Application State
   ----------------------------------------------------------------------------- */
let tasks = [];
let selectedTaskId = null;
let currentFontSize = FONT_LIMITS.DEFAULT;
let committedText = "";
let groupBurstStart = null;
let typingTimer = null;
let serverSyncTimer = null;

// Search state
const searchState = {
  isOpen: false,
  query: "",
  matches: [],
  currentIndex: -1
};

/* =============================================================================
   TOAST NOTIFICATION HELPER
   ============================================================================= */
let toastTimeout = null;
function showToast(msg) {
  toastMessage.textContent = msg;
  toastMessage.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastMessage.classList.remove("visible");
  }, 2400);
}

/* =============================================================================
   SAFE LOCALSTORAGE HELPERS
   ============================================================================= */
const localStore = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }
};

/* =============================================================================
   1. LIVE CLOCK (Day, Date, Month, Year, Time)
   ============================================================================= */
function updateClock() {
  const now = new Date();

  // Full formatted date (e.g., "Thursday, October 8, 2026")
  const dateOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  };
  clockDate.textContent = now.toLocaleDateString(undefined, dateOptions);

  // Time formatted with seconds (e.g., "02:45:12 PM")
  clockTime.textContent = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/* =============================================================================
   2. STATISTICS & BUTTON STATES
   ============================================================================= */
function updateStatistics() {
  const text = diaryEditor.value;

  // Words calculation (tokens separated by whitespace)
  const wordMatches = text.trim().match(/\S+/g);
  statWords.textContent = wordMatches ? wordMatches.length : 0;

  // Characters calculation
  statChars.textContent = text.length;

  // Lines calculation
  statLines.textContent = text.length > 0 ? text.split("\n").length : 0;

  // Stack counts
  statUndo.textContent = undoStack.size();
  statRedo.textContent = redoStack.size();

  // Tasks count
  const doneCount = tasks.filter((t) => t.done).length;
  statTasks.textContent = tasks.length > 0 ? `${tasks.length} (${doneCount} done)` : "0";
}

function updateUndoRedoButtons() {
  const hasPendingBurst = groupBurstStart !== null && groupBurstStart !== diaryEditor.value;
  undoBtn.disabled = undoStack.empty() && !hasPendingBurst;
  redoBtn.disabled = redoStack.empty();
  statUndo.textContent = undoStack.size();
  statRedo.textContent = redoStack.size();
}

/* =============================================================================
   3. STACK-BASED UNDO / REDO & DIARY EDITING
   ============================================================================= */

/**
 * Commits the current typing burst to the Undo Stack as a single snapshot.
 */
function commitTypingBurst() {
  clearTimeout(typingTimer);
  typingTimer = null;

  if (groupBurstStart !== null && groupBurstStart !== diaryEditor.value) {
    undoStack.push(groupBurstStart);
  }
  groupBurstStart = null;
  committedText = diaryEditor.value;
  updateUndoRedoButtons();
}

/**
 * Directly updates editor value and syncs UI.
 */
function setDiaryText(newText, pushToHistory = false) {
  clearTimeout(typingTimer);
  typingTimer = null;

  if (pushToHistory && diaryEditor.value !== newText) {
    commitTypingBurst();
    undoStack.push(diaryEditor.value);
    redoStack.clear();
  }

  groupBurstStart = null;
  diaryEditor.value = newText;
  committedText = newText;

  localStore.set(STORAGE_KEYS.DIARY, newText);
  renderFindHighlights();
  updateStatistics();
  updateUndoRedoButtons();
  syncDiaryWithBackendDebounced(newText);
}

/**
 * Executes Undo operation:
 * Current content -> Redo Stack
 * Top of Undo Stack -> Current Content
 */
function performUndo() {
  commitTypingBurst();

  if (undoStack.empty()) {
    showToast("Undo stack is empty");
    return;
  }

  // Push current content onto redo stack
  redoStack.push(diaryEditor.value);

  // Pop previous state from undo stack
  const restoredText = undoStack.pop();
  diaryEditor.value = restoredText;
  committedText = restoredText;

  localStore.set(STORAGE_KEYS.DIARY, restoredText);
  renderFindHighlights();
  updateStatistics();
  updateUndoRedoButtons();
  showToast("Undo executed (Stack)");

  // Sync with Python API
  fetch("/api/diary/undo", { method: "POST" }).catch(() => {});
}

/**
 * Executes Redo operation:
 * Current content -> Undo Stack
 * Top of Redo Stack -> Current Content
 */
function performRedo() {
  commitTypingBurst();

  if (redoStack.empty()) {
    showToast("Redo stack is empty");
    return;
  }

  // Push current content onto undo stack
  undoStack.push(diaryEditor.value);

  // Pop next state from redo stack
  const restoredText = redoStack.pop();
  diaryEditor.value = restoredText;
  committedText = restoredText;

  localStore.set(STORAGE_KEYS.DIARY, restoredText);
  renderFindHighlights();
  updateStatistics();
  updateUndoRedoButtons();
  showToast("Redo executed (Stack)");

  // Sync with Python API
  fetch("/api/diary/redo", { method: "POST" }).catch(() => {});
}

// User typing event
diaryEditor.addEventListener("input", () => {
  // Any new edit invalidates the Redo stack
  redoStack.clear();

  if (groupBurstStart === null) {
    groupBurstStart = committedText;
  }

  clearTimeout(typingTimer);
  typingTimer = setTimeout(commitTypingBurst, TYPING_DEBOUNCE_MS);

  // Persist locally immediately
  localStore.set(STORAGE_KEYS.DIARY, diaryEditor.value);

  renderFindHighlights();
  updateStatistics();
  updateUndoRedoButtons();

  // Debounce API sync to server
  syncDiaryWithBackendDebounced(diaryEditor.value);
});

// Sync backdrop scroll position with textarea
diaryEditor.addEventListener("scroll", () => {
  editorBackdrop.scrollTop = diaryEditor.scrollTop;
});

// Intercept browser native undo / redo shortcuts so our Stack manages history
diaryEditor.addEventListener("beforeinput", (e) => {
  if (e.inputType === "historyUndo") {
    e.preventDefault();
    performUndo();
  } else if (e.inputType === "historyRedo") {
    e.preventDefault();
    performRedo();
  }
});

diaryEditor.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      performUndo();
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      performRedo();
    } else if (key === "s") {
      e.preventDefault();
      saveDiaryToFile();
    } else if (key === "f") {
      e.preventDefault();
      toggleFindBar();
    }
  }
});

undoBtn.addEventListener("click", performUndo);
redoBtn.addEventListener("click", performRedo);

/* -----------------------------------------------------------------------------
   Backend Sync Helper (Debounced)
   ----------------------------------------------------------------------------- */
function syncDiaryWithBackendDebounced(content) {
  clearTimeout(serverSyncTimer);
  syncBadge.textContent = "Saving...";
  syncBadge.className = "badge saving";

  serverSyncTimer = setTimeout(async () => {
    try {
      const response = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      if (response.ok) {
        syncBadge.textContent = "✓ Synced";
        syncBadge.className = "badge synced";
      } else {
        syncBadge.textContent = "Offline (Saved locally)";
        syncBadge.className = "badge synced";
      }
    } catch (e) {
      // Serverless or network blip - localStorage still preserves state!
      syncBadge.textContent = "Saved locally";
      syncBadge.className = "badge synced";
    }
  }, SERVER_SYNC_DEBOUNCE_MS);
}

/* =============================================================================
   4. FILE OPERATIONS (New, Open, Save, Clear)
   ============================================================================= */

/** ＋ New Page */
function handleNewDiary() {
  if (diaryEditor.value.trim().length > 0 || tasks.length > 0) {
    const confirmNew = window.confirm("Start a new diary? This will clear the current diary and to-do list.");
    if (!confirmNew) return;
  }

  undoStack.clear();
  redoStack.clear();
  tasks = [];
  selectedTaskId = null;

  localStore.set(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  renderTaskList();
  setDiaryText("");
  showToast("New diary page started");
}

/** 💾 Save to smart_diary.txt */
function saveDiaryToFile() {
  const content = diaryEditor.value;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);

  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = "smart_diary.txt";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast("Saved as smart_diary.txt");
}

/** 📂 Open local .txt file */
function handleOpenClick() {
  openFileInput.click();
}

openFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast("File is too large (maximum 5MB)");
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const loadedText = String(event.target.result).replace(/\r\n/g, "\n");
    setDiaryText(loadedText, true);
    showToast(`Loaded ${file.name}`);
  };
  reader.onerror = () => {
    showToast("Error reading file");
  };
  reader.readAsText(file);
  e.target.value = ""; // Reset input so same file can be opened again
});

/** 🧹 Clear Diary */
function handleClearDiary() {
  if (!diaryEditor.value) {
    showToast("Diary is already empty");
    return;
  }
  setDiaryText("", true);
  showToast("Diary cleared (Press Undo to restore)");
}

newBtn.addEventListener("click", handleNewDiary);
saveBtn.addEventListener("click", saveDiaryToFile);
openBtn.addEventListener("click", handleOpenClick);
clearBtn.addEventListener("click", handleClearDiary);

/* =============================================================================
   5. FIND & HIGHLIGHT (Backdrop Mirror Layer)
   ============================================================================= */
function escapeHTML(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeSearchMatches() {
  searchState.matches = [];
  const text = diaryEditor.value;

  if (searchState.isOpen && searchState.query) {
    const regex = new RegExp(escapeRegExp(searchState.query), "gi");
    let match;
    while ((match = regex.exec(text)) !== null && searchState.matches.length < 5000) {
      searchState.matches.push({
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }

  if (searchState.matches.length === 0) {
    searchState.currentIndex = -1;
  } else if (searchState.currentIndex < 0 || searchState.currentIndex >= searchState.matches.length) {
    searchState.currentIndex = 0;
  }
}

function renderFindHighlights() {
  const text = diaryEditor.value;
  computeSearchMatches();

  if (!searchState.isOpen || !searchState.query || searchState.matches.length === 0) {
    editorBackdrop.innerHTML = "";
    updateFindCountUI();
    return;
  }

  let html = "";
  let lastIndex = 0;

  searchState.matches.forEach((m, idx) => {
    html += escapeHTML(text.slice(lastIndex, m.start));
    const isCurrent = idx === searchState.currentIndex;
    html += `<mark class="${isCurrent ? "current-match" : ""}">${escapeHTML(text.slice(m.start, m.end))}</mark>`;
    lastIndex = m.end;
  });

  html += escapeHTML(text.slice(lastIndex));
  // Trailing newline ensures mirror scroll height matches textarea exactly
  editorBackdrop.innerHTML = html + "\n";
  editorBackdrop.scrollTop = diaryEditor.scrollTop;

  updateFindCountUI();
}

function updateFindCountUI() {
  if (!searchState.isOpen || !searchState.query) {
    findCount.textContent = "";
  } else if (searchState.matches.length === 0) {
    findCount.textContent = "0 matches";
  } else {
    findCount.textContent = `${searchState.currentIndex + 1} of ${searchState.matches.length}`;
  }
}

function scrollMatchIntoView() {
  const activeMark = editorBackdrop.querySelector("mark.current-match");
  if (!activeMark) return;

  const targetScrollTop = Math.max(0, activeMark.offsetTop - diaryEditor.clientHeight / 2);
  diaryEditor.scrollTop = targetScrollTop;
  editorBackdrop.scrollTop = targetScrollTop;
}

function stepSearch(delta) {
  if (searchState.matches.length === 0) return;
  searchState.currentIndex = (searchState.currentIndex + delta + searchState.matches.length) % searchState.matches.length;
  renderFindHighlights();
  scrollMatchIntoView();
}

function toggleFindBar() {
  if (searchState.isOpen) {
    closeFindBar();
  } else {
    openFindBar();
  }
}

function openFindBar() {
  searchState.isOpen = true;
  findBar.hidden = false;
  findBtn.setAttribute("aria-pressed", "true");

  // If text is selected in editor, prefill findInput
  const selStart = diaryEditor.selectionStart;
  const selEnd = diaryEditor.selectionEnd;
  const selectedText = diaryEditor.value.slice(selStart, selEnd).trim();
  if (selectedText && !selectedText.includes("\n")) {
    findInput.value = selectedText;
  }

  searchState.query = findInput.value;
  renderFindHighlights();
  findInput.focus();
  findInput.select();
  scrollMatchIntoView();
}

function closeFindBar() {
  searchState.isOpen = false;
  searchState.query = "";
  searchState.matches = [];
  searchState.currentIndex = -1;
  findBar.hidden = true;
  findBtn.setAttribute("aria-pressed", "false");
  renderFindHighlights();
  diaryEditor.focus();
}

findBtn.addEventListener("click", toggleFindBar);
findClose.addEventListener("click", closeFindBar);
findNext.addEventListener("click", () => stepSearch(1));
findPrev.addEventListener("click", () => stepSearch(-1));

findInput.addEventListener("input", (e) => {
  searchState.query = e.target.value;
  searchState.currentIndex = 0;
  renderFindHighlights();
  scrollMatchIntoView();
});

findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    stepSearch(e.shiftKey ? -1 : 1);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeFindBar();
  }
});

/* =============================================================================
   6. THEME & FONT SIZE CONTROLS
   ============================================================================= */
function applyTheme(theme) {
  const chosen = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", chosen);
  themeIcon.textContent = chosen === "dark" ? "☀️" : "🌙";
  localStore.set(STORAGE_KEYS.THEME, chosen);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

function applyFontSize(size) {
  const boundedSize = Math.max(FONT_LIMITS.MIN, Math.min(FONT_LIMITS.MAX, size));
  currentFontSize = boundedSize;
  document.documentElement.style.setProperty("--fs", `${boundedSize}px`);
  fontLabel.textContent = `${boundedSize}px`;

  fontDownBtn.disabled = currentFontSize <= FONT_LIMITS.MIN;
  fontUpBtn.disabled = currentFontSize >= FONT_LIMITS.MAX;

  localStore.set(STORAGE_KEYS.FONT_SIZE, String(boundedSize));
  editorBackdrop.scrollTop = diaryEditor.scrollTop;
}

themeBtn.addEventListener("click", toggleTheme);
fontDownBtn.addEventListener("click", () => applyFontSize(currentFontSize - FONT_LIMITS.STEP));
fontUpBtn.addEventListener("click", () => applyFontSize(currentFontSize + FONT_LIMITS.STEP));

/* =============================================================================
   7. TO-DO LIST (Add, Select, Toggle Complete, Delete)
   ============================================================================= */
function persistTasksLocally() {
  localStore.set(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
}

function updateTaskActionButtons() {
  const hasSelected = selectedTaskId !== null && tasks.some((t) => t.id === selectedTaskId);
  completeTaskBtn.disabled = !hasSelected;
  deleteTaskBtn.disabled = !hasSelected;
}

function renderTaskList() {
  taskList.innerHTML = "";

  tasks.forEach((t) => {
    const li = document.createElement("li");
    const isSelected = t.id === selectedTaskId;
    li.className = `task-item ${t.done ? "done" : ""} ${isSelected ? "selected" : ""}`;
    li.dataset.id = String(t.id);
    li.tabIndex = 0;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(isSelected));

    const checkIcon = document.createElement("span");
    checkIcon.className = "task-checkbox-icon";
    checkIcon.textContent = t.done ? "☑" : "☐";
    checkIcon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "task-text";
    label.textContent = t.text; // Text content prevents any HTML injection

    li.appendChild(checkIcon);
    li.appendChild(label);

    li.addEventListener("click", () => selectTask(t.id));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectTask(t.id);
      }
    });

    taskList.appendChild(li);
  });

  taskEmptyMsg.hidden = tasks.length > 0;
  updateTaskActionButtons();
  updateStatistics();
}

function selectTask(id) {
  // Toggle selection: click again to deselect
  selectedTaskId = selectedTaskId === id ? null : id;
  renderTaskList();
}

async function handleAddTask(e) {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    showToast("Please enter a task description");
    taskInput.focus();
    return;
  }

  const nextId = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const newTask = {
    id: nextId,
    text,
    done: false,
    created_at: new Date().toISOString()
  };

  tasks.push(newTask);
  persistTasksLocally();
  renderTaskList();
  taskInput.value = "";
  taskInput.focus();
  showToast("Task added");

  // Sync to Python API asynchronously
  try {
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
  } catch (err) {
    // Graceful offline fallback
  }
}

async function handleToggleCompleteTask() {
  const task = tasks.find((t) => t.id === selectedTaskId);
  if (!task) return;

  task.done = !task.done;
  persistTasksLocally();
  renderTaskList();
  showToast(task.done ? "Task marked complete" : "Task marked incomplete");

  // Sync to Python API
  try {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: task.done })
    });
  } catch (err) {
    // Graceful offline fallback
  }
}

async function handleDeleteTask() {
  if (selectedTaskId === null) return;
  const deletedId = selectedTaskId;

  tasks = tasks.filter((t) => t.id !== deletedId);
  selectedTaskId = null;
  persistTasksLocally();
  renderTaskList();
  showToast("Task deleted");

  // Sync to Python API
  try {
    await fetch(`/api/tasks/${deletedId}`, { method: "DELETE" });
  } catch (err) {
    // Graceful offline fallback
  }
}

taskForm.addEventListener("submit", handleAddTask);
completeTaskBtn.addEventListener("click", handleToggleCompleteTask);
deleteTaskBtn.addEventListener("click", handleDeleteTask);

/* =============================================================================
   8. INITIALIZATION & RECOVERY
   ============================================================================= */
async function initializeApp() {
  // 1. Clock init
  updateClock();
  setInterval(updateClock, 1000);

  // 2. Theme & Font Size
  const savedTheme = localStore.get(STORAGE_KEYS.THEME) || "light";
  applyTheme(savedTheme);

  const savedFontSize = parseInt(localStore.get(STORAGE_KEYS.FONT_SIZE), 10);
  applyFontSize(Number.isFinite(savedFontSize) ? savedFontSize : FONT_LIMITS.DEFAULT);

  // 3. Retrieve Diary content
  let diaryText = localStore.get(STORAGE_KEYS.DIARY);
  let storedTasksRaw = localStore.get(STORAGE_KEYS.TASKS);
  let loadedTasks = null;

  if (storedTasksRaw) {
    try {
      const parsed = JSON.parse(storedTasksRaw);
      if (Array.isArray(parsed)) {
        loadedTasks = parsed;
      }
    } catch (e) {
      loadedTasks = null;
    }
  }

  // 4. If nothing in localStorage (e.g. first visit), fetch from Python API / CSV
  if (diaryText === null || loadedTasks === null) {
    try {
      const [diaryRes, tasksRes] = await Promise.all([
        fetch("/api/diary"),
        fetch("/api/tasks")
      ]);

      if (diaryRes.ok && diaryText === null) {
        const diaryData = await diaryRes.json();
        if (diaryData.success && typeof diaryData.content === "string") {
          diaryText = diaryData.content;
          localStore.set(STORAGE_KEYS.DIARY, diaryText);
        }
      }

      if (tasksRes.ok && loadedTasks === null) {
        const tasksData = await tasksRes.json();
        if (tasksData.success && Array.isArray(tasksData.tasks)) {
          loadedTasks = tasksData.tasks;
          localStore.set(STORAGE_KEYS.TASKS, JSON.stringify(loadedTasks));
        }
      }
    } catch (err) {
      console.warn("Backend API initial fetch skipped, using defaults:", err);
    }
  }

  // Fallbacks if backend is not reachable on first visit
  if (diaryText === null) {
    diaryText =
      "Today I started using Smart Diary.\n" +
      "Everything I write is saved in this browser, so it will still be here after a refresh.\n\n" +
      "Things I want to try:\n" +
      "- Undo and Redo (they are built on two stacks)\n" +
      "- The dark theme and the font size buttons\n" +
      "- Adding a few tasks on the right";
    localStore.set(STORAGE_KEYS.DIARY, diaryText);
  }

  if (loadedTasks === null) {
    loadedTasks = [
      { id: 1, text: "Write today's diary entry", done: false },
      { id: 2, text: "Try the Undo and Redo buttons", done: false },
      { id: 3, text: "Switch to the dark theme", done: true }
    ];
    localStore.set(STORAGE_KEYS.TASKS, JSON.stringify(loadedTasks));
  }

  tasks = loadedTasks;
  diaryEditor.value = diaryText;
  committedText = diaryText;

  renderTaskList();
  renderFindHighlights();
  updateStatistics();
  updateUndoRedoButtons();
}

// Start Application
initializeApp();
