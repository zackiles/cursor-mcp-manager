# MCP Atlassian

![PyPI Version](https://img.shields.io/pypi/v/mcp-atlassian)
![PyPI - Downloads](https://img.shields.io/pypi/dm/mcp-atlassian)
![PePy - Total Downloads](https://static.pepy.tech/personalized-badge/mcp-atlassian?period=total&units=international_system&left_color=grey&right_color=blue&left_text=Total%20Downloads)
[![Run Tests](https://github.com/sooperset/mcp-atlassian/actions/workflows/tests.yml/badge.svg)](https://github.com/sooperset/mcp-atlassian/actions/workflows/tests.yml)
![License](https://img.shields.io/github/license/sooperset/mcp-atlassian)

Model Context Protocol (MCP) server for Jira Cloud.

## Example Usage

Ask your AI assistant to:

- **🐛 Smart Jira Issue Filtering** - "Show me urgent bugs in PROJ project from last week"
- **📝 Automatic Jira Updates** - "Update Jira from our meeting notes"

## Quick Start Guide

### 1. Authentication Setup

For Jira Cloud with API Token:

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**, name it
3. Copy the token immediately

### 2. Installation

MCP Atlassian is distributed as a Docker image.

```bash
# Pull Pre-built Image
docker pull ghcr.io/sooperset/mcp-atlassian:latest
```

## SSE Transport Configuration

Start the server manually in a terminal:

```bash
docker run --rm -p 9000:9000 \
  -e JIRA_URL="https://your-company.atlassian.net" \
  -e JIRA_USERNAME="your.email@company.com" \
  -e JIRA_API_TOKEN="your_api_token" \
  ghcr.io/sooperset/mcp-atlassian:latest \
  --transport sse --port 9000 -vv
```

Then configure your IDE to connect to the running server via its URL:

```json
{
  "mcpServers": {
    "mcp-atlassian-sse": {
      "url": "http://localhost:9000/sse"
    }
  }
}
```

## Jira Tools

- `jira_get_issue`: Get details of a specific issue
- `jira_search`: Search issues using JQL
- `jira_create_issue`: Create a new issue
- `jira_update_issue`: Update an existing issue
- `jira_transition_issue`: Transition an issue to a new status
- `jira_add_comment`: Add a comment to an issue
- `jira_get_project_issues`: Get issues for a specific project
- `jira_batch_create_issues`: Create multiple issues at once
- `jira_delete_issue`: Delete an issue
- `jira_get_transitions`: Get available transitions for an issue
- `jira_add_worklog`: Add a worklog entry to an issue
- `jira_get_worklog`: Get worklog entries for an issue
- `jira_batch_get_changelogs`: Get changelogs for issues
- `jira_download_attachments`: Download attachments from issues
- `jira_link_to_epic`: Link an issue to an epic
- `jira_get_agile_boards`: Get available agile boards
- `jira_get_board_issues`: Get issues for a board
- `jira_get_sprints_from_board`: Get sprints for a board
- `jira_get_sprint_issues`: Get issues for a sprint
- `jira_create_sprint`: Create a new sprint
- `jira_update_sprint`: Update a sprint
- `jira_get_issue_link_types`: Get available issue link types
- `jira_create_issue_link`: Create a link between issues
- `jira_remove_issue_link`: Remove a link between issues

## License

Licensed under MIT - see [LICENSE](LICENSE) file. This is not an official Atlassian product.
