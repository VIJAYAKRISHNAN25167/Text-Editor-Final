"""
=============================================================================
Smart Diary - Python Backend (Serverless Flask Application for Vercel)
=============================================================================
This backend powers the Smart Diary web application. It demonstrates the
fundamental Stack data structure (LIFO - Last In, First Out) for managing
Undo and Redo history, alongside RESTful API endpoints for diary entries
and to-do task management.

Compatible with:
- Vercel Python Serverless Runtime (@vercel/python)
- Local Python 3.9+ development environments
=============================================================================
"""

import csv
import logging
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, render_template, request

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smart_diary")

# ---------------------------------------------------------------------------
# Path Configuration (Safe for Vercel Serverless and Local Execution)
# ---------------------------------------------------------------------------
# BASE_DIR points to the root directory of the Smart Diary project.
# In Vercel serverless functions, files reside inside /var/task.
# Using Path(__file__).resolve().parent.parent ensures paths are always correct.
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
DIARY_CSV_PATH = DATA_DIR / "diary.csv"
TASKS_CSV_PATH = DATA_DIR / "tasks.csv"

# Flask Application Instance
app = Flask(
    __name__,
    template_folder=str(TEMPLATES_DIR),
    static_folder=str(STATIC_DIR),
    static_url_path="/static"
)
app.config["JSON_SORT_KEYS"] = False


class VercelPathFixMiddleware:
    """
    WSGI Middleware for Vercel Serverless environment.
    When Vercel uses rewrite rules (e.g. /(.*) -> /api/index), Vercel passes
    the original requested URL path in HTTP_X_MATCHED_PATH.
    This middleware restores the original path in PATH_INFO so Flask's routing
    works seamlessly for /, /api/diary, /api/tasks, etc.
    """
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        matched_path = environ.get("HTTP_X_MATCHED_PATH") or environ.get("HTTP_X_VERCEL_MATCHED_PATH")
        if matched_path:
            # Strip query string if present
            if "?" in matched_path:
                matched_path = matched_path.split("?", 1)[0]
            environ["PATH_INFO"] = matched_path
        return self.wsgi_app(environ, start_response)


# Wrap Flask with Vercel path fix middleware
app.wsgi_app = VercelPathFixMiddleware(app.wsgi_app)


# =============================================================================
# DATA STRUCTURE: STACK (LIFO - Last In, First Out)
# =============================================================================
# A Stack is a linear data structure that follows the LIFO principle: the last
# element added to the stack is the first one to be removed.
#
# Time Complexity of Core Operations:
# - push(item): O(1) constant time
# - pop():      O(1) constant time
# - peek():     O(1) constant time
# - empty():    O(1) constant time
# - size():     O(1) constant time
# - clear():    O(1) constant time
#
# APPLICATION IN SMART DIARY:
# We maintain two distinct Stack instances in this application:
# 1. undo_stack: Holds snapshots of previous diary contents. Whenever the user
#    modifies the diary, the prior state is pushed onto undo_stack.
# 2. redo_stack: Holds snapshots of states that were undone. When Undo is clicked,
#    the current state is pushed onto redo_stack, and undo_stack.pop() is restored.
#    When Redo is clicked, current state is pushed onto undo_stack, and redo_stack.pop()
#    is restored. If a user types after an undo, redo_stack is cleared.
# =============================================================================

class Stack:
    """Standard Stack data structure implementation using a dynamic array."""

    def __init__(self, max_capacity: int = 500):
        self.items = []
        self.max_capacity = max_capacity

    def push(self, item):
        """Pushes an element onto the top of the stack."""
        if len(self.items) >= self.max_capacity:
            # Drop the oldest item from the bottom to prevent unbounded memory growth
            self.items.pop(0)
        self.items.append(item)

    def pop(self):
        """Removes and returns the topmost element. Returns None if empty."""
        return self.items.pop() if self.items else None

    def peek(self):
        """Returns the topmost element without removing it. Returns None if empty."""
        return self.items[-1] if self.items else None

    def empty(self) -> bool:
        """Returns True if the stack has no elements, False otherwise."""
        return len(self.items) == 0

    def clear(self):
        """Empties all elements from the stack."""
        self.items.clear()

    def size(self) -> int:
        """Returns the total number of items currently in the stack."""
        return len(self.items)

    def to_list(self):
        """Returns a copy of the stack items as a list (for inspection / debugging)."""
        return list(self.items)


# Instantiate the two stacks for diary history management
undo_stack = Stack()  # Stores historical versions of diary content for Undo
redo_stack = Stack()  # Stores undone versions of diary content for Redo


# ---------------------------------------------------------------------------
# In-Memory Cache and Data Storage Helpers
# ---------------------------------------------------------------------------
# Default fallback content if CSV files are missing
DEFAULT_DIARY_CONTENT = (
    "Today I started using Smart Diary.\n"
    "Everything I write is saved in this browser, so it will still be here after a refresh.\n\n"
    "Things I want to try:\n"
    "- Undo and Redo (they are built on two stacks)\n"
    "- The dark theme and the font size buttons\n"
    "- Adding a few tasks on the right"
)

DEFAULT_TASKS = [
    {"id": 1, "text": "Write today's diary entry", "done": False, "created_at": "2026-10-08 10:00:00"},
    {"id": 2, "text": "Try the Undo and Redo buttons", "done": False, "created_at": "2026-10-08 10:05:00"},
    {"id": 3, "text": "Switch to the dark theme", "done": True, "created_at": "2026-10-08 10:10:00"},
]

current_diary_content = ""
tasks_cache = []
is_initialized = False


def safe_read_diary_csv() -> str:
    """Reads diary entry from CSV sample file if present."""
    try:
        if DIARY_CSV_PATH.is_file():
            with open(DIARY_CSV_PATH, mode="r", encoding="utf-8") as f:
                reader = csv.reader(f)
                rows = list(reader)
                if len(rows) > 1 and len(rows[1]) >= 3:
                    return rows[1][2]
                elif len(rows) > 1 and len(rows[1]) >= 1:
                    return rows[1][0]
    except Exception as e:
        logger.warning(f"Could not read diary.csv: {e}")
    return DEFAULT_DIARY_CONTENT


def safe_read_tasks_csv() -> list:
    """Reads tasks from CSV sample file if present."""
    parsed_tasks = []
    try:
        if TASKS_CSV_PATH.is_file():
            with open(TASKS_CSV_PATH, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    task_id = int(row.get("id", 0))
                    text = row.get("text", "").strip()
                    done = str(row.get("done", "false")).strip().lower() in ("true", "1", "yes")
                    created_at = row.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    if task_id and text:
                        parsed_tasks.append({
                            "id": task_id,
                            "text": text,
                            "done": done,
                            "created_at": created_at
                        })
    except Exception as e:
        logger.warning(f"Could not read tasks.csv: {e}")
    return parsed_tasks if parsed_tasks else [dict(t) for t in DEFAULT_TASKS]


def safe_write_diary_csv(content: str):
    """
    Attempts to write diary content to CSV.
    Note: On Vercel serverless functions, the root filesystem is read-only.
    This helper catches filesystem errors gracefully so normal operations
    never throw Internal Server Error.
    """
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(DIARY_CSV_PATH, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["id", "entry_date", "content"])
            writer.writerow([1, datetime.now().strftime("%Y-%m-%d"), content])
    except (OSError, IOError, PermissionError) as e:
        logger.info(f"Filesystem write skipped (read-only environment): {e}")


def safe_write_tasks_csv(tasks_list: list):
    """
    Attempts to write tasks to CSV.
    Safely handles read-only serverless filesystem environments.
    """
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(TASKS_CSV_PATH, mode="w", newline="", encoding="utf-8") as f:
            fieldnames = ["id", "text", "done", "created_at"]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for t in tasks_list:
                writer.writerow({
                    "id": t["id"],
                    "text": t["text"],
                    "done": str(t["done"]).lower(),
                    "created_at": t.get("created_at", "")
                })
    except (OSError, IOError, PermissionError) as e:
        logger.info(f"Filesystem write skipped (read-only environment): {e}")


def ensure_initialized():
    """Initializes in-memory state on first invocation."""
    global is_initialized, current_diary_content, tasks_cache
    if not is_initialized:
        current_diary_content = safe_read_diary_csv()
        tasks_cache = safe_read_tasks_csv()
        is_initialized = True


# =============================================================================
# WEB & API ROUTES
# =============================================================================

@app.route("/", methods=["GET"])
@app.route("/api", methods=["GET"])
@app.route("/api/index", methods=["GET"])
@app.route("/api/index.py", methods=["GET"])
def index():
    """Serves the main Smart Diary HTML user interface."""
    ensure_initialized()
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify backend status."""
    return jsonify({
        "success": True,
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "runtime": "Python Serverless (Vercel compatible)"
    })


# ---------------------------------------------------------------------------
# DIARY API (GET / POST / UNDO / REDO / CLEAR)
# ---------------------------------------------------------------------------

@app.route("/api/diary", methods=["GET"])
def get_diary():
    """Retrieves current diary content and undo/redo stack counts."""
    ensure_initialized()
    return jsonify({
        "success": True,
        "content": current_diary_content,
        "undo_count": undo_stack.size(),
        "redo_count": redo_stack.size()
    })


@app.route("/api/diary", methods=["POST"])
def update_diary():
    """
    Updates diary content and pushes the previous state onto the undo stack.
    Clears the redo stack because a new edit breaks the redo branch.
    """
    global current_diary_content
    ensure_initialized()

    data = request.get_json(silent=True) or {}
    new_content = data.get("content", "")

    # Only record a new undo state if content actually changed
    if new_content != current_diary_content:
        # PUSH old content to undo stack (Stack Demonstration)
        undo_stack.push(current_diary_content)
        # Any new edit invalidates the redo stack
        redo_stack.clear()
        current_diary_content = new_content
        safe_write_diary_csv(current_diary_content)

    return jsonify({
        "success": True,
        "content": current_diary_content,
        "undo_count": undo_stack.size(),
        "redo_count": redo_stack.size(),
        "message": "Diary content updated successfully"
    })


@app.route("/api/diary/undo", methods=["POST"])
def diary_undo():
    """
    Executes Undo using the Python Stack data structure:
    1. Check if undo_stack is empty.
    2. Push current content onto redo_stack.
    3. Pop top state from undo_stack and set as current content.
    """
    global current_diary_content
    ensure_initialized()

    if undo_stack.empty():
        return jsonify({
            "success": False,
            "message": "Undo stack is empty - nothing to undo",
            "undo_count": 0,
            "redo_count": redo_stack.size()
        }), 400

    # Push current content to redo stack
    redo_stack.push(current_diary_content)
    # Pop previous content from undo stack
    current_diary_content = undo_stack.pop()
    safe_write_diary_csv(current_diary_content)

    return jsonify({
        "success": True,
        "content": current_diary_content,
        "undo_count": undo_stack.size(),
        "redo_count": redo_stack.size(),
        "message": "Undo operation performed via Python Stack"
    })


@app.route("/api/diary/redo", methods=["POST"])
def diary_redo():
    """
    Executes Redo using the Python Stack data structure:
    1. Check if redo_stack is empty.
    2. Push current content onto undo_stack.
    3. Pop top state from redo_stack and set as current content.
    """
    global current_diary_content
    ensure_initialized()

    if redo_stack.empty():
        return jsonify({
            "success": False,
            "message": "Redo stack is empty - nothing to redo",
            "undo_count": undo_stack.size(),
            "redo_count": 0
        }), 400

    # Push current content to undo stack
    undo_stack.push(current_diary_content)
    # Pop next state from redo stack
    current_diary_content = redo_stack.pop()
    safe_write_diary_csv(current_diary_content)

    return jsonify({
        "success": True,
        "content": current_diary_content,
        "undo_count": undo_stack.size(),
        "redo_count": redo_stack.size(),
        "message": "Redo operation performed via Python Stack"
    })


@app.route("/api/diary/clear", methods=["POST"])
def diary_clear():
    """Clears the diary page, pushing the prior text onto the undo stack."""
    global current_diary_content
    ensure_initialized()

    if current_diary_content:
        undo_stack.push(current_diary_content)
        redo_stack.clear()
        current_diary_content = ""
        safe_write_diary_csv("")

    return jsonify({
        "success": True,
        "content": "",
        "undo_count": undo_stack.size(),
        "redo_count": redo_stack.size(),
        "message": "Diary cleared (snapshot saved to Undo stack)"
    })


@app.route("/api/stack/status", methods=["GET"])
def stack_status():
    """Academic endpoint to inspect the current state of both Stacks."""
    ensure_initialized()
    return jsonify({
        "success": True,
        "data_structure": "Stack (LIFO)",
        "undo_stack": {
            "size": undo_stack.size(),
            "empty": undo_stack.empty()
        },
        "redo_stack": {
            "size": redo_stack.size(),
            "empty": redo_stack.empty()
        }
    })


# ---------------------------------------------------------------------------
# TO-DO LIST API (GET / POST / PUT / DELETE)
# ---------------------------------------------------------------------------

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """Returns the list of all tasks."""
    ensure_initialized()
    return jsonify({
        "success": True,
        "tasks": tasks_cache,
        "count": len(tasks_cache)
    })


@app.route("/api/tasks", methods=["POST"])
def add_task():
    """Adds a new task to the list."""
    global tasks_cache
    ensure_initialized()

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({
            "success": False,
            "message": "Task text cannot be empty"
        }), 400

    next_id = max([t["id"] for t in tasks_cache], default=0) + 1
    new_task = {
        "id": next_id,
        "text": text,
        "done": False,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    tasks_cache.append(new_task)
    safe_write_tasks_csv(tasks_cache)

    return jsonify({
        "success": True,
        "task": new_task,
        "tasks": tasks_cache,
        "count": len(tasks_cache),
        "message": "Task added successfully"
    }), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id: int):
    """Updates an existing task (toggle done status or update text)."""
    global tasks_cache
    ensure_initialized()

    data = request.get_json(silent=True) or {}
    task = next((t for t in tasks_cache if t["id"] == task_id), None)

    if not task:
        return jsonify({
            "success": False,
            "message": f"Task with id {task_id} not found"
        }), 404

    if "done" in data:
        task["done"] = bool(data["done"])
    if "text" in data and str(data["text"]).strip():
        task["text"] = str(data["text"]).strip()

    safe_write_tasks_csv(tasks_cache)

    return jsonify({
        "success": True,
        "task": task,
        "tasks": tasks_cache,
        "count": len(tasks_cache),
        "message": "Task updated successfully"
    })


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id: int):
    """Deletes a task by id."""
    global tasks_cache
    ensure_initialized()

    task = next((t for t in tasks_cache if t["id"] == task_id), None)
    if not task:
        return jsonify({
            "success": False,
            "message": f"Task with id {task_id} not found"
        }), 404

    tasks_cache = [t for t in tasks_cache if t["id"] != task_id]
    safe_write_tasks_csv(tasks_cache)

    return jsonify({
        "success": True,
        "deleted_id": task_id,
        "tasks": tasks_cache,
        "count": len(tasks_cache),
        "message": "Task deleted successfully"
    })


# ---------------------------------------------------------------------------
# ERROR HANDLERS (Clean JSON Responses)
# ---------------------------------------------------------------------------

@app.errorhandler(400)
def bad_request(error):
    return jsonify({
        "success": False,
        "message": "Bad request"
    }), 400


@app.errorhandler(404)
def not_found(error):
    # If the rewritten path is /api/index, /api/index.py, or /api, render the page
    if request.path in ("/api/index", "/api/index.py", "/api", "/api/"):
        return render_template("index.html")
    if request.path.startswith("/api/"):
        return jsonify({
            "success": False,
            "message": f"API endpoint not found: {request.path}"
        }), 404
    # For non-API frontend routes, render index.html
    return render_template("index.html")


@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({
        "success": False,
        "message": f"Method {request.method} not allowed for {request.path}"
    }), 405


@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        "success": False,
        "message": "An internal server error occurred"
    }), 500


@app.errorhandler(Exception)
def handle_unexpected_exception(error):
    logger.error(f"Unexpected error: {error}", exc_info=True)
    return jsonify({
        "success": False,
        "message": str(error)
    }), 500


# ---------------------------------------------------------------------------
# Local Execution Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print(f"Smart Diary running locally at http://127.0.0.1:5000")
    print(f"BASE_DIR resolved to: {BASE_DIR}")
    app.run(host="127.0.0.1", port=5000, debug=True)
