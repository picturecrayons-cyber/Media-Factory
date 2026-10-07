# Crayons Bridge A2A Business Intelligence

This foundation defines a production-safe agent-to-agent layer for business growth: sales, marketing, market intelligence, partnerships, revenue reporting, and executive intelligence.

## Initial agents

| Agent | Purpose |
|---|---|
| Sales Intelligence | Lead qualification, account prioritisation, pipeline summaries |
| Marketing Intelligence | Campaign insights, audience signals, content opportunities |
| Market Intelligence | Competitor/category/trend research and opportunity briefs |
| Partnership Intelligence | Buyer, OTT, distributor and strategic partner discovery |
| Revenue Intelligence | Commercial performance and authoritative transaction reporting |
| Executive Intelligence | Cross-function decision briefs and alerts |

## Initial skills

- lead_qualification
- account_prioritisation
- campaign_intelligence
- market_opportunity
- partner_discovery
- revenue_summary
- executive_brief

## Safety boundary

This foundation is read-only. It does not bypass Bridge RBAC, Supabase RLS, payment controls, OCI controls, or release gates. No external AI provider is called by default, preventing hidden AI spend while contracts and permissions are established.

Future write-capable skills must define authorization, idempotency, audit events, approval state, and exact mutation before implementation.

## Execution model

1. Caller selects an agent and skill.
2. Gateway validates the skill against the registry.
3. Server resolves caller identity and authorization.
4. Skill receives typed input.
5. Skill returns typed output and evidence references.
6. Mutation-capable skills must audit before success.

## Production rule

This is a foundation, not full A2A production certification. Exact-head CI, authenticated E2E, authorization tests, and real business-data adapters remain required before production certification.
