---
name: local-review
description: "Review local uncommitted changes using multiple specialized agents with confidence-based scoring. Use when you want a thorough code review of staged/unstaged changes before committing."
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*), Read, Grep, Glob, Task
argument-hint: [--staged]
---

Review local uncommitted changes in the current repository.

If `--staged` argument is provided, only review staged changes (`git diff --cached`). Otherwise review all uncommitted changes (`git diff` and `git diff --cached`).

**Agent assumptions (applies to all agents and subagents):**
- All tools are functional and will work without error. Do not test tools or make exploratory calls.
- Only call a tool if it is required to complete the task. Every tool call should have a clear purpose.

Follow these steps precisely:

1. Launch a haiku agent to check:
   - Run `git status` to verify there are uncommitted changes
   - If `--staged` was provided, check that there are staged changes specifically
   - If there are no relevant changes, stop and report "No changes to review."

2. Launch a haiku agent to return a list of file paths (not their contents) for all relevant CLAUDE.md files including:
   - The root CLAUDE.md file, if it exists
   - Any CLAUDE.md files in directories containing modified files

3. Launch a sonnet agent to view the diff and return a summary of all changes. Use `git diff` for unstaged, `git diff --cached` for staged, or both if reviewing all changes. Include file names, what changed, and the apparent intent.

4. Launch 5 agents in parallel to independently review the changes. Each agent should return a list of issues, where each issue includes:
   - File path and line number(s)
   - Description of the issue
   - Reason it was flagged (e.g. "CLAUDE.md adherence", "bug", "security")
   - Confidence score (0-100)

   The agents:

   Agents 1 + 2: CLAUDE.md compliance sonnet agents
   Audit changes for CLAUDE.md compliance in parallel. Only consider CLAUDE.md files that share a file path with the changed file or its parents.

   Agent 3: Opus bug agent (parallel with agent 4)
   Scan for obvious bugs in the diff itself. Focus only on the changed code. Flag only significant bugs; ignore nitpicks and likely false positives. Do not flag issues that cannot be validated without extensive context beyond the diff.

   Agent 4: Opus bug agent (parallel with agent 3)
   Look for problems in the introduced code: security issues, incorrect logic, type errors, missing error handling at system boundaries. Only look for issues within the changed code.

   Agent 5: Opus architecture & abstraction agent
   Review the changes for architectural drift, duplication, and abstraction issues. This agent must read beyond the diff — it should explore the surrounding codebase to find existing patterns, utilities, and abstractions that the new code should be using.

   Specifically, this agent should:

   - **Detect duplication and DRY violations**: Search the codebase for existing functions, utilities, helpers, or patterns that do the same thing (or nearly the same thing) as newly introduced code. Flag cases where the author has reimplemented something that already exists in the codebase. Include the file path and function name of the existing implementation in the issue.
   - **Identify missed abstractions**: If the same logic or pattern now appears in 3+ places (including the new code), flag it as a candidate for extraction into a shared utility or function. Be specific about which locations contain the duplicated logic.
   - **Check architectural consistency**: Read the project's architecture docs (docs/architecture.md, CLAUDE.md, any relevant design docs) and verify that the new code follows established patterns. Flag deviations such as:
     - Business logic placed in route handlers or job processors instead of shared packages
     - Direct database access from places that should go through the query layer
     - New dependencies or patterns that contradict documented architectural decisions
     - Code placed in the wrong package or directory given the monorepo structure
   - **Flag structural anti-patterns**: Identify cases where the new code introduces:
     - God functions or files that do too many things
     - Tight coupling between modules that should be independent
     - Circular or unexpected dependency directions between packages
     - Inline constants or configuration that should be centralized

   Do NOT flag:
   - Minor naming inconsistencies
   - Cases where 2 similar-looking snippets serve genuinely different purposes
   - Abstractions that would be premature (only one or two instances of a pattern)
   - Architectural preferences not documented in the project's architecture docs

   This agent should use Glob, Grep, and Read tools extensively to understand the existing codebase before making judgments. Every issue must reference specific existing code (file path + line/function) that demonstrates the pattern being violated or duplicated.

   **CRITICAL: We only want HIGH SIGNAL issues.** Flag issues where:
   - The code will fail to compile or parse (syntax errors, type errors, missing imports, unresolved references)
   - The code will definitely produce wrong results regardless of inputs (clear logic errors)
   - Security vulnerabilities in the changed code (injection, XSS, exposed secrets, etc.)
   - Clear, unambiguous CLAUDE.md violations where you can quote the exact rule being broken
   - New code duplicates an existing utility or function that should be reused (must cite the existing implementation)
   - New code violates a documented architectural decision (must cite the specific doc and rule)

   Do NOT flag:
   - Code style or quality concerns
   - Potential issues that depend on specific inputs or state
   - Subjective suggestions or improvements
   - Pre-existing issues in unchanged code
   - Issues a linter would catch
   - Pedantic nitpicks a senior engineer would not flag

   If you are not certain an issue is real, do not flag it.

5. For each issue found in step 4 with confidence >= 60, launch parallel subagents to validate. Each subagent receives the issue description and relevant file context. The agent's job is to read the actual source file and validate the issue is real. Use Opus subagents for bugs/logic/security/architecture issues, sonnet for CLAUDE.md violations.

6. Filter out any issues that were not validated in step 5, or that scored below 80 confidence after validation. This gives the final list of high-signal issues.

7. Output a summary of the review findings to the terminal:

   If no issues were found:
   ```
   ## Local Review

   No issues found. Checked for bugs, security, architecture, and CLAUDE.md compliance.

   Files reviewed:
   - <list of changed files>
   ```

   If issues were found:
   ```
   ## Local Review

   Found <N> issue(s) in <N> file(s):

   ### <file_path>

   **Line <N>** — <category> (confidence: <score>)
   <description of the issue>

   <suggested fix if applicable>

   ---

   Files reviewed:
   - <list of changed files>
   ```

   Sort issues by confidence (highest first), then by file path.
