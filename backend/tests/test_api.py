from __future__ import annotations

from datetime import date

from httpx import AsyncClient


async def create_calendar(client: AsyncClient, headers: dict[str, str], name: str = "Work") -> dict:
    response = await client.post(
        "/api/calendars", headers=headers, json={"name": name, "color": "#FFFFFF"}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_auth_calendar_preferences_and_sharing(
    client: AsyncClient, alice_headers: dict[str, str], bob_headers: dict[str, str]
) -> None:
    assert (await client.get("/api/health", headers=alice_headers)).status_code == 200
    assert (await client.get("/api/health")).status_code == 401
    assert (await client.get("/api/me")).status_code == 401
    me = await client.get("/api/me", headers=alice_headers)
    assert "password_hash" not in me.json()
    calendar = await create_calendar(client, alice_headers)
    assert calendar["text_color"] == "#000000"
    assert (await client.get("/api/calendars", headers=bob_headers)).json() == []

    share = await client.post(
        f"/api/calendars/{calendar['id']}/shares",
        headers=alice_headers,
        json={"username": "bob"},
    )
    assert share.status_code == 201
    assert len((await client.get("/api/calendars", headers=bob_headers)).json()) == 1

    preferences = await client.patch(
        "/api/preferences",
        headers=bob_headers,
        json={"selected_calendar_ids": [calendar["id"]], "locale": "en"},
    )
    assert preferences.status_code == 200
    assert preferences.json()["locale"] == "en"

    removed = await client.delete(
        f"/api/calendars/{calendar['id']}/shares/{share.json()['user']['id']}",
        headers=alice_headers,
    )
    assert removed.status_code == 200
    assert (await client.get("/api/preferences", headers=bob_headers)).json()[
        "selected_calendar_ids"
    ] == []

    forbidden = await client.patch(
        f"/api/calendars/{calendar['id']}",
        headers=bob_headers,
        json={"version": 1, "name": "No"},
    )
    assert forbidden.status_code == 404


async def test_tags_weekly_reminders_search_and_stale_version(
    client: AsyncClient, alice_headers: dict[str, str]
) -> None:
    calendar = await create_calendar(client, alice_headers)
    tag = await client.post(
        f"/api/calendars/{calendar['id']}/tags",
        headers=alice_headers,
        json={"name": "urgent"},
    )
    assert tag.status_code == 201
    created = await client.post(
        "/api/reminders",
        headers=alice_headers,
        json={
            "calendar_id": calendar["id"],
            "kind": "DAY",
            "text": "prepare report",
            "due_date": "2026-08-24",
            "tag_ids": [tag.json()["id"]],
            "weekly_count": 2,
        },
    )
    assert created.status_code == 201, created.text
    reminders = created.json()["items"]
    assert [item["due_date"] for item in reminders] == ["2026-08-24", "2026-08-31"]

    duplicate = await client.post(
        "/api/reminders",
        headers=alice_headers,
        json={
            "calendar_id": calendar["id"],
            "kind": "DAY",
            "text": "prepare report",
            "due_date": "2026-08-24",
        },
    )
    assert duplicate.json()["warnings"]

    week = await client.get("/api/weeks/2026-08-24", headers=alice_headers)
    assert week.status_code == 200
    assert len(week.json()["reminders"]) == 2
    found = await client.get("/api/search?tag=urgent&text=report", headers=alice_headers)
    assert len(found.json()) == 2

    item = reminders[0]
    updated = await client.patch(
        f"/api/reminders/{item['id']}",
        headers=alice_headers,
        json={"version": item["version"], "completed": True},
    )
    assert updated.status_code == 200
    stale = await client.patch(
        f"/api/reminders/{item['id']}",
        headers=alice_headers,
        json={"version": item["version"], "completed": False},
    )
    assert stale.status_code == 409

    sunday = await client.post(
        "/api/reminders",
        headers=alice_headers,
        json={
            "calendar_id": calendar["id"],
            "kind": "DAY",
            "text": "invalid",
            "due_date": date(2026, 8, 30).isoformat(),
        },
    )
    assert sunday.status_code == 422


async def test_day_board_floating_tasks_and_soft_delete(
    client: AsyncClient, alice_headers: dict[str, str], bob_headers: dict[str, str]
) -> None:
    calendar = await create_calendar(client, alice_headers)
    await client.post(
        f"/api/calendars/{calendar['id']}/shares",
        headers=alice_headers,
        json={"username": "bob"},
    )
    created = await client.post(
        "/api/reminders",
        headers=bob_headers,
        json={
            "calendar_id": calendar["id"],
            "kind": "DAY",
            "text": "shared edit",
            "due_date": "2026-08-24",
        },
    )
    reminder = created.json()["items"][0]
    board = await client.put(
        "/api/reminders/day-board",
        headers=bob_headers,
        json={
            "columns": [{"date": "2026-08-25", "reminder_ids": [reminder["id"]]}],
            "versions": {reminder["id"]: reminder["version"]},
        },
    )
    assert board.status_code == 200
    assert board.json()[0]["due_date"] == "2026-08-25"

    category = await client.post("/api/categories", headers=bob_headers, json={"name": "Ideas"})
    task = await client.post(
        "/api/floating-tasks",
        headers=bob_headers,
        json={
            "calendar_id": calendar["id"],
            "category_id": category.json()["id"],
            "text": "floating",
        },
    )
    assert task.status_code == 201
    visible_categories = await client.get("/api/categories", headers=alice_headers)
    assert category.json()["id"] in {item["id"] for item in visible_categories.json()}
    assert (
        await client.patch(
            f"/api/categories/{category.json()['id']}",
            headers=alice_headers,
            json={"version": 1, "name": "Owner only"},
        )
    ).status_code == 404
    changed = await client.patch(
        f"/api/floating-tasks/{task.json()['id']}",
        headers=bob_headers,
        json={"version": 1, "completed": True},
    )
    assert changed.status_code == 200
    assert (
        await client.delete(
            f"/api/floating-tasks/{task.json()['id']}?version={changed.json()['version']}",
            headers=bob_headers,
        )
    ).status_code == 200
    assert (
        await client.patch(
            "/api/preferences",
            headers=alice_headers,
            json={"selected_calendar_ids": [calendar["id"]]},
        )
    ).status_code == 200
    assert (
        await client.delete(
            f"/api/calendars/{calendar['id']}?version={calendar['version']}",
            headers=alice_headers,
        )
    ).status_code == 200
    assert (await client.get("/api/preferences", headers=alice_headers)).json()[
        "selected_calendar_ids"
    ] == []


async def test_complete_calendar_tag_and_category_management(
    client: AsyncClient, alice_headers: dict[str, str], bob_headers: dict[str, str]
) -> None:
    first = await create_calendar(client, alice_headers, "First")
    second = await create_calendar(client, alice_headers, "Second")
    updated = await client.patch(
        f"/api/calendars/{first['id']}",
        headers=alice_headers,
        json={"version": 1, "name": "Renamed", "color": "#000000"},
    )
    assert updated.status_code == 200
    assert updated.json()["text_color"] == "#FFFFFF"
    duplicate_name = await client.patch(
        f"/api/calendars/{second['id']}",
        headers=alice_headers,
        json={"version": 1, "name": "Renamed"},
    )
    assert duplicate_name.status_code == 409

    await client.post(
        f"/api/calendars/{first['id']}/shares",
        headers=alice_headers,
        json={"username": "bob"},
    )
    shares = await client.get(f"/api/calendars/{first['id']}/shares", headers=alice_headers)
    assert shares.json()[0]["user"]["username"] == "bob"
    member_id = shares.json()[0]["user"]["id"]
    removed = await client.delete(
        f"/api/calendars/{first['id']}/shares/{member_id}", headers=alice_headers
    )
    assert removed.status_code == 200

    tag = await client.post(
        f"/api/calendars/{first['id']}/tags",
        headers=alice_headers,
        json={"name": "one"},
    )
    assert (
        len((await client.get(f"/api/calendars/{first['id']}/tags", headers=alice_headers)).json())
        == 1
    )
    assert (
        await client.delete(f"/api/tags/{tag.json()['id']}", headers=alice_headers)
    ).status_code == 200

    category_a = await client.post("/api/categories", headers=alice_headers, json={"name": "A"})
    category_b = await client.post("/api/categories", headers=alice_headers, json={"name": "B"})
    categories = (await client.get("/api/categories", headers=alice_headers)).json()
    assert len(categories) == 3
    duplicate_category = await client.patch(
        f"/api/categories/{category_b.json()['id']}",
        headers=alice_headers,
        json={"version": category_b.json()["version"], "name": "A"},
    )
    assert duplicate_category.status_code == 409
    renamed = await client.patch(
        f"/api/categories/{category_a.json()['id']}",
        headers=alice_headers,
        json={"version": 1, "name": "A+"},
    )
    assert renamed.status_code == 200
    reordered = await client.put(
        "/api/categories/order",
        headers=alice_headers,
        json={
            "ids": [category_b.json()["id"], category_a.json()["id"]],
            "versions": {
                category_b.json()["id"]: category_b.json()["version"],
                category_a.json()["id"]: renamed.json()["version"],
            },
        },
    )
    assert [item["position"] for item in reordered.json()] == [0, 1]
    assert (
        await client.delete(
            f"/api/categories/{category_b.json()['id']}?version={reordered.json()[0]['version']}",
            headers=alice_headers,
        )
    ).status_code == 200


async def test_datetime_move_delete_and_floating_reorder(
    client: AsyncClient, alice_headers: dict[str, str]
) -> None:
    source = await create_calendar(client, alice_headers, "Source")
    target = await create_calendar(client, alice_headers, "Target")
    tag = await client.post(
        f"/api/calendars/{source['id']}/tags",
        headers=alice_headers,
        json={"name": "copied"},
    )
    created = await client.post(
        "/api/reminders",
        headers=alice_headers,
        json={
            "calendar_id": source["id"],
            "kind": "DATETIME",
            "text": "appointment",
            "due_at": "2026-08-29T12:30:00+02:00",
            "tag_ids": [tag.json()["id"]],
        },
    )
    item = created.json()["items"][0]
    moved = await client.patch(
        f"/api/reminders/{item['id']}",
        headers=alice_headers,
        json={
            "version": item["version"],
            "calendar_id": target["id"],
            "due_at": "2026-09-05T13:30:00+02:00",
            "text": "moved appointment",
        },
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["calendar_id"] == target["id"]
    target_tags = await client.get(f"/api/calendars/{target['id']}/tags", headers=alice_headers)
    assert target_tags.json()[0]["name"] == "copied"
    assert (
        await client.delete(
            f"/api/reminders/{item['id']}?version={moved.json()['version']}",
            headers=alice_headers,
        )
    ).status_code == 200
    assert (
        await client.get("/api/search?calendar_id=" + target["id"], headers=alice_headers)
    ).json() == []
    assert (await client.get("/api/weeks/2026-08-25", headers=alice_headers)).status_code == 422

    category = await client.post("/api/categories", headers=alice_headers, json={"name": "Queue"})
    tasks = []
    for text in ("one", "two"):
        response = await client.post(
            "/api/floating-tasks",
            headers=alice_headers,
            json={
                "calendar_id": target["id"],
                "category_id": category.json()["id"],
                "text": text,
            },
        )
        tasks.append(response.json())
    listed = await client.get(
        f"/api/floating-tasks?calendar_id={target['id']}", headers=alice_headers
    )
    assert len(listed.json()) == 2
    ordered = await client.put(
        "/api/floating-tasks/order",
        headers=alice_headers,
        json={
            "ids": [tasks[1]["id"], tasks[0]["id"]],
            "versions": {
                tasks[1]["id"]: tasks[1]["version"],
                tasks[0]["id"]: tasks[0]["version"],
            },
        },
    )
    assert [item["position"] for item in ordered.json()] == [0, 1]
    in_use = await client.delete(
        f"/api/categories/{category.json()['id']}?version={category.json()['version']}",
        headers=alice_headers,
    )
    assert in_use.status_code == 409


async def test_validation_and_conflict_responses(
    client: AsyncClient, alice_headers: dict[str, str]
) -> None:
    assert (await client.get("/api/preferences", headers=alice_headers)).status_code == 200
    calendar = await create_calendar(client, alice_headers, "Unique")
    assert (
        await client.post(
            "/api/calendars",
            headers=alice_headers,
            json={"name": "Unique", "color": "#123456"},
        )
    ).status_code == 409
    assert (
        await client.patch(
            f"/api/calendars/{calendar['id']}",
            headers=alice_headers,
            json={"version": 999, "name": "stale"},
        )
    ).status_code == 409
    assert (
        await client.post(
            f"/api/calendars/{calendar['id']}/shares",
            headers=alice_headers,
            json={"username": "alice"},
        )
    ).status_code == 409
    assert (
        await client.delete(
            f"/api/calendars/{calendar['id']}/shares/00000000-0000-0000-0000-000000000001",
            headers=alice_headers,
        )
    ).status_code == 404

    tag = await client.post(
        f"/api/calendars/{calendar['id']}/tags",
        headers=alice_headers,
        json={"name": "duplicate"},
    )
    assert tag.status_code == 201
    assert (
        await client.post(
            f"/api/calendars/{calendar['id']}/tags",
            headers=alice_headers,
            json={"name": "duplicate"},
        )
    ).status_code == 409
    invalid_tags = await client.post(
        "/api/reminders",
        headers=alice_headers,
        json={
            "calendar_id": calendar["id"],
            "kind": "DAY",
            "text": "bad tags",
            "due_date": "2026-08-24",
            "tag_ids": [
                "00000000-0000-0000-0000-000000000001",
            ],
        },
    )
    assert invalid_tags.status_code == 422

    category = await client.post(
        "/api/categories", headers=alice_headers, json={"name": "Conflict"}
    )
    assert (
        await client.patch(
            f"/api/categories/{category.json()['id']}",
            headers=alice_headers,
            json={"version": 999, "name": "stale"},
        )
    ).status_code == 409
    assert (
        await client.put(
            "/api/categories/order",
            headers=alice_headers,
            json={"ids": ["00000000-0000-0000-0000-000000000001"]},
        )
    ).status_code == 422
