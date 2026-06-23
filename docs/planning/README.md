# docs/planning — canonical shared state for multi-AI work

These are the **canonical, git-tracked** copies of the capital-management pivot plan and the
multi-AI collaboration rules. Edit them **here**, in the repo. Copilot's private memory
(`~/Library/.../GitHub.copilot-chat/memory-tool/memories/repo/`) holds mirror copies that point
back to these files — if the two ever diverge, **this directory wins**.

| File | What it is |
|------|------------|
| `EXECUTION_PLAN.md` | Single source of truth: the capital-management execution plan (v2, crosschecked). Includes implementation status at the bottom. |
| `MULTI_AI_WORKFLOW.md` | Repo zones, task-assignment matrix, collaboration protocol. Read before starting any task. |
| `crosscheck-plan.md` | Draft 1 + Claude's review (historical record of how the plan was crosschecked). |

**Rule for any AI:** read `EXECUTION_PLAN.md` + `CLAUDE.md` before acting; after a code change run
`tsc --noEmit` (TS) or the script's smoke check (Python); after a D1 change verify with
`wrangler d1 execute ... --remote`.
