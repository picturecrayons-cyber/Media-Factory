# A2A Agents Directory & Implementation Guide

Welcome to the central registry and implementation guide for Agent-to-Agent (A2A) agents. This document describes suggested agent roles and orchestration patterns; agent handles below are conventions, not proof that separate runtime agents are installed or available.

## Core System Agents

### 1. Research & Synthesis Agent — `@agent.research`

- **Suggested role:** Web research, source synthesis, fact-checking, citations, and structured summaries.
- **Useful for:** Background research, competitor analysis, and summarizing lengthy documents.
- **Execution note:** Use a connected browsing/search capability and preserve source URLs and dates for factual claims.

### 2. Code & Engineering Agent — `@agent.coder`

- **Suggested role:** Code generation, debugging, architecture, tests, and refactoring.
- **Useful for:** Prototypes, single-file applications, troubleshooting, and implementation planning.
- **Execution note:** Validate generated code with tests, static checks, and a build before deployment. Do not represent unrun tests as passing.

### 3. Writing & Editorial Agent — `@agent.editor`

- **Suggested role:** Proofreading, structural review, tone calibration, and rubric-based feedback.
- **Useful for:** Business communications, proposals, documentation, and creative work.
- **Execution note:** Keep editorial changes separate from factual verification.

### 4. Location & Geospatial Agent — `@agent.geo`

- **Suggested role:** Place discovery, local search, route planning, and geographic analysis.
- **Useful for:** Local points of interest, itineraries, and location-based comparisons.
- **Execution note:** Use an approved maps or places provider and verify current hours, availability, and route details.

## Specialized Utility Agents

### 5. Media & Multimedia Agent — `@agent.media`

- **Suggested role:** Video search, playlist curation, media metadata, and audiovisual reference management.
- **Useful for:** Tutorial discovery and indexing media resources.
- **Execution note:** Availability depends on connected media/search tools and access permissions.

### 6. Workflow & Orchestrator Agent — `@agent.orchestrator`

- **Suggested role:** Decomposing requests, coordinating specialist steps, collecting outputs, and tracking workflow state.
- **Useful for:** Multi-step work that benefits from sequential or parallel contributions.
- **Execution note:** The orchestrator must check capabilities and authorization before dispatch, record each step's status, and surface tool errors honestly.

## Invocation Patterns

The following examples are illustrative payloads for an application that implements an agent router. They will not invoke agents by themselves in a plain prompt or repository file.

### Method 1: JSON payload

```json
{
  "target_agent": "@agent.coder",
  "action": "generate",
  "parameters": {
    "language": "python",
    "constraint": "single-file"
  }
}
```

Your application must validate the target handle, supported action, parameter schema, authentication, and permission scope before dispatching the request.

### Method 2: Natural-language routing

Examples for an orchestrator or human operator:

- `@agent.research`: Gather recent benchmarks on LLM reasoning latency and provide source links.
- `@agent.geo`: Find well-reviewed cafés near a specified downtown area and verify current details.
- `@agent.editor`: Review this proposal for clarity, structure, and tone.
- `@agent.coder`: Draft an implementation and tests for the approved requirements.

A handle is only a routing label unless an execution layer explicitly registers and resolves it.

### Method 3: Multi-agent orchestration

```json
{
  "target_agent": "@agent.orchestrator",
  "workflow": [
    {
      "step": 1,
      "agent": "@agent.research",
      "task": "Gather requirements and cite sources"
    },
    {
      "step": 2,
      "agent": "@agent.coder",
      "task": "Propose an implementation based on verified requirements"
    },
    {
      "step": 3,
      "agent": "@agent.editor",
      "task": "Review the implementation notes for clarity and completeness"
    }
  ]
}
```

Recommended orchestration controls:

1. Define typed inputs and outputs for every step.
2. Pass only the minimum context and secrets each step needs; never place credentials in prompts or logs.
3. Set timeouts, retry limits, and an overall workflow deadline.
4. Require human approval for production writes, deployment, payments, or destructive actions.
5. Capture step status, tool errors, timestamps, and evidence.
6. Validate outputs before passing them to the next step; do not treat generated claims as verified facts.
7. Make retried side effects idempotent where possible.

## Capability Registry Checklist

Before marking an agent as online or ready, verify:

- A registered implementation and supported version exist.
- Required tools, credentials, and permissions are available.
- Health checks and a minimal end-to-end test pass.
- Timeouts, errors, and unavailable-tool behavior are handled.
- Audit logging avoids secrets and sensitive payloads.
- Production actions are guarded by explicit authorization and release gates.

Suggested statuses: **Verified** (health check and test passed), **Configured** (registered but not fully tested), **Unavailable** (missing or failing dependency), and **On demand** (not started until requested). Do not claim real-time availability unless checked.

## GitHub: Add This Guide

This guide is intended for an existing repository. Confirm the target repository and default branch first, then add `a2a_agents_directory.md` through the repository's normal review and release process. Do not run `git init` or add a new remote when working in an established repository.

If using a local checkout:

```bash
git status
git add a2a_agents_directory.md
git commit -m "Add A2A Agents Directory & Implementation Guide"
git push origin HEAD
```

Review the diff before committing. Follow the repository's required CI and pull-request policy; do not bypass checks for production code.

---

**Ownership and maintenance:** The repository maintainers should update this directory whenever agent registrations, capabilities, permissions, or health-check behavior changes.


## Python Client SDK Example

The following is a minimal HTTP client template for an A2A gateway you operate. It performs a real HTTP request only when configured with a real endpoint and bearer token; it does not simulate a successful agent run. The endpoint and request schema must match your gateway's API.

Install dependency:

```bash
python -m pip install requests
```

Set configuration through environment variables rather than hard-coding credentials:

```bash
# Linux/macOS shell examples; use your platform's equivalent on Windows.
export A2A_ENDPOINT="https://your-agent-gateway.example/v1/invoke"
export A2A_API_TOKEN="replace-with-a-real-secret"
```

Save as `a2a_client.py`:

```python
import os
import requests


class A2AClient:
    def __init__(self, endpoint_url=None, api_token=None, timeout=30):
        self.endpoint_url = endpoint_url or os.environ.get("A2A_ENDPOINT")
        self.api_token = api_token or os.environ.get("A2A_API_TOKEN")
        self.timeout = timeout

        if not self.endpoint_url:
            raise ValueError("A2A_ENDPOINT is required")
        if not self.api_token:
            raise ValueError("A2A_API_TOKEN is required")

    def send_task(self, target_agent, action, parameters):
        payload = {
            "target_agent": target_agent,
            "action": action,
            "parameters": parameters,
        }
        response = requests.post(
            self.endpoint_url,
            json=payload,
            headers={"Authorization": f"Bearer {self.api_token}"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()


if __name__ == "__main__":
    client = A2AClient()
    result = client.send_task(
        target_agent="@agent.coder",
        action="generate",
        parameters={"language": "python", "constraint": "single-file"},
    )
    print(result)
```

**Before using this client:** confirm the gateway URL, authentication scheme, accepted payload, response format, and permitted agent handles with the gateway owner. Treat returned data as untrusted input, avoid logging secrets, and do not send production credentials or sensitive data to an unverified endpoint.
