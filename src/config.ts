/**
 * @module config
 *
 * Configuration management module that provides a flexible way to load and access configuration values
 *
 * CONFIGURATION SOURCES: Configuration values can come from multiple optional sources, loaded in this order
 * (highest to lowest precedence):
 * 1. Values passed to the `overrides` parameter (optional)
 * 2. Values from the env file specified by --config flag (optional)
 * 3. Values from main.env file in the config directory (optional)
 * 4. Default values (always included) and Deno.env environment variables
 *
 * MERGING VALUES: Values from available sources are merged together - lower priority values are preserved
 * if they aren't overridden by a higher priority source.
 */

import { load as loadEnv } from '@std/dotenv'
import { parseArgs } from '@std/cli'
import { exists } from '@std/fs'
import { join } from '@std/path'
import type { AppConfig, McpServerConfig } from './types.ts'
import logger from './utils/logger.ts'
import { getPlatformClients } from './utils/find-mcp-clients.ts'

/**
 * Represents a possible configuration value which can be:
 * - A direct string value
 * - A function that returns a string or Promise<string>
 * - A Promise that resolves to a string
 */
type KeyValueConfig =
  | string
  | (() => string | Promise<string>)
  | Promise<string>

/**
 * Represents an object of configuration key-value pairs
 */
type ConfigRecord = Record<string, KeyValueConfig>

// Default values - functions/promises will be resolved during initialization
const DEFAULT_VALUES: ConfigRecord = {
  DENO_ENV: 'development',
  PACKAGE_NAME: '@my-org/my-project',
  PACKAGE_PATH: () => getWorkspacePath(),
  CURSOR_MCP_CONFIG_PATH: () => {
    const clients = getPlatformClients()
    const cursorClient = clients.find(client => client.name === 'Cursor')
    return cursorClient?.path || ''
  },
  WINDSURF_MCP_CONFIG_PATH: () => {
    const clients = getPlatformClients()
    const windsurfClient = clients.find(client => client.name === 'Windsurf')
    return windsurfClient?.path || ''
  },
  CLAUDE_MCP_CONFIG_PATH: () => {
    const clients = getPlatformClients()
    const claudeClient = clients.find(client => client.name === 'Claude')
    return claudeClient?.path || ''
  },
}

let configProxy: AppConfig | null = null
let initPromise: Promise<AppConfig> | null = null
let mcpServerConfigs: McpServerConfig[] | null = null
let serverConfigsPromise: Promise<McpServerConfig[]> | null = null
let appConfigInitialized = false
let mcpServersInitialized = false

// Get workspace paths - simplified since we know we're always in workspace root
const workspaceRoot = Deno.cwd()
const serverConfigDir = join(workspaceRoot, 'servers', 'config')
const mainEnvPath = join(serverConfigDir, 'main.env')
const examplesPath = join(workspaceRoot, 'examples')

// Validate a config key (must be a string)
function validateKey(key: PropertyKey): string {
  if (typeof key !== 'string') {
    throw new TypeError(`Property name must be a string, got: ${typeof key}`)
  }
  if (key.length === 0) throw new RangeError('Property name cannot be empty')
  return key
}

//
// Path getter methods - grouped together
//

/**
 * Get the base path of the workspace
 *
 * @returns Absolute path to the workspace root
 */
function getWorkspacePath(): string {
  return workspaceRoot
}

/**
 * Get the environment file path for a server
 *
 * @param serverName Name of the server
 * @returns Path to the server's environment file
 */
function getEnvFilePath(serverName: string): string {
  return join(serverConfigDir, `${serverName}.env`)
}

/**
 * Get the example environment file path for a server
 *
 * @param serverName Name of the server
 * @returns Path to the server's example environment file
 */
function getEnvExampleFilePath(serverName: string): string {
  return join(examplesPath, `${serverName}.env.example`)
}

/**
 * Get the path to the example env files directory
 *
 * @returns Path to examples directory
 */
function getExamplesPath(): string {
  return examplesPath
}

//
// Initialization and loading methods
//

/**
 * Unified initialization function for both app config and MCP server configs
 *
 * This function should be called ONLY ONCE at application start in mod.ts
 * to initialize both application configuration and server configurations
 *
 * @param appOverrides - Optional key-value pairs to override app configuration values
 * @returns A single proxy object containing all configuration values
 * @throws {Error} If initialization fails critically
 */
async function initializeConfig(
  appOverrides?: ConfigRecord,
): Promise<AppConfig> {
  // Initialize app config
  const config = await initializeAppConfig(appOverrides)

  // Initialize server configurations
  try {
    await initializeMcpServerConfigs()
  } catch (err) {
    logger.error(`Failed to initialize MCP server configs: ${err}`)
  }

  return config
}

/**
 * Initializes server configurations from the servers directory
 */
async function initializeMcpServerConfigs(): Promise<void> {
  if (mcpServersInitialized) {
    return
  }

  try {
    // Create a new loading promise if none exists
    if (!serverConfigsPromise) {
      serverConfigsPromise = loadServerConfigs()
    }

    // Wait for server configs to load
    await serverConfigsPromise

    // Mark as initialized
    mcpServersInitialized = true

    logger.debug('MCP server configurations initialized')
  } catch (err) {
    logger.error(`Failed to initialize MCP server configurations: ${err}`)
    // Reset the promise on error
    serverConfigsPromise = null
    throw err
  }
}

/**
 * Loads and caches global application configuration values from various sources.
 * Subsequent calls return the cached configuration
 *
 * @param overrides - Optional key-value pairs to override configuration values
 * @returns A single proxy object containing all configuration values that can be read and written to
 * @throws {Error} If initialization fails critically (e.g., dynamic value resolution fails)
 */
async function initializeAppConfig(
  overrides?: ConfigRecord,
): Promise<Record<string, string>> {
  // Simple promise-based lock to ensure initializeConfig runs only once
  if (!initPromise) {
    logger.debug('No initialization promise found, starting initialization...')
    initPromise = initializeConfigInternal(overrides)
  } else {
    logger.debug('Initialization promise already exists, waiting...')
  }

  try {
    // Wait for initialization to complete and return the proxy
    const config = await initPromise
    appConfigInitialized = true
    return config
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error(`Configuration initialization failed: ${errorMessage}`)
    // Reset the promise on error
    initPromise = null
    appConfigInitialized = false
    throw err
  }
}

/**
 * Internal function to initialize config from all sources
 */
async function initializeConfigInternal(
  overrides?: ConfigRecord,
): Promise<AppConfig> {
  logger.debug('Starting configuration initialization...')

  // Load configuration from various sources
  const envConfig: Record<string, string> = {}

  // Helper function to load and filter env files
  const loadAndFilterEnv = async (
    path: string,
  ): Promise<Record<string, string>> => {
    try {
      if (await exists(path)) {
        logger.debug(`Loading environment from ${path}`)
        const env = await loadEnv({ envPath: path })

        // Filter out empty and undefined values to avoid them overriding other sources
        return Object.fromEntries(
          Object.entries(env).filter(([_, v]) => v !== '' && v !== undefined),
        )
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger.warn(`Error loading env file from ${path}: ${errorMessage}`)
    }
    return {}
  }

  // 1. Load from main.env file
  Object.assign(envConfig, await loadAndFilterEnv(mainEnvPath))

  // 2. Load from file specified by --config flag (if any)
  try {
    const args = parseArgs(Deno.args)
    const configFlag = args.config || args.c

    if (configFlag && typeof configFlag === 'string') {
      const configPath = configFlag
      Object.assign(envConfig, await loadAndFilterEnv(configPath))
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.warn(`Error parsing command line args: ${errorMessage}`)
  }

  // 3. Apply default values
  const resolvedDefaults = await resolveObjectValues(DEFAULT_VALUES)
  const mergedConfig = { ...resolvedDefaults, ...envConfig }

  // 4. Apply overrides (highest precedence)
  if (overrides) {
    const resolvedOverrides = await resolveObjectValues(overrides)
    Object.assign(mergedConfig, resolvedOverrides)
  }

  // Create a proxy that intercepts all read/write operations
  configProxy = createConfigProxy(mergedConfig)

  // Log config load status
  logger.debug('Configuration initialized successfully')

  return configProxy
}

/**
 * Returns the current application configuration
 * Ensures configuration is initialized first
 */
async function getAppConfig(): Promise<Record<string, string>> {
  if (!configProxy || !appConfigInitialized) {
    try {
      return await initializeAppConfig()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger.error(`Failed to get app config: ${errorMessage}`)
      throw err
    }
  }
  return configProxy
}

/**
 * Returns all MCP server configurations
 * Ensures server configurations are initialized first
 */
async function getMcpServerConfigs(): Promise<McpServerConfig[]> {
  if (!mcpServerConfigs || !mcpServersInitialized) {
    try {
      await initializeMcpServerConfigs()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger.error(`Failed to get MCP server configs: ${errorMessage}`)
      throw err
    }
  }
  return mcpServerConfigs || []
}

/**
 * Returns a specific MCP server configuration by name
 */
async function getMcpServerConfig(
  name: string,
): Promise<McpServerConfig | undefined> {
  const configs = await getMcpServerConfigs()
  return configs.find((config) => config.name === name)
}

/**
 * Clears the MCP server configuration cache
 * Useful for testing or when server configurations change at runtime
 */
function clearMcpServerConfigCache(): void {
  mcpServerConfigs = null
  serverConfigsPromise = null
  mcpServersInitialized = false
  logger.debug('MCP server config cache cleared')
}

/**
 * Loads all server configurations from the servers directory
 */
async function loadServerConfigs(): Promise<McpServerConfig[]> {
  if (mcpServerConfigs) {
    return mcpServerConfigs
  }

  const serversDir = join(workspaceRoot, 'servers')
  logger.debug(`Scanning for server configurations in ${serversDir}`)

  const configs: McpServerConfig[] = []
  const mcpAtlassianExamplePath = join(examplesPath, 'mcp-atlassian.ts.example')
  const mcpSlackExamplePath = join(examplesPath, 'mcp-slack.ts.example')

  try {
    for await (const entry of Deno.readDir(serversDir)) {
      if (!entry.isFile || !entry.name.endsWith('.config.ts')) {
        continue
      }

      // Skip example files
      if (entry.name.includes('.example')) {
        continue
      }

      const serverName = entry.name.replace('.config.ts', '')
      logger.debug(`Discovered server configuration: ${serverName}`)

      try {
        // Import the server configuration dynamically
        const configPath = `file://${join(serversDir, entry.name)}`
        const module = await import(configPath)

        // Each server config file should export a default configuration object
        if (!module.default) {
          logger.warn(
            `Server config ${entry.name} does not export a default configuration. See examples for correct structure: ${mcpAtlassianExamplePath}, ${mcpSlackExamplePath}`,
          )
          continue
        }

        // Create server config with derived paths
        const serverConfig: McpServerConfig = {
          ...module.default,
          name: serverName,
        }

        configs.push(serverConfig)
        logger.debug(`Validated server configuration for ${serverName}`)
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logger.error(
          `Error loading server config ${entry.name}: ${errorMessage}. See examples for correct structure: ${mcpAtlassianExamplePath}, ${mcpSlackExamplePath}`,
        )
      }
    }

    // If after checking all files, no valid configurations were loaded
    if (configs.length === 0) {
      const noConfigsMsg =
        `No valid server configurations found in ${serversDir}`
      logger.error(noConfigsMsg)
      // It's important to throw here if the expectation is that at least one config should exist
      // or if downstream code doesn't gracefully handle an empty config array from this function.
      // For now, matching previous behavior of returning empty, but logging an error.
      // To throw: throw new Error(noConfigsMsg);
    }

    // Filter servers based on ENABLED_SERVERS if it exists
    const filteredConfigs = await filterEnabledServers(configs)

    // Cache the loaded configurations
    mcpServerConfigs = filteredConfigs
    return filteredConfigs
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error(
      `Error reading server configurations directory ${serversDir}: ${errorMessage}`,
    )
    throw new Error(`Failed to load server configurations: ${errorMessage}`)
  }
}

/**
 * Filters server configurations based on the ENABLED_SERVERS environment variable
 *
 * @param configs All loaded server configurations
 * @returns Filtered server configurations based on ENABLED_SERVERS, or all if not specified
 */
async function filterEnabledServers(
  configs: McpServerConfig[],
): Promise<McpServerConfig[]> {
  try {
    // Check if we have a main.env file with ENABLED_SERVERS
    if (await exists(mainEnvPath)) {
      const env = await loadEnv({ envPath: mainEnvPath })
      const enabledServersStr = env.ENABLED_SERVERS

      if (enabledServersStr) {
        // Parse the comma-separated list
        const enabledServers = enabledServersStr
          .split(',')
          .map((server) => server.trim())
          .filter((server) => server.length > 0)

        if (enabledServers.length > 0) {
          logger.info(
            `Filtering servers based on ENABLED_SERVERS: ${
              enabledServers.join(', ')
            }`,
          )

          const filteredConfigs = configs.filter((config) =>
            enabledServers.includes(config.name)
          )

          // Log any servers that were filtered out
          const filteredOut = configs
            .map((config) => config.name)
            .filter((name) => !enabledServers.includes(name))

          if (filteredOut.length > 0) {
            logger.info(
              `The following servers are disabled: ${filteredOut.join(', ')}`,
            )
          }

          return filteredConfigs
        }
      }
    }

    // If ENABLED_SERVERS not specified, or it's empty, return all servers
    logger.debug(
      'No ENABLED_SERVERS filter specified - all servers are enabled',
    )
    return configs
  } catch (err) {
    logger.warn(
      `Error filtering enabled servers: ${err}. Using all available servers.`,
    )
    return configs
  }
}

/**
 * Resolves any functions or promises in an object to their string values
 *
 * @param obj Object containing string values, functions, or promises
 * @returns Object with all values resolved to strings
 */
async function resolveObjectValues(
  obj: ConfigRecord,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(obj)) {
    try {
      if (typeof value === 'function') {
        // If it's a function, call it and await the result
        resolved[key] = await value()
      } else if (value instanceof Promise) {
        // If it's already a promise, just await it
        resolved[key] = await value
      } else {
        // Otherwise treat it as a direct string value
        resolved[key] = value
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger.error(`Error resolving dynamic value for ${key}: ${errorMessage}`)
      // Include a placeholder value to avoid undefined
      resolved[key] = `[Error: ${errorMessage}]`
    }
  }

  return resolved
}

/**
 * Creates a proxy for the configuration object that:
 * 1. Syncs values with Deno.env
 * 2. Validates property names
 * 3. Prevents deletion of properties
 *
 * @param values Initial configuration values
 * @returns Proxy to the configuration object
 */
function createConfigProxy(values: AppConfig): AppConfig {
  return new Proxy(values, {
    get(target, prop) {
      const key = validateKey(prop)

      // First try to get from our config object
      let value = target[key]

      // If not found, try to get from env
      if (value === undefined) {
        value = Deno.env.get(key) || ''
      }

      return value
    },

    set(target, prop, value) {
      const key = validateKey(prop)

      // Update both our config object and env
      target[key] = value
      Deno.env.set(key, value)

      return true
    },

    deleteProperty() {
      // Prevent deletion of properties
      return false
    },

    has(target, prop) {
      const key = validateKey(prop)
      return key in target || Deno.env.has(key)
    },
  })
}

/**
 * Checks if a specific server is enabled according to the ENABLED_SERVERS list
 *
 * @param serverName Name of the server to check
 * @returns Boolean indicating if the server is enabled, or an error string if server doesn't exist
 */
async function isServerEnabled(serverName: string): Promise<boolean | string> {
  const configs = await getMcpServerConfigs()

  // First check if the server exists at all
  const serverExists = configs.some((config) => config.name === serverName)
  if (!serverExists) {
    return `Server "${serverName}" not found in the server configurations.`
  }

  // If the server exists in the filtered list, it's enabled
  const serverConfig = configs.find((config) => config.name === serverName)
  return !!serverConfig
}

export {
  clearMcpServerConfigCache,
  getAppConfig,
  getEnvExampleFilePath,
  getEnvFilePath,
  getExamplesPath,
  getMcpServerConfig,
  getMcpServerConfigs,
  getWorkspacePath,
  initializeConfig,
  isServerEnabled,
}
