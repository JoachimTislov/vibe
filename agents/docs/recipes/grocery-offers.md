# Recipe: grocery offers for the week

The pattern for automating a website that has no integration support
(no API, no export): the agent explores, writes a robot, runs it, and
reads back the result. Everything is workspace-rooted and journaled.

## 1. Explore the site

```
User: Find this week's grocery offers at https://example-grocery.no
```

The agent starts with web_fetch (optionally with a CSS selector once
the structure is known):

```json
{"url": "https://example-grocery.no/tilbud", "selector": ".offer-card"}
```

- `web_fetch` returns title, readable text and links; scripts and styles
  are stripped. A selector extracts only matching elements.
- If the offers are behind JavaScript, plain fetching returns an empty
  shell - the agent then writes a browser robot instead (step 2b).

## 2a. Simple site: a shell/python robot

The agent writes `robots/grocery_offers.py` with write_file (gated by
your confirmation in console mode):

```python
import json, urllib.request, re

html = urllib.request.urlopen("https://example-grocery.no/tilbud").read().decode()
offers = re.findall(r'class="offer-card".*?<h3>(.*?)</h3>.*?(\d+[,\.]\d+)\s*kr', html, re.S)
json.dump([{"item": i, "price": p} for i, p in offers],
          open("logs/grocery/offers.json", "w"), ensure_ascii=False, indent=2)
```

then runs it:

```
run_command:  mkdir -p logs/grocery && python3 robots/grocery_offers.py
read_file:    logs/grocery/offers.json
```

## 2b. JavaScript site: a browser robot

For pages built by JavaScript, the agent writes a Playwright script
(requires Playwright installed on the host, once: `pip install
playwright && playwright install chromium`):

```python
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    page = p.chromium.launch().new_page()
    page.goto("https://example-grocery.no/tilbud")
    page.wait_for_selector(".offer-card")
    cards = page.locator(".offer-card").all()
    offers = [{"item": c.locator("h3").inner_text(),
               "price": c.locator(".price").inner_text()} for c in cards]
    json.dump(offers, open("logs/grocery/offers.json", "w"),
              ensure_ascii=False, indent=2)
```

Long-running or scheduled robots can be detached with start_process
(`start_process` name=grocery-weekly, logs land in
`logs/processes/grocery-weekly.log`) and stopped by name with
stop_process; list_processes shows what is running.

## 3. Verify and repeat

- Every step above is recorded in `logs/journal/` - query it with
  `journal_query` or ask the agent "what did you do last?".
- `self_report` confirms the robot processes and journal health.
- To make it weekly, hand the robot to cron on the host, or ask the
  agent to run it via start_process on demand.

## Notes and limits

- Fetching is read-only HTTP with a personal-agent user agent; some
  sites block bots or require cookies/JS - that is what the browser
  robot is for.
- Confirmation-gated tools (write_file, run_command, start_process)
  stay gated in console mode. Over MCP, the owner's API key
  authenticates you; set `mcp_allow_privileged: true` in agent.json if
  you want the MCP agent to execute robots without per-call approval.
- The workspace boundary still applies: robots write inside
  `logs/...` and `robots/...` under the workspace root.
