### MCP GitHub Setup Instructions

This guide explains how to configure the GitHub MCP server using the MCP Server Manager. The manager handles all Docker operations automatically, including pulling images, running containers, and setting up proper configurations.

---

### 1. **Prerequisites**

- A GitHub Personal Access Token (PAT). You can [create one here](https://github.com/settings/personal-access-tokens/new). Ensure it has the necessary permissions for the tools you intend to use.
- MCP Server Manager properly installed and configured.

---

### 2. **Configuration Steps**

#### Server Configuration

1. Create a file named `github-mcp-server.config.ts` in the `servers/` directory with this structure:

```typescript
import type { McpServerConfig } from '../src/types.ts'

const serverConfig: McpServerConfig = {
  name: 'github-mcp-server',
  description: 'GitHub MCP Server (STDIO)',
  type: 'stdio',
  image: 'ghcr.io/github/github-mcp-server',
  args: [], // Optional, but no additional args needed

  healthValidator: {
    method: 'mcp/tool/run',
    params: { toolName: 'get_me', parameters: {} },
    responseContains: 'login',
    timeoutMs: 10000,
  },

  postStartInstructions: `
NOTE: The GitHub MCP server is designed to run in interactive mode via Docker.
Cursor will run the server as needed, so no persistent container is needed.
Ensure your GITHUB_PERSONAL_ACCESS_TOKEN is set in servers/config/github-mcp-server.env

You can use GitHub tools in Cursor.
Try using the command: @github get my user details
`,
}

export default serverConfig
```

#### Environment Variables

2. Create a file named `github-mcp-server.env` in the `servers/config/` directory:

```env
# GitHub MCP Server
# Required: GitHub Personal Access Token
GITHUB_PERSONAL_ACCESS_TOKEN=your_pat_here
# Optional: Comma-separated list of toolsets (e.g., repos,issues)
# GITHUB_TOOLSETS=repos,issues
# Optional: Enable dynamic toolset discovery (1 to enable)
# GITHUB_DYNAMIC_TOOLSETS=
```

3. Replace `your_pat_here` with your actual GitHub Personal Access Token.

---

### 3. **Starting the Server**

Run the following command to start and validate the GitHub MCP server:

```bash
deno task start --server=github-mcp-server
```

The MCP Server Manager will:
- Pull the GitHub MCP server Docker image if needed
- Validate the server configuration
- Generate the proper Cursor configuration
- Prompt you to add it to your Cursor settings

---

### 4. **Adding to Cursor**

When prompted, allow the MCP Server Manager to automatically add the GitHub MCP server to your Cursor configuration, or follow the manual instructions provided by the CLI.

If adding manually:
1. Open Cursor Settings
2. Navigate to: Settings → Features → MCP Servers → + Add new global MCP server
3. Paste the JSON snippet provided by the CLI

---

### 5. **Testing the Setup**

In Cursor, try a command like:
```
@github get my user details
```

The server should respond with your GitHub user information if configured correctly.

---

### 6. **Environment Variable Reference**

The `github-mcp-server.env` file supports these variables:

- `GITHUB_PERSONAL_ACCESS_TOKEN`: (Required) Your GitHub Personal Access Token
- `GITHUB_TOOLSETS`: (Optional) Comma-separated list of toolsets (e.g., `repos,issues,pull_requests,code_security`)
- `GITHUB_DYNAMIC_TOOLSETS`: (Optional) Set to `1` to enable dynamic toolset discovery
- `GITHUB_HOST`: (Optional) For GitHub Enterprise Server hostname

---

### 7. **Creating a GitHub Personal Access Token**

1. Go to [GitHub Personal Access Tokens page](https://github.com/settings/personal-access-tokens/new)
2. Click "Generate new token" (or "Generate new token (classic)")
3. Give your token a descriptive name (e.g., "MCP Server Token")
4. Set an expiration
5. Select the required scopes (`repo`, `user`, etc.)
6. Click "Generate token"
7. Copy the token and add it to your env file

---

### Troubleshooting

- **Health Check Fails**: Verify your PAT has the correct permissions and hasn't expired
- **Missing Tools**: Check if you need to specify `GITHUB_TOOLSETS` or enable `GITHUB_DYNAMIC_TOOLSETS`
- **Permission Errors**: Review the scopes of your GitHub PAT

For more information on the GitHub MCP server itself, refer to its documentation or repository (if available). 
