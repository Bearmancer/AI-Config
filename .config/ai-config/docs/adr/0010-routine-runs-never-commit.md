# Nothing commits on its own

Context: Day-to-day work needs no attention, and an automatic commit is a change nobody read.

Decision: No scheduled task, watcher or script commits, pushes or notifies. The owner commits by hand, by explicit path, through the pre-commit hook, and pushes by hand. A failed command exits non-zero with its error on stderr. Doctor and the setup script write no log file of their own.

All Python runs through `uv run`, never bare `python`. There is no venv, no `pyproject` and no lockfile in this repo.

Alternatives rejected: a noisy schedule (a report nobody reads gets disabled, and then nothing syncs at all); an automatic commit of live changes (it would land whatever an app wrote, unread); failure toasts (a second channel to keep correct for a task nobody schedules).

## Consequences

- Every commit has a reader, and the hook has run on it.
- A change an app made sits uncommitted until the owner looks at it, and doctor says nothing about it until then.
