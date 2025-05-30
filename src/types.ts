/**
 * @module types
 *
 * Internal and exported types for the CLI.
 * NOTE: Re-export them in `mod.ts` if you'd like to expose them to consumers as well.
 */

/**
 * Transport types supported by MCP servers
 */
type McpTransportType = 'http' | 'stdio'

/**
 * Cursor configuration for HTTP MCP servers
 */
interface CursorHttpMcpEntry {
  /** URL for HTTP MCP server */
  url: string
}

/**
 * Cursor configuration for STDIO MCP servers
 */
interface CursorStdioMcpEntry {
  /** Command to execute for STDIO MCP server (typically 'docker') */
  command: string
  /** Arguments for the command */
  args: string[]
}

/**
 * Union type for Cursor MCP server configurations
 */
type CursorMcpEntry = CursorHttpMcpEntry | CursorStdioMcpEntry

/**
 * Health validator configuration for standardized MCP server health checks
 */
interface HealthValidatorConfig {
  /** MCP method to call */
  method: string
  /** Parameters for the method */
  params: Record<string, unknown>
  /** Optional string that must be contained in the response (after JSON.stringify) */
  responseContains?: string
  /** Timeout in milliseconds (default: 5000) */
  timeoutMs?: number
}

/**
 * Base configuration shared by all server types
 */
interface BaseMcpServerConfig {
  /** Unique identifier for the server */
  name: string
  /** Description of the server's purpose */
  description: string
  /** Docker image to use */
  image: string
  /** Docker run arguments */
  args: string[]
  /** Optional message to display after server start */
  postStartInstructions?: string
  /** Standardized health validator configuration (optional) */
  healthValidator?: HealthValidatorConfig
}

/**
 * Configuration specific to HTTP servers
 */
interface HttpMcpServerConfig extends BaseMcpServerConfig {
  type: 'http'
  stdioConfig?: never
}

/**
 * Configuration specific to STDIO servers
 */
interface StdioMcpServerConfig extends BaseMcpServerConfig {
  type: 'stdio'
}

/**
 * MCP server configuration
 */
type McpServerConfig = HttpMcpServerConfig | StdioMcpServerConfig

/**
 * MCP server state
 */
interface McpState {
  name: string
  endpoint: string
  envFile?: string
  online: boolean
  manageCursorConfig?: boolean
}

/**
 * State file structure for MCP servers
 */
interface McpStateFile {
  mcps: McpState[]
  /** ISO string timestamp when the state file was last updated */
  updatedOn?: string
}

/**
 * Application configuration
 */
type AppConfig = Record<string, string>

export type {
  AppConfig,
  CursorHttpMcpEntry,
  CursorMcpEntry,
  CursorStdioMcpEntry,
  HealthValidatorConfig,
  McpServerConfig,
  McpState,
  McpStateFile,
  McpTransportType,
}
