# Workspace Agent Instructions — AMRouter

## Changelog Update (MANDATORY)

- After every **significant change** (new feature, bug fix, architectural change, or breaking change), update `frontend/public/CHANGELOG.md`.
- The format follows **Keep a Changelog** style:
  ```
  ## [vX.Y.Z] - YYYY-MM-DD
  ### Added / Changed / Fixed / Removed
  - Brief description of what changed
  ```
- Changelog entries should be written in **English**, concise but informative.
- Increment the patch version for bug fixes, minor version for new features, and major version for breaking changes.
- Always commit the changelog update **together** with the code change in the same commit, or in a follow-up commit immediately after.

### When to Update Changelog

Update `frontend/public/CHANGELOG.md` whenever:
- A new feature or UI component is added
- A significant bug fix is applied
- Backend automation scripts or routes are changed
- Authentication or security flows are modified
- Dependencies are upgraded with user-visible impact
- A tab, page, or major component is removed or renamed

### When NOT to Update Changelog

Skip changelog updates for:
- Minor code refactors with no user impact
- Dependency lock file updates only
- Internal build config tweaks
- Comment or documentation-only changes

## Project Scope

- All active development targets `/home/data/Project/amrouter`.
- Do **not** modify files in `/home/data/Project/9router` (monolith) unless explicitly requested.

## Changelog Location

- File: `frontend/public/CHANGELOG.md`
- This file is served as a static asset at `/CHANGELOG.md` and shown inside the app via the Changelog modal in the header menu.
