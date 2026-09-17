# GitHub Communication Workflow

## Roles

- **Owner (user):** sets business goals, approves scope-expanding decisions, and receives the final report.
- **ChatGPT:** designs the change, defines acceptance criteria, reviews the PR and evidence, and reports the decision to the Owner.
- **Gemini/Antigravity:** implements the approved scope on a branch, opens the PR, supplies verification evidence, and addresses review findings.

GitHub Issues and pull requests are the durable communication channel. Chat messages are only notifications; the issue and PR are the source of truth.

## Lifecycle

1. Owner opens an **Owner Request** issue.
2. ChatGPT adds a compact design comment: goal, in/out of scope, behavior, acceptance criteria, risks, and required checks. Apply `status:ready`.
3. Gemini creates a branch named `gemini/<issue-number>-<short-name>`, implements only that brief, and opens a PR linked to the issue. Apply `status:review`.
4. ChatGPT reviews the actual diff and evidence:
   - `CHANGES_REQUESTED`: list only actionable findings, each with file/line, impact, and expected result. Apply `status:changes-requested`.
   - `APPROVED`: record checks and residual risk. Apply `status:owner-decision`.
5. Owner receives a concise report and makes any required business decision. Merge only after approval and required checks.

## Token Budget Rules

- Link instead of repeating prior context.
- Communicate deltas only.
- Use file paths and line references instead of pasting code.
- One issue per business outcome; one PR per issue unless ChatGPT splits the work.
- Screenshots only for visual evidence that text cannot show.
- Never omit security, data, permissions, cost, or acceptance evidence to save tokens.

## Recommended Labels

- Roles: `role:owner`, `role:chatgpt`, `role:gemini`
- Status: `status:triage`, `status:ready`, `status:implementing`, `status:review`, `status:changes-requested`, `status:owner-decision`, `status:done`
- Risk: `risk:security`, `risk:data`, `risk:cost`, `risk:compliance`
- Type: `type:feature`, `type:bug`, `type:maintenance`

## Owner Report Format

```md
Outcome: APPROVED | CHANGES_REQUESTED | OWNER_DECISION_REQUIRED
Business value: <one sentence>
Delivered: <concise behavior delta>
Evidence: <issue/PR/check links>
Risk and cost: <none or concise list>
Owner action: <none, merge, or explicit decision>
```

## Safety

- Keep the repository private until security review confirms it is safe to publish.
- Never post credentials, tokens, customer records, employee data, or production database contents.
- Do not allow direct AI pushes to the protected default branch.
- Require pull-request review and passing checks before merge.
- The Owner alone authorizes changes to pricing, billing, production access, customer-data handling, or organization-wide permissions.

