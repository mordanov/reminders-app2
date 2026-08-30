# User guide

## Signing in

Visit `http://localhost:8080`. The browser asks for an HTTP Basic username and
password. Use one of the two accounts configured by the application operator. There is
no separate sign-out screen; close all browser windows or clear the browser's saved
Basic Auth credentials to switch users.

## Weekly planner

The planner shows Monday through Saturday. Sunday reminders cannot be created. Use the
previous, next, and today controls to move between weeks, or open the date picker to
jump to a week. The selected week is part of the URL, so refreshes and bookmarks retain
it. Past weeks remain editable.

Select one or more calendar buttons on the left. Each reminder uses its calendar's text
color. Hover or open a reminder to see its calendar name. Deselecting every calendar
shows an empty-state prompt. Calendar selection follows your account across devices;
text and tag filters reset when the page reloads.

Each day lists:

1. **Day reminders** at the top, in a saved manual order.
2. **Timed reminders** below, ordered by 24-hour time and then creation time.

Completed items remain in place with subdued, struck-through text.

## Creating and editing reminders

Activate a day card's add control to open the reminder dialog.

- Choose **day** for a date-only task or **timed** for an exact date and time.
- Enter up to 2,000 characters.
- Add up to 10 tags. Tags are shared within the selected calendar and autocomplete as
  you type.
- Set weekly copies from 1 through 52. The number includes the original reminder.
  Every generated copy is independent afterward.

The application warns about an exact duplicate but allows you to confirm it. Open any
reminder to read long text or edit, complete, move, or delete it. Moving a reminder to
another calendar creates matching destination tags automatically.

Drag day reminders to reorder them. Dragging one to another visible day places it at
the end of that day's date-only list. Use the edit dialog to move timed reminders or to
move a task outside the visible week. Keyboard-accessible movement controls are
available as an alternative to dragging.

If another editor changed the same item first, your stale edit is rejected. Reload the
latest item and apply your change again.

## Calendars and sharing

Every new account receives a private **Личный** calendar. You may own up to 10
calendars; calendars shared with you do not count against that limit. Calendar names
must be unique among calendars you own.

Owners may rename a calendar, choose a color from the accessible palette, share it with
the other configured username, remove sharing, or delete it. Editors can create, edit,
complete, reorder, move, and delete all reminders and floating tasks in a shared
calendar, regardless of who created them. Only the owner controls calendar settings.

Deleting a calendar also soft-deletes its reminders, tags, tasks, and shares. Deleted
data is retained internally for 30 days and is not available through a user-facing
trash screen.

## Floating tasks

The tabs on the right open text-based floating-task categories. Your category names and
ordering are personal and apply across calendars. Create any number of categories and
drag them into your preferred order.

An open category window shows matching tasks from all currently selected calendars.
You can search within it, then create, edit, complete, delete, recategorize, and reorder
tasks. Tasks themselves belong to calendars and are visible to calendar editors.
Read-only category buttons appear for another user when selected shared calendars
contain tasks assigned to that user's category.

## Live updates, filters, and language

Changes by another editor normally appear without refresh. A small disconnected
indicator appears if the live Server-Sent Events connection drops; the application
retries automatically and normal edits continue through the API.

Use text and tag filters to narrow the weekly reminders in selected calendars. Switch
between Russian and English from the language control. The choice is saved to your
account and changes interface labels, weekdays, and date formatting on every device.
