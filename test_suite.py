"""
Comprehensive test suite verifying Smart Diary Python backend, routes, Stack data structures,
templates, static file serving, and error handlers.
"""

import json
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from api.index import app, Stack, undo_stack, redo_stack

def run_tests():
    print("=" * 60)
    print("STARTING SMART DIARY TEST SUITE")
    print("=" * 60)

    client = app.test_client()

    # 1. Test Stack Data Structure (Unit Test)
    print("\n[TEST 1] Testing Stack Data Structure...")
    s = Stack(max_capacity=5)
    assert s.empty() is True, "Stack should initially be empty"
    assert s.size() == 0, "Stack size should be 0"

    s.push("version 1")
    s.push("version 2")
    assert s.size() == 2, "Stack size should be 2"
    assert s.peek() == "version 2", "Stack peek should return top item without popping"
    assert s.size() == 2, "Peek should not change size"
    assert s.pop() == "version 2", "Stack pop should return version 2"
    assert s.size() == 1, "Stack size should be 1"
    assert s.pop() == "version 1", "Stack pop should return version 1"
    assert s.pop() is None, "Popping empty stack should return None"
    assert s.empty() is True, "Stack should be empty"

    # Capacity eviction test
    for i in range(10):
        s.push(f"item {i}")
    assert s.size() == 5, f"Stack capacity bounded test failed: size={s.size()}"
    assert s.peek() == "item 9", "Top item should be item 9"
    s.clear()
    assert s.size() == 0, "Clear should empty the stack"
    print("  -> PASSED: Stack unit tests passed successfully!")

    # 2. Test GET / (HTML Homepage)
    print("\n[TEST 2] Testing GET / (Homepage rendering)...")
    res = client.get("/")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    html = res.data.decode("utf-8")
    assert "Smart Diary" in html, "HTML should contain Smart Diary title"
    assert "Dear Diary," in html, "HTML should contain Dear Diary heading"
    assert "☑ My To-Do List" in html, "HTML should contain To-Do List heading"
    assert "style.css" in html, "HTML should link to style.css"
    assert "script.js" in html, "HTML should link to script.js"
    assert "statUndo" in html, "HTML should contain Undo stat monitor"
    assert "statRedo" in html, "HTML should contain Redo stat monitor"
    print("  -> PASSED: GET / returned valid HTML with all required components!")

    # 3. Test Static Files (/static/style.css, /static/script.js)
    print("\n[TEST 3] Testing static files delivery...")
    css_res = client.get("/static/style.css")
    assert css_res.status_code == 200, f"Expected 200 for style.css, got {css_res.status_code}"
    assert "notebook-container" in css_res.data.decode("utf-8"), "CSS should define notebook-container"

    js_res = client.get("/static/script.js")
    assert js_res.status_code == 200, f"Expected 200 for script.js, got {js_res.status_code}"
    assert "class Stack" in js_res.data.decode("utf-8"), "JS should contain Stack class"
    print("  -> PASSED: Static CSS and JavaScript files served successfully!")

    # 4. Test GET /api/health
    print("\n[TEST 4] Testing GET /api/health...")
    health_res = client.get("/api/health")
    assert health_res.status_code == 200
    data = health_res.get_json()
    assert data["success"] is True
    assert data["status"] == "healthy"
    print("  -> PASSED: Health endpoint working properly!")

    # 5. Test GET /api/diary
    print("\n[TEST 5] Testing GET /api/diary...")
    diary_res = client.get("/api/diary")
    assert diary_res.status_code == 200
    data = diary_res.get_json()
    assert data["success"] is True
    assert "content" in data
    assert "undo_count" in data
    assert "redo_count" in data
    print(f"  -> PASSED: GET /api/diary returned content ({len(data['content'])} chars) and stack counts!")

    # 6. Test POST /api/diary and Stack Undo / Redo Endpoints
    print("\n[TEST 6] Testing POST /api/diary and Stack operations...")
    initial_text = data["content"]

    # Post an update
    post_res = client.post("/api/diary", json={"content": "Entry 1: Sunny morning today."})
    assert post_res.status_code == 200
    pdata = post_res.get_json()
    assert pdata["success"] is True
    assert pdata["undo_count"] >= 1, "Undo stack count should have increased"

    # Post another update
    post_res2 = client.post("/api/diary", json={"content": "Entry 2: Afternoon walk in the park."})
    assert post_res2.status_code == 200
    pdata2 = post_res2.get_json()
    assert pdata2["content"] == "Entry 2: Afternoon walk in the park."

    # Test Undo via API
    undo_res = client.post("/api/diary/undo")
    assert undo_res.status_code == 200
    udata = undo_res.get_json()
    assert udata["success"] is True
    assert udata["content"] == "Entry 1: Sunny morning today.", f"Undo should restore Entry 1, got {udata['content']}"
    assert udata["redo_count"] >= 1, "Redo stack should now contain Entry 2"

    # Test Redo via API
    redo_res = client.post("/api/diary/redo")
    assert redo_res.status_code == 200
    rdata = redo_res.get_json()
    assert rdata["success"] is True
    assert rdata["content"] == "Entry 2: Afternoon walk in the park.", f"Redo should restore Entry 2, got {rdata['content']}"

    # Test Clear via API
    clear_res = client.post("/api/diary/clear")
    assert clear_res.status_code == 200
    cdata = clear_res.get_json()
    assert cdata["content"] == ""

    # Test Stack Status Inspection Endpoint
    status_res = client.get("/api/stack/status")
    assert status_res.status_code == 200
    sdata = status_res.get_json()
    assert sdata["success"] is True
    assert "undo_stack" in sdata
    assert "redo_stack" in sdata
    print("  -> PASSED: Diary POST, Stack Undo, Redo, and Clear endpoints working!")

    # 7. Test Tasks API (GET, POST, PUT, DELETE)
    print("\n[TEST 7] Testing To-Do Tasks API...")
    tasks_get = client.get("/api/tasks")
    assert tasks_get.status_code == 200
    tdata = tasks_get.get_json()
    assert tdata["success"] is True
    orig_count = tdata["count"]

    # POST new task
    add_res = client.post("/api/tasks", json={"text": "Review data structure assignment"})
    assert add_res.status_code == 201
    add_data = add_res.get_json()
    assert add_data["success"] is True
    new_task = add_data["task"]
    new_task_id = new_task["id"]
    assert new_task["text"] == "Review data structure assignment"
    assert new_task["done"] is False

    # PUT update task (mark completed)
    put_res = client.put(f"/api/tasks/{new_task_id}", json={"done": True})
    assert put_res.status_code == 200
    put_data = put_res.get_json()
    assert put_data["success"] is True
    assert put_data["task"]["done"] is True

    # DELETE task
    del_res = client.delete(f"/api/tasks/{new_task_id}")
    assert del_res.status_code == 200
    del_data = del_res.get_json()
    assert del_data["success"] is True
    assert del_data["deleted_id"] == new_task_id

    # Verify task was deleted
    tasks_after = client.get("/api/tasks").get_json()
    assert not any(t["id"] == new_task_id for t in tasks_after["tasks"])
    print("  -> PASSED: Tasks API CRUD (Create, Read, Update, Delete) working!")

    # 8. Test Error Handling
    print("\n[TEST 8] Testing Error Handlers...")
    # 404 for unknown API route
    e404_res = client.get("/api/nonexistent_route")
    assert e404_res.status_code == 404
    assert e404_res.get_json()["success"] is False
    assert "not found" in e404_res.get_json()["message"].lower()

    # 400 for adding blank task
    bad_task_res = client.post("/api/tasks", json={"text": "   "})
    assert bad_task_res.status_code == 400
    assert bad_task_res.get_json()["success"] is False

    # 404 for updating non-existent task
    not_found_put = client.put("/api/tasks/999999", json={"done": True})
    assert not_found_put.status_code == 404
    print("  -> PASSED: Clean JSON error handling verified!")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED! SMART DIARY IS 100% OPERATIONAL & PRODUCTION-READY.")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
