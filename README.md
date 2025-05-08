# MCP Server Manager for Cursor

An MCP (Model Context Protocol) workspace manager for Cursor. This project simplifies the often cumbersome workflow of managing multiple MCP servers in your local development environment. It provides a consistent, unified configuration approach and CLI (Command Line Interface) for starting, stopping, updating, and checking the status of all your MCP servers at once, or individually. It also automatically manages your global (or local) Cursor [MCP config](https://docs.cursor.com/context/model-context-protocol#configuration-locations) in `mcp.json`.

You can run the CLI using `deno task` commands (e.g., `deno task start`) or by directly executing the main module with `deno run -A src/mod.ts <command> [options]`.

## Project Overview

### Purpose

Managing various MCP servers, each with its own setup and operational quirks, can be a hassle. This project centralizes that management. Define all your servers once, and then use simple commands to control them. Whether an MCP server communicates via HTTP/SSE or STDIO, this manager handles them consistently.

### Getting Started

> [!CAUTION] New To MCPS?
> You need to know what you're doing, especially in a corporate environment. Read [How to Use MCPs Securely](docs/using-mcps-securely) before you go further.

To begin using the MCP Server Manager, you will primarily interact with server definitions and environment settings. Here's an overview of the key components:

- **Server Configuration Files**: Located in the `servers/` directory, these TypeScript files (e.g., `mcp-myservice.config.ts`) define each MCP server's properties. You can use templates from the `examples/` directory as a starting point (e.g., `examples/mcp-atlassian.ts.example` for HTTP/SSE servers, `examples/mcp-slack.ts.example` for STDIO servers).
- **Environment Variables**: Sensitive credentials and server-specific settings are stored in `.env` files (e.g., `servers/config/mcp-myservice.env`). Example environment files (e.g., `examples/mcp-myservice.env.example`) are provided in the `examples/` directory to guide you.
- **Global Manager Settings**: The `servers/config/main.env` file controls global behaviors, such as which servers are active via the `ENABLED_SERVERS` variable.

For detailed, step-by-step instructions on creating and configuring a new server, consult the [Adding a New MCP Server](#adding-a-new-mcp-server) section in the Main Workflow.

> [!TIP]
> For optimal use, fork this repository to securely manage your personal MCP server configurations. For easier CLI access, alias `src/mod.ts` to your PATH, or create a Cursor rule in other projects that points to `src/mod.ts`.

### What is an MCP Server?

A Model Context Protocol (MCP) server acts as a bridge between Cursor and external services or tools. It allows Cursor to access and interact with data or functionalities from these services (like Jira, Slack, Confluence, etc.) by exposing a standardized set of "tools" that Cursor can call. This enables features like retrieving Jira issues, searching Confluence pages, or sending Slack messages directly from your IDE through natural language or specific commands.

### State Management

The MCP Server Manager keeps track of the status of your configured servers (e.g., whether an HTTP server is currently running) in a state file located at `data/state.json`. This file is managed automatically by the CLI.

## Main Workflow

### Adding a New MCP Server

1. **Create Configuration File**:
   - Navigate to the `examples/` directory and choose a template:
     - For HTTP/SSE servers: `mcp-atlassian.ts.example`
     - For STDIO servers: `mcp-slack.ts.example`
   - Duplicate the chosen template file into the `servers/` directory.
   - Rename the copied file to reflect your new server, for example, `mcp-myservice.config.ts`.
2. **Edit Configuration**:
   - Open your new server configuration file (e.g., `mcp-myservice.config.ts`).
   - Update the `name`, `description`, `type` (`http` or `stdio`), `image`, and `args` fields.
   - The environment file (e.g., `servers/config/mcp-myservice.env`) is automatically used by the MCP manager based on the server `name` you set.
   - For HTTP/SSE servers:
     - You can optionally include `--port PORT` in your `args` array to specify a fixed port.
     - If no port is specified, the manager will automatically assign an available port when starting the server.
   - Configure the `healthValidator` section to define how the server's health is checked. This standardized configuration works for both HTTP and STDIO servers. An example for illustration:
     ```typescript
     healthValidator: {
       method: "mcp/tools/list", // MCP method to call
       params: {},               // Parameters for the method
       responseContains: "tools", // Optional string that must be in the response
       timeoutMs: 5000           // Timeout in milliseconds
     }
     ```
   - Include test prompt examples in the `postStartInstructions` property to guide users on how to test the server after it's running.
3. **Create Environment Files**:
   - Create an example environment file in `examples/` (e.g., `examples/mcp-myservice.env.example`) listing all required environment variables with placeholder values.
   - Create your actual environment file in the `servers/config/` directory (e.g., `servers/config/mcp-myservice.env`) by copying the example and filling in your actual credentials and settings.
   - **Important**: Add your actual environment file to your `.gitignore` if it's not already covered by a general pattern like `servers/config/*.env` to avoid committing sensitive credentials.
4. **Test**:
   - You can now use the [General Workflows](#general-workflows) (like `deno task start` to start) to manage your new server.

#### Example HTTP Server Configuration:

```typescript
const serverConfig: McpServerConfig = {
  name: 'mcp-atlassian',
  description: 'MCP Atlassian Connector',
  type: 'http',
  image: 'ghcr.io/sooperset/mcp-atlassian:latest',
  args: [
    '--transport',
    'sse',
    // Port will be automatically assigned if not specified
    // '--port',
    // '9000',
    '-vv',
  ],

  healthValidator: {
    method: 'mcp/tools/list',
    params: {},
    responseContains: 'tools',
    timeoutMs: 5000,
  },

  postStartInstructions: `
Atlassian MCP server is now running!
You can now use Jira and Confluence tools in Cursor.
Make sure your Atlassian credentials are properly configured in your .env file.
Try using the jira_list_projects tool to retrieve all the Jira projects I have access to and format the output as a bulleted list
`,
}
```

#### Example STDIO Server Configuration:

```typescript
const serverConfig: McpServerConfig = {
  name: 'mcp-slack',
  description: 'MCP Slack Connector',
  type: 'stdio',
  image: 'mcp/slack',
  args: [], // No additional args needed for STDIO servers
  // The orchestrator will add the necessary Docker args

  healthValidator: {
    method: 'slack_get_users',
    params: { limit: 1 },
    timeoutMs: 10000,
  },

  postStartInstructions: `
NOTE: The Slack MCP server is designed to run in interactive mode.
Cursor will run the server as needed, so no persistent container is needed.
You can now use Slack tools in Cursor.
Try using the command: List all channels in the Slack workspace
`,
}
```

### Editing an MCP Server

To edit an existing MCP server:

1. Modify its configuration file in `servers/`.
2. Update its corresponding environment file in `servers/config/` if necessary.
   The changes will be picked up the next time you run a command (e.g., `deno task start`).

### Removing an MCP Server

To remove an MCP server:

1. Delete its configuration file from `servers/`.
2. (Optional) Delete its environment file from `servers/config/` and `examples/`.
   The server will no longer be managed by the CLI.

## General Workflows (CLI Commands)

All commands can be run targeting all configured servers or a specific server using the `--server=<server-name>` flag (e.g., `deno task start --server=mcp-atlassian`).

- **Start Server(s)**:
  ```bash
  deno task start
  # or to start a specific server:
  deno task start --server=mcp-myservice
  ```
  This command starts your configured MCP servers. For HTTP servers, it launches Docker containers and automatically assigns an available port if none is specified in the configuration. For STDIO servers, it validates the configuration. After successful startup, the CLI will ask if you want to automatically update your Cursor configuration file with the server settings. If you decline, it will display the necessary JSON configuration for you to add manually.

  ```bash
  # To see how the Cursor MCP config would change without making changes:
  deno task start --dry-run
  # or for a specific server:
  deno task start --server=mcp-myservice --dry-run
  # dedicated dry-run task:
  deno task start:dry-run
  ```
  The `--dry-run` flag shows what changes would be made to your Cursor MCP configuration file without actually making those changes. It displays the current configuration alongside what it would look like after starting the server.

- **Stop Server(s)**:
  ```bash
  deno task stop
  # or to stop a specific server:
  deno task stop --server=mcp-myservice
  ```
  This stops any running HTTP MCP server containers. STDIO servers don't run persistently, so this command primarily affects HTTP types. The CLI will automatically update your Cursor configuration file to reflect that the server is no longer running, ensuring Cursor stays in sync with the actual server state.

  ```bash
  # To see how the Cursor MCP config would change without making changes:
  deno task stop --dry-run
  # or for a specific server:
  deno task stop --server=mcp-myservice --dry-run
  # dedicated dry-run task:
  deno task stop:dry-run
  ```
  Similar to the start command, the `--dry-run` flag shows what changes would be made to your Cursor MCP configuration file without actually making those changes or stopping any servers.

- **Check Server Status**:
  ```bash
  deno task status
  # or for a specific server:
  deno task status --server=mcp-myservice
  ```
  Displays the current status (e.g., running, stopped, or validation status for STDIO) of all configured MCP servers.

- **View Server Logs**:
  ```bash
  deno task logs
  # or for a specific server:
  deno task logs --server=mcp-myservice
  ```
  Displays the last 100 lines of logs from running HTTP MCP server containers. This is useful for troubleshooting issues or monitoring server activity.

  ```bash
  # To continuously stream logs in real-time:
  deno task logs --stream
  # or for a specific server:
  deno task logs --server=mcp-myservice --stream
  # dedicated streaming task:
  deno task logs:stream
  ```
  The `--stream` flag enables real-time log streaming, similar to `docker logs --follow`. This is particularly useful when debugging issues or watching server activity as it happens. Press Ctrl+C to exit the streaming mode.

- **Perform Health Check(s)**:
  ```bash
  deno task health-check
  # or for a specific server:
  deno task health-check --server=mcp-myservice
  ```
  For HTTP servers, this checks if the running container is responsive and healthy. For STDIO servers, it re-runs the validation.

- **Update Server Image(s)**:
  ```bash
  deno task update
  # or for a specific server:
  deno task update --server=mcp-myservice
  ```
  Pulls the latest Docker image for the specified server(s) as defined in their configuration files.

## Types of MCP Servers

This manager supports two types of MCP servers, distinguished by their `type` property in the configuration:

### 1. HTTP/SSE Servers (e.g., Atlassian MCP)

- **How they work in this codebase**:
  - These servers run as persistent Docker containers in the background.
  - This manager starts the Docker container, maps the necessary ports, and performs health checks using the standardized `healthValidator` configuration.
  - Authentication and server-specific logic are handled within the Docker image itself, configured via environment variables passed from the `.env` file associated with the server.
- **Cursor Configuration**:
  - Cursor connects to these servers via a URL (e.g., `http://localhost:9000/sse`).
  - If you specify a port in your server configuration `args`, the manager will use that port.
  - If no port is specified, the manager will automatically assign an available port when the server starts.
  - When a server starts successfully, the CLI will offer to automatically update your Cursor MCP configuration file with the appropriate settings.
  - If you prefer manual configuration, the CLI will provide the exact JSON snippet to add to your Cursor settings.

### 2. STDIO Servers (e.g., Slack MCP)

- **How they work in this codebase**:
  - These servers are designed to be launched by Cursor on-demand and communicate via Standard Input/Output (STDIO).
  - They do **not** run as persistent background services. When you use the `deno task start` command for an STDIO server, this manager temporarily launches the Docker container _only to validate_ that the configuration and credentials (from its `.env` file) are correct using the `healthValidator` configuration. The container will then exit. This is expected behavior.
- **Cursor Configuration**:
  - Cursor configuration for STDIO servers includes the `command` (e.g., `docker`) and `args` array to run the container interactively.
  - The manager automatically adds `--env-file` flag pointing to your environment file so credentials don't need to be hardcoded in the configuration.
  - When validation succeeds, the CLI will offer to automatically update your Cursor MCP configuration file with the appropriate settings.
  - If you prefer manual configuration, the CLI will provide a template JSON snippet for Cursor.

## Health Validation

Both HTTP and STDIO servers can use a standardized health validation mechanism:

```typescript
healthValidator: {
  method: "mcp/tools/list",    // MCP method to call
  params: {},                  // Parameters for the method
  responseContains: "tools",   // Optional string that must be in the response
  timeoutMs: 5000              // Timeout in milliseconds
}
```

- The `healthValidator` property is optional. If it's not specified (null, false, or undefined), health checks will be skipped with a success status.
- When configured, the validator constructs a JSON-RPC 2.0 request using the provided method and parameters
- For HTTP servers, the request is sent to the server's endpoint
- For STDIO servers, the request is sent to the server via Docker STDIO
- The response is checked for errors, and optionally checked to contain a specific string
- This unified approach simplifies server configuration and ensures consistent health checking across all server types

The health validation system also supports a `silent` option that can be passed to the validator to suppress log messages when health checks are skipped. This is primarily used internally by the CLI when checking server status in contexts where verbose logging is not desired.

## High-Level Architecture

The MCP Server Manager is designed with a configuration-driven approach:

- **Server Configurations (`servers/*.config.ts`)**: These TypeScript files are the heart of the system. Each file defines a single MCP server with properties:
  - `name`: Unique identifier for the server
  - `description`: Human-readable description
  - `type`: Either 'http' or 'stdio'
  - `image`: Docker image to use
  - `args`: Command-line arguments (for HTTP servers, includes the `--port` parameter)
  - `healthValidator`: Optional configuration for health checks
  - `postStartInstructions`: Instructions shown to the user after server start, including example usage commands
- **Environment Files (`servers/config/*.env` and `examples/*.env.example`)**: Credentials and server-specific settings are stored in `.env` files, separate from the main configuration. This keeps sensitive data out of version control.
- **Core Logic (`src/`)**:
  - `mod.ts`: The main entry point for the CLI.
  - `config.ts`: Loads all server configurations from the `servers/` directory.
  - `types.ts`: Defines the TypeScript types and interfaces for server configurations (like `McpServerConfig`) and state.
  - `orchestrator.ts`: Contains the `transformServerConfigForCursor` function that converts server configurations to Cursor MCP entries.
  - `commands/start.ts`: Implements the main `start` command logic, parsing arguments and orchestrating actions.
  - `commands/stop.ts`, `commands/status.ts`, `commands/health-check.ts`: Implement logic for their respective actions.
  - `services/cursor-service.ts`: Manages reading and writing Cursor's MCP configuration file.
  - `services/docker-service.ts`: Handles all interactions with the Docker CLI (pulling images, running/stopping containers, checking status).
  - `services/health-validator-service.ts`: Contains logic for the standardized health validation for both HTTP and STDIO servers.
- **Deno Tasks (`deno.jsonc`)**: Provides convenient shortcuts (like `deno task start`) for the common CLI commands.

Users primarily interact with the configuration files in `servers/` and their corresponding `.env` files. The `src/` directory contains the underlying machinery that makes it all work.

## Troubleshooting

- **Check Logs**: The CLI provides informative logs. For more detailed output, you can adjust the `LOG_LEVEL` in `servers/config/main.env`.
  - For server-specific logs, use the `logs` command: `deno task logs --server=mcp-myservice` or stream logs in real-time with `deno task logs --stream`.
  - This provides direct access to container logs which often contain error details and debugging information.
- **`servers/config/main.env`**: This file contains global settings for the MCP manager itself:
  - `DENO_ENV`: Set to `development` for more verbose output or potential development-specific behaviors.
  - `LOG_LEVEL`: Controls the verbosity of logs. Can be set to `debug`, `info`, `warn`, or `error`. For troubleshooting, `debug` is often helpful.
  - `ENABLED_SERVERS`: A comma-separated list of server names that should be available for management. For example: `ENABLED_SERVERS=github-mcp-server, mcp-atlassian, mcp-slack`. If not specified, all servers in the `servers/` directory are enabled. This allows you to selectively enable/disable servers without deleting their configuration files.
  - `CURSOR_MCP_CONFIG_PATH`: Specifies the file path where Cursor configurations for MCP servers are stored. By default, this points to a global Cursor configuration file (e.g., `~/.cursor/mcp.json`). You can override this to use a project-specific path, such as `.cursor/mcp.json` within your current project workspace, if you prefer to manage MCP configurations on a per-project basis. This path is used for automatic Cursor configuration updates when starting servers.
- **Docker Issues**:
  - Ensure Docker is installed and running. The CLI attempts to check this but manual verification can help.
  - For HTTP servers, if a server fails to start or is unhealthy, use `docker ps` to see if the container is running and `docker logs <container_name>` (e.g., `docker logs mcp-atlassian`) to inspect its logs for errors.
- **Environment Variables**: Double-check that your server-specific `.env` files (e.g., `servers/config/mcp-atlassian.env`) are correctly named, located in the `servers/config/` directory, and contain the correct credentials and settings required by the MCP server image.
- **Server Not Found Errors**: If you get an error stating a server is not enabled when using the `--server` flag, check that the server name is listed in the `ENABLED_SERVERS` variable in `servers/config/main.env`.
- **Cursor Configuration Issues**: If automatic configuration doesn't work, ensure the `CURSOR_MCP_CONFIG_PATH` environment variable is set correctly and points to a valid file location. The default path is `~/.cursor/mcp.json`, but this may vary depending on your operating system and Cursor installation.

## Cursor Configuration Synchronization

The MCP Server Manager keeps your Cursor MCP configuration file in sync with the actual server state:

- When a server **starts** with a dynamically assigned port, the port is saved to both the state file and Cursor's configuration
- When a server **stops**, Cursor's configuration is updated to reflect the offline state
- When server configuration **changes** (args, command, etc.), Cursor's configuration is automatically updated
- The configuration file path is determined by the `CURSOR_MCP_CONFIG_PATH` environment variable in `servers/config/main.env`

This ensures that Cursor always has the most up-to-date information about your MCP servers, even when ports change or servers are started and stopped.
