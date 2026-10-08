# 📔 Smart Diary (Python & Vercel Web Edition)

A modern, responsive, full-featured web diary application built from scratch with a **Python (Flask) Serverless Backend** and an **interactive HTML/CSS/JavaScript Frontend**.

Originally inspired by desktop diary tools, this project has been completely rebuilt as a web application specifically architected for **Vercel Serverless Functions**. It is designed as an academic **Data Structures** project demonstrating a custom **Stack** implementation for undo/redo history management.

---

## 🌟 Key Features

- **Dear Diary Text Editor:** Ruled notebook-style paper aesthetics with red margin rule, smooth typing, and responsive layout.
- **Stack-Based Undo & Redo (Data Structures):** Custom Stack class implemented in Python and mirrored in JavaScript.
- **Interactive To-Do List:** Add tasks, select tasks, toggle completion with strikethrough styling, and delete tasks.
- **Live Clock:** Dynamic day, date, month, year, and 12-hour ticking clock updated every second.
- **Text Statistics:** Real-time counters for Words, Characters, Lines, Undo Stack Size, Redo Stack Size, and Task Counts.
- **Find & Highlight:** Integrated search toolbar with backdrop mirror highlighting and match navigation (Prev/Next).
- **Themes:** Light Theme (warm cream & subtle rose) and Dark Theme (charcoal & muted rose) with automatic `localStorage` preference memory.
- **Dynamic Font Resizing:** Increase or decrease diary typography (8px to 30px) with automatic paper line re-alignment.
- **File Import & Export:**
  - 💾 **Save:** Downloads current diary page directly to the user's computer as `smart_diary.txt`.
  - 📂 **Open:** Reads any local `.txt` file using browser File APIs into the diary editor with instant undo recovery.
  - ＋ **New / 🧹 Clear:** Start fresh or clear with one click (can be undone via Stack).
- **Mobile Responsive:** Two-column desktop layout automatically rearranges so the to-do list moves neatly below the diary editor on mobile devices.

---

## 🏗️ Project Architecture & Directory Layout

```
Smart-Diary/
│
├── api/
│   └── index.py        # Python Flask Serverless entry point & Stack class
│
├── templates/
│   └── index.html      # Jinja2 / HTML5 main user interface
│
├── static/
│   ├── style.css       # Notebook paper styling, themes, and responsive CSS
│   └── script.js       # Client controller, JavaScript Stack class, File APIs
│
├── data/
│   ├── diary.csv       # Academic sample diary entry
│   └── tasks.csv       # Academic sample to-do tasks
│
├── requirements.txt    # Python dependencies for Vercel
├── vercel.json         # Vercel serverless routing & bundling rules
├── .gitignore          # Ignores __pycache__, .env, and build artifacts
└── README.md           # Documentation & deployment guide
```

---

## 🧠 Data Structure Implementation: The Stack (LIFO)

This project satisfies academic **Data Structures** coursework requirements by implementing a custom **Stack** class from first principles.

### 1. Theoretical Concept
A **Stack** is a linear data structure operating under the **LIFO (Last In, First Out)** principle. Elements can only be added to or removed from the "top" of the stack.

### 2. Time & Space Complexity
| Operation | Method | Time Complexity | Space Complexity |
|-----------|--------|-----------------|------------------|
| Push      | `push(item)` | **O(1)** Constant | O(1) |
| Pop       | `pop()`      | **O(1)** Constant | O(1) |
| Peek      | `peek()`     | **O(1)** Constant | O(1) |
| Empty     | `empty()`    | **O(1)** Constant | O(1) |
| Size      | `size()`     | **O(1)** Constant | O(1) |
| Clear     | `clear()`    | **O(1)** Constant | O(1) |

### 3. Application in Smart Diary
The application manages two distinct Stack instances:
1. `undo_stack`: Holds previous snapshots of diary text.
2. `redo_stack`: Holds snapshots that have been undone.

#### State Transitions:
- **When user types or edits:**
  $$\text{previous\_content} \longrightarrow \text{undo\_stack.push()}$$
  $$\text{redo\_stack.clear()}$$
- **When Undo is pressed:**
  $$\text{current\_content} \longrightarrow \text{redo\_stack.push()}$$
  $$\text{current\_content} \longleftarrow \text{undo\_stack.pop()}$$
- **When Redo is pressed:**
  $$\text{current\_content} \longrightarrow \text{undo\_stack.push()}$$
  $$\text{current\_content} \longleftarrow \text{redo\_stack.pop()}$$

The Stack implementation exists in both:
- **`api/index.py`**: The authoritative Python backend implementation with API endpoints.
- **`static/script.js`**: The client-side implementation enabling instant, latency-free typing snapshots and native keybinding interception (`Ctrl+Z`, `Ctrl+Y`).

---

## 🔌 Python RESTful API Reference

All API routes return JSON and include comprehensive error handling.

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| `GET` | `/` | Serves main UI (`index.html`) | None | HTML |
| `GET` | `/api/health` | Health check endpoint | None | `{"success": true, "status": "healthy"}` |
| `GET` | `/api/diary` | Returns current diary content & stack sizes | None | `{"success": true, "content": "...", "undo_count": 0, "redo_count": 0}` |
| `POST` | `/api/diary` | Updates diary content and pushes prior state to undo stack | `{"content": "..."}` | `{"success": true, "undo_count": 1, ...}` |
| `POST` | `/api/diary/undo` | Executes Undo using Python `undo_stack.pop()` | None | `{"success": true, "content": "..."}` |
| `POST` | `/api/diary/redo` | Executes Redo using Python `redo_stack.pop()` | None | `{"success": true, "content": "..."}` |
| `POST` | `/api/diary/clear` | Clears diary and pushes previous state to undo stack | None | `{"success": true, "content": ""}` |
| `GET` | `/api/stack/status` | Inspects current state of both Stacks | None | `{"success": true, "undo_stack": {...}, "redo_stack": {...}}` |
| `GET` | `/api/tasks` | Returns all to-do tasks | None | `{"success": true, "tasks": [...], "count": 3}` |
| `POST` | `/api/tasks` | Creates a new task | `{"text": "Read book"}` | `{"success": true, "task": {...}}` |
| `PUT` | `/api/tasks/<id>` | Updates task completion status or text | `{"done": true}` | `{"success": true, "task": {...}}` |
| `DELETE`| `/api/tasks/<id>` | Deletes a task by numeric ID | None | `{"success": true, "deleted_id": 1}` |

---

## 💾 Data Storage Strategy (Academic vs. Serverless)

### 1. CSV Files (`data/diary.csv`, `data/tasks.csv`)
- Included specifically to fulfill academic data persistence requirements.
- Serve as the initial sample seed data on the first visit.

### 2. Vercel Serverless Filesystem Characteristic
- In Vercel serverless execution, the filesystem (`/var/task`) is **read-only** and stateless across function instances.
- **Resilience Design:** In `api/index.py`, filesystem writes are wrapped in safe exception handling (`safe_write_diary_csv` and `safe_write_tasks_csv`). Writing to CSV succeeds in local environments and fails gracefully without raising `500 Internal Server Error` on Vercel.
- **Client Persistence:** The frontend uses browser `localStorage` as the client-side persistent storage. When a user creates notes or tasks and refreshes their browser, all data is instantly restored.

---

## 🚀 How to Run Locally

### Prerequisites
- Python 3.9 or newer installed.

### Steps
1. Navigate to the project folder in your terminal:
   ```bash
   cd Smart-Diary
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the Python application:
   ```bash
   python api/index.py
   ```
   *(On Windows, you can also run `py api/index.py`)*
4. Open your browser and navigate to:
   ```
   http://127.0.0.1:5000
   ```

---

## ☁️ How to Deploy to Vercel (Step-by-Step)

### Step 1: Create a GitHub Repository
1. Log in to [GitHub](https://github.com).
2. Click **New Repository**.
3. Name the repository `Smart-Diary`.
4. Choose **Public** or **Private**, and click **Create repository**.

### Step 2: Push the Project to GitHub
In your local terminal inside the `Smart-Diary` folder:
```bash
git init
git add .
git commit -m "Initial commit: Smart Diary Python web application for Vercel"
git branch -M main
git remote add origin https://github.com/<your-username>/Smart-Diary.git
git push -u origin main
```

> **Note:** Ensure that `api/index.py`, `vercel.json`, `requirements.txt`, etc., are at the top level of the repository.

### Step 3: Import Project into Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Select your GitHub account and find the `Smart-Diary` repository.
4. Click **Import**.

### Step 4: Configure Project Settings in Vercel
In the Vercel project configuration screen, enter the following exact settings:

| Setting Field | What to Enter / Select |
|---|---|
| **Framework Preset** | **Other** |
| **Root Directory** | `./` *(leave as default root)* |
| **Build Command** | Leave **Empty / Unchecked** *(no build step required)* |
| **Output Directory** | Leave **Empty / Unchecked** |
| **Install Command** | Leave default (`pip install -r requirements.txt` is run automatically by Vercel) |
| **Environment Variables** | None required! |

### Step 5: Click Deploy
1. Click **Deploy**.
2. Vercel will install Python dependencies from `requirements.txt`, bundle `api/index.py`, templates, and static assets according to `vercel.json`.
3. Within 30–60 seconds, your application will be live at a public URL (e.g. `https://smart-diary-xxxx.vercel.app`).
4. Click the link to open your live Smart Diary application!
