// High complexity: agentic tool-loop builds. Each step re-sends the system
// prompt, tool definitions, and the entire trajectory — the pattern where
// caching matters most.

const SYS_AGENT = `You are an autonomous engineering agent building a small project in a sandboxed workspace.

You have four tools: write_file, read_file, run_command, finish.

How you work:
- Exactly ONE tool call per step. Never batch actions.
- Break the work into small verifiable steps: scaffold, implement, test, fix, polish.
- After writing code, run the project's tests with run_command before finishing.
- If a test fails, read the relevant file, diagnose, and write a fix.
- Keep each file focused and readable; total project under 400 lines.
- When everything works and tests pass, call finish with a one-paragraph summary.

Environment notes:
- The workspace is ephemeral. write_file overwrites silently. run_command output is simulated but truthful about test counts.
- Do not ask questions; make reasonable decisions and proceed.`;

export const HIGH = [
  {
    id: "todo-app",
    system: SYS_AGENT,
    task: `Build a dependency-free Node.js todo CLI in the workspace.

Requirements:
- todo.js with commands: add "task", list, done <n>, remove <n>
- Tasks persist to todos.json next to the script
- list shows numbered tasks with [x]/[ ] markers
- Unknown commands print usage
- Include test.js with at least 3 assertions run via run_command "node test.js"

When tests pass, finish.`,
  },
  {
    id: "api-client",
    system: SYS_AGENT,
    task: `Build a tiny JavaScript API client library for a fictional JSON placeholder service.

Requirements:
- index.js exporting a createClient(baseUrl) factory
- Methods: get(path), post(path, body) using fetch, with JSON encoding/decoding
- Errors: non-2xx responses throw an ApiError with .status and .body
- A 5-second timeout via AbortController
- test.js with at least 3 assertions about behavior (mock fetch as needed), run via run_command "node test.js"

When tests pass, finish.`,
  },
  {
    id: "data-pipeline",
    system: SYS_AGENT,
    task: `Build a small Python data-pipeline script.

Requirements:
- pipeline.py reading a list of {{"city", "temp_c"}} records from an inline SAMPLE list
- Steps: validate (reject non-numeric temps), convert to Fahrenheit, aggregate min/max/avg per city, write report.json
- A --json CLI flag is not needed; always write report.json and print a summary line
- Include test_pipeline.py with at least 3 assertions, run via run_command "python3 test_pipeline.py"

When tests pass, finish.`,
  },
];
