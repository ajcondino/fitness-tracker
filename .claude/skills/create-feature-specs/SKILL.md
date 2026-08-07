---
name: creating-feature-specs
description: Creates or reviews implementation-ready feature specifications in docs/specs/<kebab-case-feature-name>/SPEC.md. Use when asked to plan, specify, scope, or review a feature before implementation, or when the user asks for a SPEC file.
---

# Creating Feature Specifications

Create a repository-aware implementation plan as a `SPEC.md` file. This is a planning task: inspect the codebase and write the specification, but do not implement the feature unless the user separately asks for implementation.

## Workflow

1. Read the repository's applicable guidance files, especially `AGENTS.md`.
2. Read relevant product requirements, architecture documentation, and existing `docs/specs/**/SPEC.md` files. Prefer the repository's established conventions when they differ from the generic template below.
3. Inspect the current code paths, types, tests, configuration, and dependencies affected by the feature. Cross-reference actual symbols and files; do not infer the design from filenames alone.
4. Resolve details that can be answered from the repository. Ask a focused question only when missing information would materially alter scope, behavior, or architecture.
5. Choose the smallest coherent design that meets the requested outcome. Identify explicit non-goals and avoid speculative abstractions.
6. Write the finished plan to `docs/specs/<kebab-case-feature-name>/SPEC.md`. Create the directories when needed.
7. Review the finished document against the checklist below and report the path created or updated.

## Required Structure

Use every section, in this order:

```markdown
# Feature: [Name]

## Intent

One concise statement of the outcome when the work is complete.

## Context

- **Problem statement:** What is missing or incorrect today, supported by repository evidence.
- **Current code:** Relevant existing behavior, symbols, and ownership boundaries.
- **User impact:** What changes for users or maintainers.
- **Dependencies:** Prerequisites, related features, packages, services, or migrations.

## Data Model

- New or changed types and interfaces.
- Database or persistence changes.
- Relationships to existing models and important invariants.

## Interfaces / API

- Public functions, classes, commands, endpoints, or events.
- Input/output contracts, defaults, errors, and compatibility behavior.

## Files Created

| File           | Purpose                  |
| -------------- | ------------------------ |
| `path/to/file` | Why this file is needed. |

## Files Modified

| File                    | Change                |
| ----------------------- | --------------------- |
| `path/to/existing-file` | What changes and why. |

## Implementation Steps

1. Ordered, concrete implementation step.
2. Include test work near the behavior it verifies.
3. End with repository-appropriate verification commands.

## Style & Conventions

- Cite applicable repository guidance and established local patterns.
- Call out and justify any deliberate deviation.

## Acceptance Criteria

- [ ] Concrete, externally observable or testable outcome.
- [ ] Relevant automated tests cover success and edge cases.
- [ ] Repository-required validation passes.

## Constraints

- Scope boundaries, non-goals, compatibility requirements, and operational caveats.
```

## Writing Rules

- Always use the path `docs/specs/<kebab-case-feature-name>/SPEC.md` unless the repository clearly establishes another SPEC location or naming convention.
- Never omit a required section. Write `N/A — <brief reason>` when a section does not apply. For an inapplicable file table, include one `N/A` row and explain why.
- Base statements about current behavior on inspected code or documentation. Name exact files and symbols where useful.
- Distinguish confirmed facts from decisions that must be verified during implementation.
- Make interfaces concrete enough to implement: include signatures, data shapes, defaults, error behavior, and migration implications when relevant.
- List only files justified by the design. Do not create placeholder modules or abstractions without a clear responsibility.
- Make implementation steps dependency-ordered and specific, but do not paste implementation code.
- Make every acceptance criterion independently checkable. Include exact lint, type-check, test, build, or smoke-test commands used by the repository.
- Record meaningful constraints and non-goals so implementation does not silently expand in scope.
- Do not modify application code while creating or reviewing the specification.

## Review Checklist

Before finishing, confirm:

- The intent describes an outcome, not a task list.
- The context matches the repository's current state.
- Data and API contracts are internally consistent.
- Every created or modified file is supported by an implementation step.
- Tests cover key behavior, edge cases, and regressions.
- Acceptance criteria verify the stated intent.
- Constraints identify important non-goals and unresolved external facts.
- All required sections are present in the required order.
