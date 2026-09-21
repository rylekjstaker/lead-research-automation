# Amanecer AI Monday leads

This Trigger.dev task runs Mondays at 8:00 a.m. Mountain time. It uses three
SerpApi Google Maps searches, checks every task in the **Amanecer AI Leads**
ClickUp List (including closed and archived tasks), and creates up to five new
lead tasks with a fit score, sources, discovery questions, and a draft outreach
message for human review.

It does not send outreach or make claims that a business has missed calls.
Missed-call volume and CRM access are discovery questions.

## Local credentials

- `RylekSecondBrain/.env`: `SERPAPI_API_KEY`, `CLICKUP_API_TOKEN`, and
  `TRIGGER_AMANECER_LEADS_DEV_SECRET_KEY`.
- This folder's `.env`: `TRIGGER_PROJECT_REF` and `CLICKUP_LIST_ID`.

The task loads the shared SecondBrain file during local development. For
Trigger.dev cloud runs, add `SERPAPI_API_KEY`, `CLICKUP_API_TOKEN`, and
`CLICKUP_LIST_ID` to the target project's environment variables. The cloud
worker cannot read a local OneDrive file.

## Develop and deploy

1. `npm install`
2. `npm run check && npm test`
3. `npm run dev` and complete the browser login requested by the Trigger.dev CLI.
4. Test a development run in the Trigger.dev dashboard. This creates real
   ClickUp lead tasks, so inspect the List afterward.
5. Add the three cloud environment variables to production, then deploy with
   `npm run deploy` after reviewing the first development run.

The private GitHub repository runs type checks and tests on every pull request
and every push to `main`. Connect its `main` branch under the Trigger.dev
project's GitHub integration to deploy production automatically after pushes.

## Duplicate handling

Each ClickUp task stores `LEAD_KEYS_JSON` with its Google Maps place ID, data ID,
phone, and website/location combinations. Every run scans the whole List before
searching and again before each create. The task queue permits one run at a
time. If a business has no stable Maps ID, public phone, or website, it is
skipped. Keep existing lead tasks in this List, including closed ones, so their
keys remain available for future checks.
