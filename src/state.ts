/**
 * MCP state management
 *
 * Manages the runtime state of MCP servers
 *
 * @module
 */
import { exists } from '@std/fs'
import { dirname, join } from '@std/path'
import logger from './utils/logger.ts'
import type { McpServerConfig, McpState, McpStateFile } from './types.ts'
import { getEnvFilePath, getWorkspacePath } from './config.ts'

// Path to the state file
const STATE_FILE_PATH = join(getWorkspacePath(), 'data', 'state.json')

/**
 * Load state from file
 */
async function loadState(): Promise<McpStateFile> {
  try {
    // Ensure directory exists
    const dir = dirname(STATE_FILE_PATH)
    if (!(await exists(dir))) {
      await Deno.mkdir(dir, { recursive: true })
    }

    // Check if file exists before reading
    if (await exists(STATE_FILE_PATH)) {
      const fileContent = await Deno.readTextFile(STATE_FILE_PATH)
      return JSON.parse(fileContent) as McpStateFile
    }

    // If file doesn't exist, return default state
    logger.debug('Creating new state file...')
    return {
      mcps: [],
      updatedOn: new Date().toISOString(),
    }
  } catch (error) {
    // If there's an error reading or parsing file, return default state
    logger.debug(`Error loading state file: ${error}`)
    return {
      mcps: [],
      updatedOn: new Date().toISOString(),
    }
  }
}

/**
 * Save state to file
 */
async function saveState(state: McpStateFile): Promise<void> {
  try {
    // Ensure directory exists
    const dir = dirname(STATE_FILE_PATH)
    if (!(await exists(dir))) {
      await Deno.mkdir(dir, { recursive: true })
    }

    // Add or update timestamp
    const stateToSave = {
      ...state,
      updatedOn: new Date().toISOString(),
    }

    await Deno.writeTextFile(
      STATE_FILE_PATH,
      JSON.stringify(stateToSave, null, 2),
    )
  } catch (error) {
    logger.error(`Error saving state file: ${error}`)
  }
}

/**
 * Sync state with current configuration
 */
function syncStateWithConfig(
  state: McpStateFile,
  servers: McpServerConfig[],
): McpStateFile {
  const newState: McpStateFile = {
    mcps: [],
    updatedOn: state.updatedOn || new Date().toISOString(),
  }

  // Add or update entries for configured servers
  for (const server of servers) {
    // Find existing entry
    const existingEntry = state.mcps.find((mcp) => mcp.name === server.name)

    // Determine endpoint based on server type or use existing endpoint if available
    let endpoint = ''

    if (existingEntry?.endpoint) {
      // Preserve existing endpoint if available
      endpoint = existingEntry.endpoint
    } else if (server.type === 'http') {
      // For HTTP servers, extract port from args
      let port = 9000 // Default port
      for (let i = 0; i < server.args.length - 1; i++) {
        if (server.args[i] === '--port') {
          const parsedPort = Number.parseInt(server.args[i + 1], 10)
          if (!Number.isNaN(parsedPort)) {
            port = parsedPort
            break
          }
        }
      }
      endpoint = `http://localhost:${port}/sse`
    } else {
      // For STDIO transport, create a descriptive identifier
      endpoint = `command:docker:${server.image}`
    }

    // Create new entry with explicit McpState typing
    const serverState: McpState = {
      name: server.name,
      endpoint,
      envFile: getEnvFilePath(server.name),
      online: existingEntry?.online || false,
      // Preserve the user's cursor config management preference
      manageCursorConfig: existingEntry?.manageCursorConfig,
    }

    newState.mcps.push(serverState)
  }

  return newState
}

/**
 * Update server state including online status and endpoint
 *
 * @param state Current state file
 * @param serverName Name of the server to update
 * @param isOnline Whether the server is online
 * @param endpoint Optional endpoint URL (for HTTP servers) or descriptor (for STDIO)
 * @returns Updated state file
 */
function updateServerStatus(
  state: McpStateFile,
  serverName: string,
  isOnline: boolean,
  endpoint?: string,
): McpStateFile {
  return {
    ...state,
    mcps: state.mcps.map((mcp) => {
      if (mcp.name === serverName) {
        const updatedServer: McpState = {
          ...mcp,
          online: isOnline,
          // Only update endpoint if provided, otherwise keep existing
          ...(endpoint ? { endpoint } : {}),
          // Preserve the manageCursorConfig property
          manageCursorConfig: mcp.manageCursorConfig,
        }
        return updatedServer
      }
      return mcp
    }),
  }
}

/**
 * Get server state by name
 * @returns McpState if found, null otherwise
 */
function getServerState(
  state: McpStateFile,
  serverName: string,
): McpState | null {
  const serverState = state.mcps.find((mcp) => mcp.name === serverName)
  return serverState || null
}

/**
 * Add a new server state or update existing one
 * @returns Updated state file
 */
function addOrUpdateServerState(
  state: McpStateFile,
  serverState: McpState,
): McpStateFile {
  const existingIndex = state.mcps.findIndex((mcp) =>
    mcp.name === serverState.name
  )

  const newMcps = [...state.mcps]
  if (existingIndex >= 0) {
    // Update existing entry
    newMcps[existingIndex] = serverState
  } else {
    // Add new entry
    newMcps.push(serverState)
  }

  return {
    mcps: newMcps,
    updatedOn: state.updatedOn || new Date().toISOString(),
  }
}

/**
 * Update server's cursor config management preference
 * @param state Current state file
 * @param serverName Name of the server to update
 * @param manageCursorConfig Whether user wants us to manage cursor config for this server
 * @returns Updated state file
 */
function updateServerCursorConfigPreference(
  state: McpStateFile,
  serverName: string,
  manageCursorConfig: boolean,
): McpStateFile {
  // Check if server exists
  const existingIndex = state.mcps.findIndex((mcp) => mcp.name === serverName)

  if (existingIndex >= 0) {
    // Server exists, update it
    return {
      ...state,
      mcps: state.mcps.map((mcp) => {
        if (mcp.name === serverName) {
          return {
            ...mcp,
            manageCursorConfig,
          }
        }
        return mcp
      }),
    }
  }

  // Server doesn't exist, create a minimal entry
  const newServer: McpState = {
    name: serverName,
    endpoint: '',
    envFile: getEnvFilePath(serverName),
    online: false,
    manageCursorConfig,
  }

  return {
    ...state,
    mcps: [...state.mcps, newServer],
  }
}

export {
  addOrUpdateServerState,
  getServerState,
  loadState,
  saveState,
  syncStateWithConfig,
  updateServerStatus,
  updateServerCursorConfigPreference,
}
