// Medium complexity: real multi-turn chat builds. Each turn re-sends the full
// conversation, so the cached share grows organically turn over turn.

const SYS_BUILDER = `You are a senior engineer pair-programming with a user through chat.

How you work:
- You build real, working code iteratively — each reply advances the project.
- Keep replies focused: brief explanation plus the code or diff for this step.
- When the user reports a bug, diagnose first, then give the minimal fix.
- Prefer complete, runnable snippets over fragments when a file changes a lot.
- Plain, friendly tone. No filler, no restating the question.
- Use markdown code fences with language tags.

Context:
- The user runs everything locally and pastes errors back to you.
- Target modern browsers / Python 3.12 as appropriate.`;

export const MEDIUM = [
  {
    id: "expense-tracker",
    system: SYS_BUILDER,
    turns: [
      "Let's build a small expense tracker as a single HTML page. Start with an input row for amount + category + note, and a list of expenses below. Keep it clean and minimal.",
      "Add a total at the bottom that sums all expenses, and format amounts as currency.",
      "Add a delete button on each expense row.",
      "Add a category filter dropdown (All, Food, Transport, Fun, Other) that filters the list.",
      "Add localStorage persistence so expenses survive a reload.",
      "Here's a bug: when I delete an expense after filtering, the wrong row gets removed. The list index doesn't match. Fix it.",
      "Add a small bar chart of spending per category using pure CSS, no libraries.",
      "Finally, polish the styling: dark theme, rounded cards, and a nicer font stack.",
    ],
  },
  {
    id: "csv-cleaner",
    system: SYS_BUILDER,
    turns: [
      "Let's write a Python CLI that cleans CSV files. Start: read a CSV path from argv, drop fully-empty rows, print row count before and after.",
      "Add a --trim flag that strips whitespace from every cell.",
      "Add duplicate-row detection: print how many duplicate rows exist, and a --dedupe flag to remove them keeping the first occurrence.",
      "Add column type guessing: for each column report whether it looks numeric, a date, or text.",
      "Here's an error I get: csv.field_size_limit exceeded on a big file. Fix it robustly.",
      "Add a --fix-dates flag that normalizes date-like columns to ISO format.",
      "Add a summary mode that prints a small per-column report table.",
      "Finish with a usage docstring and make the whole thing pip-installable with a pyproject.toml.",
    ],
  },
  {
    id: "chrome-extension",
    system: SYS_BUILDER,
    turns: [
      "Let's build a Manifest V3 Chrome extension that shows the word count of any selected text in the page. Start with manifest.json and a content script.",
      "Show the count in a small floating badge near the selection instead of an alert.",
      "Add character count alongside word count.",
      "Add an options page with a toggle to switch the badge position (top-right vs bottom-right of selection).",
      "Bug: on pages with dark backgrounds the badge is unreadable. Give it an adaptive style.",
      "Add reading time estimate (200 wpm) to the badge.",
      "Persist the badge-position setting with chrome.storage and make the content script react to changes live.",
      "Wrap up: write the store-listing description and a privacy note (we collect nothing).",
    ],
  },
];
