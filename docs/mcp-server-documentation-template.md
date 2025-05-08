# MCP Server Documentation: [SERVER NAME]

## Overview

[Provide a brief overview of what this MCP server does and what integrations it supports.]

## Configuration

### Docker Image

```
[DOCKER_IMAGE_NAME]:[TAG]
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VARIABLE_1` | Yes | [Description of the environment variable] |
| `VARIABLE_2` | No | [Description of the environment variable] |

### Transport Type

This server uses [HTTP/STDIO] transport.

## Setup Instructions

### Prerequisites

[List any prerequisites for using this MCP server]

### Installation

#### Using CLI

```bash
deno task mcp --server=[SERVER_NAME]
```

#### Manual Docker Setup

```bash
docker run --rm -p [PORT]:[PORT] \
  --env-file /path/to/.env \
  [DOCKER_IMAGE]:[TAG] \
  [ADDITIONAL_ARGS]
```

### Cursor Integration

Add the following configuration in your Cursor settings:

```json
{
  "mcpServers": {
    "[SERVER_NAME]": {
      [CONFIGURATION_BASED_ON_TRANSPORT_TYPE]
    }
  }
}
```

## Available Tools

### [TOOL_NAME_1]

[Description of the tool]

**Parameters:**
- `param1` (required/optional): [Description]
- `param2` (required/optional): [Description]

**Example Usage:**
```
"[Example natural language query for this tool]"
```

### [TOOL_NAME_2]

[Repeat for each tool]

## Troubleshooting

### Common Issues

1. **[ISSUE DESCRIPTION]**
   - Solution: [Solution steps]

2. **[ISSUE DESCRIPTION]**
   - Solution: [Solution steps]

## References

- [Link to the MCP server repository or documentation]
- [Any other relevant links] 
