### MCP Slack Setup Instructions

Here's how you can set up the MCP server for integration with Slack:

---

### 1. **Using Docker (Recommended Method)**

#### Pull the Docker Image
```bash
docker pull mcp/slack
```

#### Run the Server
```bash
docker run --rm -i \
  --env-file /path/to/your/.env \
  mcp/slack
```

#### Configure for Cursor Integration
Add the following configuration in your IDE settings:
```json
{
  "mcpServers": {
    "slack": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "SLACK_BOT_TOKEN",
        "-e",
        "SLACK_TEAM_ID",
        "-e",
        "SLACK_CHANNEL_IDS",
        "mcp/slack"
      ],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
        "SLACK_TEAM_ID": "T01234567",
        "SLACK_CHANNEL_IDS": "C01234567, C76543210"
      }
    }
  }
}
```

---

### 2. **Environment Configuration**

You can pass environment variables directly or use an `.env` file for configuration. The following environment variables are required:

- `SLACK_BOT_TOKEN`: Your Bot User OAuth Token (starts with `xoxb-`)
- `SLACK_TEAM_ID`: Your Slack workspace ID (starts with `T`)
- `SLACK_CHANNEL_IDS`: Optional. Comma-separated list of channel IDs to limit channel access

#### Example `.env` File Configuration
```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_TEAM_ID=T01234567
SLACK_CHANNEL_IDS=C01234567,C76543210
```

---

### 3. **Authentication Setup**

1. Create a Slack App:
   - Visit the [Slack Apps page](https://api.slack.com/apps)
   - Click "Create New App"
   - Choose "From scratch"
   - Name your app and select your workspace

2. Configure Bot Token Scopes:
   - Navigate to "OAuth & Permissions"
   - Add these required scopes:
     - `channels:history` - View messages in public channels
     - `channels:read` - View basic channel information
     - `chat:write` - Send messages as the app
     - `reactions:write` - Add emoji reactions to messages
     - `users:read` - View users and their basic information
     - `users.profile:read` - View detailed profiles about users

3. Install App to Workspace:
   - Click "Install to Workspace"
   - Authorize the app
   - Save the "Bot User OAuth Token" (starts with `xoxb-`)

4. Get your Team ID:
   - Your Team ID starts with "T"
   - Can be found in your Slack workspace URL or admin settings

---

### 4. **Cursor-Specific Configuration**

1. Open Cursor Settings
2. Navigate to: `Settings → Features → MCP Servers → + Add new global MCP server`
3. Add the configuration from section 1

---

### 5. **Verification**

To verify your setup is working:
1. Ensure the MCP server is running
2. In Cursor, try a simple command like "List all channels in the Slack workspace"
3. The server should respond with a list of available channels

---

Using Docker is highly recommended for ease of setup, consistency across environments, and simplified configuration. For troubleshooting:

- Verify all required scopes are added to your Slack app
- Ensure the app is properly installed to your workspace
- Check that tokens and workspace ID are correctly copied
- Confirm the app has been added to the channels it needs to access

For more information, visit the [MCP Slack Server repository](https://github.com/modelcontextprotocol/servers/tree/main/src/slack). 
