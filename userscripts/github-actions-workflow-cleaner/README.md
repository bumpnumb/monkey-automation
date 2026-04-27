# GitHub Actions Workflow Cleaner

Userscript that improves the left workflow sidebar on GitHub Actions pages.

## What it does

- Expands all workflow pages in the sidebar (loads all workflow entries).
- Hides disabled workflows automatically.
- Adds a search box to filter workflows by name.
- Highlights the currently selected search result.
- Supports keyboard navigation while searching:
	- `Tab`: move to next visible workflow result.
	- `Enter`: open the selected workflow.

## Supported pages

The script only runs on repository workflow list pages:

- `/{owner}/{repo}/actions`
- `/{owner}/{repo}/actions/workflows/*`

It intentionally does not run on workflow run/job detail pages such as:

- `/{owner}/{repo}/actions/runs/*`
- `/{owner}/{repo}/actions/new`

## Installation

1. Install a userscript manager extension:
	 - [Violentmonkey](https://violentmonkey.github.io/)
2. Open this install URL:
	 - https://raw.githubusercontent.com/bumpnumb/monkey-automation/main/userscripts/github-actions-workflow-cleaner/script.js
3. Confirm installation in your userscript manager.
4. Reload a GitHub Actions page.

## Behavior details

- The script runs on `document-idle`.
- It handles GitHub SPA navigation (`turbo:*`, history changes, and DOM mutations), so it keeps working while navigating inside the repo.
- If required GitHub selectors are missing, it disables itself and shows an alert instead of risking broken behavior.


