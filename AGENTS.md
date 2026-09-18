<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-FileCopyrightText: 2026 XeniaCloud
  - SPDX-License-Identifier: MIT
-->

## Nextcloud Contribution Policy

> **Fork amendment (Krateos-BV).** This file is inherited from upstream
> `nextcloud/talk-desktop`. In this fork, work is reviewed on the pull request
> itself rather than before it is opened, so the agent opens its own PRs and
> writes their descriptions (see "What this agent may do in this fork"). Every
> other rule below stands unchanged. **This amendment applies only to pull
> requests targeting branches of `Krateos-BV/talk-desktop`.** Anything destined
> for an upstream `nextcloud/*` repository follows the unmodified upstream
> policy, where a human opens the PR and writes it in their own words.

All contributions generated or assisted by this agent must fully comply with:

- **[AI Contribution Policy](https://github.com/nextcloud/.github/blob/master/AI_POLICY.md)** - the primary reference for AI-specific rules, covering disclosure, author accountability, communication, security, licensing, code quality, and autonomous agent behavior.
- **[Contribution Guidelines](https://github.com/nextcloud/.github/blob/master/CONTRIBUTING.md)** - covering testing requirements, the Developer Certificate of Origin (DCO), license headers, conventional commits, and translations. These apply in full to all contributions regardless of how they were produced.

### What this agent must always do

- Add an `Assisted-by: AGENT_NAME:MODEL_VERSION` git trailer to every commit containing AI-assisted content.
- Ensure every pull request includes a disclosure of AI tool use in the PR description.
- Produce focused, scoped pull requests that address exactly one concern. Do not touch unrelated files or introduce incidental refactors.
- Verify all dependencies against actual package registries before suggesting them. Do not use hallucinated or unverified package names.
- Explicitly inform the contributor when any action they are about to take, or have taken, would violate the AI Contribution Policy or the Contribution Guidelines. Do not silently proceed. State which rule is at risk and what the contributor should do instead.
- Warn the contributor if a pull request is growing too large. A PR approaching several thousand lines of changed code is a signal that it should be split into smaller, focused PRs. Suggest a logical split before the PR is opened, not after.
- Recommend opening a ticket for discussion before starting implementation whenever a feature or change is sufficiently complex - for example when it touches multiple subsystems, requires architectural decisions, or the right approach is not yet clear. A ticket allows maintainers and the contributor to align on direction before code is written, avoiding wasted effort on a PR that may be rejected or require fundamental rework.

### What this agent must never do

- Send security reports autonomously, or submit anything to an upstream `nextcloud/*` repository without a human opening it. (Issues and pull requests *within this fork* are covered by the fork amendment above.)
- Add `Signed-off-by` tags to commits. Only the human contributor can certify the Developer Certificate of Origin.
- Generate or submit security reports without independent human verification. Report verified vulnerabilities via [HackerOne](https://hackerone.com/nextcloud), not as GitHub issues.
- Write review comments on behalf of the contributor, or put words in the contributor's mouth anywhere. Agent-authored PR descriptions in this fork are the agent's own words, and are labelled as such.
- Fully automate the resolution of issues labeled [`good first issue`](https://github.com/issues?q=org%3Anextcloud+label%3A%22good+first+issue%22) or similar beginner-friendly labels.
- Submit code that has not been reviewed and cleaned up by the contributor. Dead code, redundant logic, excessive comments, and unrelated changes must be removed before submission.

### What this agent may do in this fork

- Open issues and pull requests against `Krateos-BV/talk-desktop` without waiting
  for a human to do it, and write the PR description itself. The description must
  still disclose AI tool use, and must say plainly what was verified and what was
  not, so the reviewer can tell evidence from assertion.
- This does not relax the DCO rule above. The agent still never adds
  `Signed-off-by` - only the human contributor can certify it.
