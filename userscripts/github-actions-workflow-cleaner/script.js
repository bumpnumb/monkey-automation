// ==UserScript==
// @name         GitHub Actions Workflow Cleaner
// @namespace    daniels-utils
// @version      0.2.0
// @description  Expand GitHub Actions workflows, hide disabled workflows, and add workflow search.
// @author       Daniel Fennhagen
// @match        https://github.com/*/*/actions*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // If GitHub changes markup, pray that we can update selectors here instead of rewriting the search logic.
  const SELECTORS = {
    workflowList: "ul.ActionListWrap", // Parent list containing workflow navigation items.
    workflowItem: 'li[data-test-selector="workflow-rendered"]', // Individual workflow entry in the left navigation.
    workflowLabel: ".ActionListItem-label", // Visible text label for a workflow item.
    workflowLink: "a[href]", // Clickable link inside a workflow item used for navigation.
    workflowTrailingStatus: ".ActionListItem-visual--trailing", // Trailing status text (for example "Disabled").
    showMoreItem: '[data-target="nav-list-group.showMoreItem"][src*="workflows_partial"]', // Pagination placeholder containing fetch metadata for additional workflow pages.
    allWorkflowsItem: 'li[data-item-id="all_workflows"]', // Static "All workflows" anchor item used as insertion context.
    sectionDivider: "li.ActionList-sectionDivider", // Divider after the static section where the search UI is inserted.
  };

  const IDS = {
    searchWrapper: "gh-actions-workflow-search-wrapper",
    searchInput: "gh-actions-workflow-search",
  };

  const STYLES = {
    selectedWorkflowBackground: "var(--button-primary-bgColor-hover, #dafbe1)",
  };

  // Matches only pages that render the workflow sidebar:
  //   /{owner}/{repo}/actions
  //   /{owner}/{repo}/actions/workflows/*
  // Excludes run/job detail pages such as /actions/runs/... and /actions/new.
  const ACTIONS_LIST_PAGE_PATTERN = /^\/[^\/]+\/[^\/]+\/actions(\/workflows\/[^\/]*)?\/?$/;
  // And you may ask, why not just put this in the @match pattern? Because GitHub uses turbo SPA navigation.

  function isActionsListPage() {
    return ACTIONS_LIST_PAGE_PATTERN.test(window.location.pathname);
  }

  let observer = null;
  let isApplying = false;
  let lastExpandedUrl = null;
  let isScriptDisabled = false;
  let hasShownUpdateAlert = false;
  let selectedWorkflowIndex = 0; // Index of the currently highlighted workflow (0 = first item)

  function debounce(fn, delay = 150) {
    let timeoutId = null;

    return (...args) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => fn(...args), delay);
    };
  }

  function disableScriptWithAlert(missingSelectorDetails) {
    if (isScriptDisabled) {
      return;
    }

    isScriptDisabled = true;

    if (observer) {
      observer.disconnect();
    }

    console.error(
      "[GitHub Actions Workflow Cleaner] Required selectors are missing. Script stopped until updated.",
      missingSelectorDetails
    );

    if (!hasShownUpdateAlert) {
      hasShownUpdateAlert = true;
      window.alert(
        "GitHub Actions Workflow Cleaner needs updating: required page elements were not found. The script has been stopped to avoid breaking behavior."
      );
    }
  }

  function validateSelectorsOrAbort() {
    const requiredSelectors = [
      {
        key: "workflowList",
        selector: SELECTORS.workflowList,
        description: "Workflow list container",
      },
      {
        key: "workflowItem",
        selector: SELECTORS.workflowItem,
        description: "Workflow list item",
      },
      {
        key: "allWorkflowsItem",
        selector: SELECTORS.allWorkflowsItem,
        description: "All workflows anchor item",
      },
      {
        key: "sectionDivider",
        selector: SELECTORS.sectionDivider,
        description: "Section divider near search insertion point",
      },
    ];

    const missing = [];

    for (const { key, selector, description } of requiredSelectors) {
      if (!document.querySelector(selector)) {
        missing.push({ key, selector, description });
      }
    }

    const sampleWorkflowItem = document.querySelector(SELECTORS.workflowItem);

    if (
      sampleWorkflowItem &&
      !sampleWorkflowItem.querySelector(SELECTORS.workflowLabel)
    ) {
      missing.push({
        key: "workflowLabel",
        selector: SELECTORS.workflowLabel,
        description: "Workflow item label inside workflow entry",
      });
    }

    if (missing.length > 0) {
      disableScriptWithAlert(missing);
      return false;
    }

    return true;
  }

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getWorkflowName(workflowItem) {
    const label = workflowItem.querySelector(SELECTORS.workflowLabel);
    return normalizeText(label?.textContent || workflowItem.textContent);
  }

  function isDisabledWorkflow(workflowItem) {
    const trailingText = workflowItem.querySelector(SELECTORS.workflowTrailingStatus)?.textContent;
    return normalizeText(trailingText) === "disabled";
  }

  function getWorkflowItems() {
    return Array.from(document.querySelectorAll(SELECTORS.workflowItem));
  }

  function getWorkflowListContainer() {
    const workflowItem = document.querySelector(SELECTORS.workflowItem);
    return workflowItem?.closest(SELECTORS.workflowList) || null;
  }

  function getSearchQuery() {
    return normalizeText(document.getElementById(IDS.searchInput)?.value || "");
  }

  function resetSelectedWorkflow() {
    selectedWorkflowIndex = 0;
  }

  function selectNextWorkflow() {
    const visibleItems = getVisibleWorkflowItems();

    if (visibleItems.length === 0) {
      return;
    }

    selectedWorkflowIndex = (selectedWorkflowIndex + 1) % visibleItems.length;
    updateWorkflowHighlight();
  }

  function clearWorkflowHighlights() {
    for (const item of getWorkflowItems()) {
      item.style.backgroundColor = "";
    }
  }

  function getSelectedWorkflowItem() {
    const visibleItems = getVisibleWorkflowItems();

    if (visibleItems.length === 0) {
      return null;
    }

    return visibleItems[selectedWorkflowIndex % visibleItems.length] || null;
  }

  function updateWorkflowHighlight() {
    const query = getSearchQuery();
    clearWorkflowHighlights();

    // Highlight the appropriate visible workflow item if searching
    if (query) {
      const itemToHighlight = getSelectedWorkflowItem();
      if (itemToHighlight) {
        itemToHighlight.style.backgroundColor = STYLES.selectedWorkflowBackground;
      }
    }
  }

  function applyWorkflowFilter() {
    const query = getSearchQuery();

    for (const item of getWorkflowItems()) {
      const disabled = isDisabledWorkflow(item);
      const name = getWorkflowName(item);
      const matchesSearch = !query || name.includes(query);

      item.hidden = disabled || !matchesSearch;
    }

    resetSelectedWorkflow();
    updateWorkflowHighlight();
  }

  function getVisibleWorkflowItems() {
    return getWorkflowItems().filter((item) => !item.hidden);
  }

  function navigateToSelectedWorkflow() {
    const selectedItem = getSelectedWorkflowItem();

    if (!selectedItem) {
      return;
    }

    const workflowLink = selectedItem.querySelector(SELECTORS.workflowLink);

    if (workflowLink instanceof HTMLAnchorElement && workflowLink.href) {
      console.info(
        "[GitHub Actions Workflow Cleaner] Navigating to selected workflow",
        workflowLink.href
      );
      workflowLink.click();
      return;
    }

    selectedItem.click();
  }

  async function expandAllWorkflows() {
    const showMore = document.querySelector(SELECTORS.showMoreItem);

    if (!showMore) {
      return;
    }

    const src = showMore.getAttribute("src");
    const currentPage = Number(showMore.getAttribute("data-current-page") || "1");
    const totalPages = Number(showMore.getAttribute("data-total-pages") || "1");

    if (!src || !Number.isFinite(currentPage) || !Number.isFinite(totalPages)) {
      return;
    }

    const expansionKey = `${window.location.pathname}|${src}|${currentPage}|${totalPages}`;

    if (lastExpandedUrl === expansionKey) {
      return;
    }

    lastExpandedUrl = expansionKey;

    if (currentPage >= totalPages) {
      showMore.hidden = true;
      return;
    }

    const workflowList = getWorkflowListContainer();

    if (!workflowList) {
      return;
    }

    const existingWorkflowIds = new Set(
      getWorkflowItems()
        .map((item) => item.getAttribute("data-item-id"))
        .filter(Boolean)
    );

    for (let page = currentPage + 1; page <= totalPages; page += 1) {
      const url = new URL(src, window.location.origin);
      url.searchParams.set("page", String(page));

      console.info(
        `[GitHub Actions Workflow Cleaner] Expanding workflows: requesting page ${page}/${totalPages}`,
        url.toString()
      );

      const response = await fetch(url.toString(), {
        credentials: "same-origin",
        headers: {
          Accept: "text/html",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      if (!response.ok) {
        console.warn(
          `[GitHub Actions Workflow Cleaner] Failed to fetch workflows page ${page}`,
          response.status
        );
        continue;
      }

      const html = await response.text();

      const template = document.createElement("template");
      template.innerHTML = html.trim();

      const newWorkflowItems = Array.from(
        template.content.querySelectorAll(SELECTORS.workflowItem)
      );

      for (const item of newWorkflowItems) {
        const itemId = item.getAttribute("data-item-id");

        if (itemId && existingWorkflowIds.has(itemId)) {
          continue;
        }

        if (itemId) {
          existingWorkflowIds.add(itemId);
        }

        workflowList.appendChild(item);
      }
    }

    showMore.setAttribute("data-current-page", String(totalPages));
    showMore.hidden = true;
  }

  function createSearchBar() {
    if (document.getElementById(IDS.searchWrapper)) {
      return;
    }

    const allWorkflowsItem = document.querySelector(SELECTORS.allWorkflowsItem);
    const divider = allWorkflowsItem?.parentElement?.querySelector(SELECTORS.sectionDivider);

    if (!allWorkflowsItem || !divider) {
      return;
    }

    const wrapper = document.createElement("li");
    wrapper.id = IDS.searchWrapper;
    wrapper.style.paddingTop = "4px";

    const input = document.createElement("input");
    input.id = IDS.searchInput;
    input.type = "search";
    input.placeholder = "Search workflows...";

    input.style.width = "100%";
    input.classList.add("form-control");

    input.addEventListener("input", debounce(() => {
      applyWorkflowFilter();
    }, 100));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        navigateToSelectedWorkflow();
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        selectNextWorkflow();
        return;
      }
    });

    wrapper.appendChild(input);

    divider.parentElement.insertBefore(wrapper, divider);
    resetSelectedWorkflow();
    updateWorkflowHighlight();
    input.focus();
  }

  async function enhanceActionsPage() {
    if (!isActionsListPage()) {
      return;
    }

    if (isScriptDisabled) {
      return;
    }

    if (!validateSelectorsOrAbort()) {
      return;
    }

    if (isApplying) {
      return;
    }

    isApplying = true;

    try {
      createSearchBar();
      await expandAllWorkflows();
      applyWorkflowFilter();
    } finally {
      isApplying = false;
    }
  }

  function setupObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(
      debounce(() => {
        enhanceActionsPage();
      }, 250)
    );

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function setupSpaNavigationHooks() {
    document.addEventListener("turbo:load", enhanceActionsPage);
    document.addEventListener("turbo:frame-load", enhanceActionsPage);
    document.addEventListener("turbo:render", enhanceActionsPage);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      window.setTimeout(enhanceActionsPage, 300);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      window.setTimeout(enhanceActionsPage, 300);
    };

    window.addEventListener("popstate", () => {
      window.setTimeout(enhanceActionsPage, 300);
    });
  }

  setupSpaNavigationHooks();
  setupObserver();
  enhanceActionsPage();
})();