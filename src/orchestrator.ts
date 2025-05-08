/**
 * MCP Server Orchestrator
 *
 * The central piece that uses loaded configurations and delegates tasks
 * (start, stop, health check, status) to appropriate services
 *
 * @module orchestrator
 */

import { exists } from '@std/fs'
import logger from './utils/logger.ts'
import type {
  CursorHttpMcpEntry,
  CursorMcpEntry,
  CursorStdioMcpEntry,
  McpServerConfig,
  McpState,
} from './types.ts'
import {
  isContainerRunning,
  isDockerImagePulled,
  isDockerInstalled,
  isDockerRunning,
  printDockerLogs,
  pullDockerImage,
  runContainer,
  startDocker,
  stopAndRemoveContainer,
} from './services/docker-service.ts'
import { isPortOpen, validateServerHealth } from './services/health-validator-service.ts'
import { confirm, displayCursorConfig, suggestEnvFileCreation } from './presentation.ts'
import { getAppConfig, getEnvFilePath } from './config.ts'
import { addMcpServers, getMcpServers } from './services/cursor-service.ts'
import { getServerState, loadState, saveState, updateServerStatus } from './state.ts'
import { join } from '@std/path'
import { getAvailablePort } from '@std/net'

/**
 * Check Docker installation and availability
 *
 * @returns True if Docker is ready, false otherwise
 */
async function checkDockerAvailability(): Promise<boolean> {
  if (!await isDockerInstalled()) {
    logger.error('Docker is not installed. Please install Docker to use this command.')
    return false
  }

  if (await isDockerRunning()) return true

  const started = await startDocker()
  if (!started) {
    logger.error('Could not start Docker. Please start Docker manually and try again.')
    return false
  }

  logger.info('Docker started successfully.')
  return true
}

/**
 * Extract port from server args or get an available port if none is specified
 *
 * @param args Server arguments array
 * @param dynamicFallback Whether to dynamically assign a port if none found (default: false)
 * @returns The port number, an available port if dynamicFallback is true, or undefined if not found and dynamicFallback is false
 */
async function getPortFromArgs(
  args: string[],
  dynamicFallback = false,
): Promise<number | undefined> {
  // First try to extract the port from args
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === '--port') {
      const port = Number.parseInt(args[i + 1], 10)
      if (!Number.isNaN(port)) {
        return port
      }
    }
  }

  // If no port is found and dynamicFallback is true, get an available port
  if (dynamicFallback) {
    try {
      const port = await getAvailablePort()
      logger.info(`No port specified, dynamically assigned port ${port}`)
      return port
    } catch (error) {
      logger.error(`Failed to get available port: ${error}`)
      return undefined
    }
  }

  return undefined
}

/**
 * Get the relative path to the environment file for Cursor configuration
 *
 * @param serverName Name of the server
 * @returns Relative path to the environment file
 */
function getRelativeEnvFilePathForCursor(serverName: string): string {
  return join('.', 'servers', 'config', `${serverName}.env`)
}

/**
 * Get the absolute path to the environment file for Cursor configuration
 *
 * @param serverName Name of the server
 * @returns Absolute path to the environment file
 */
function getAbsoluteEnvFilePathForCursor(serverName: string): string {
  const envFilePath = getEnvFilePath(serverName)
  return envFilePath
}

/**
 * Transform server configuration into Cursor MCP entry
 *
 * @param server Server configuration
 * @returns Cursor MCP entry
 */
async function transformServerConfigForCursor(server: McpServerConfig): Promise<CursorMcpEntry> {
  // First check if we have this server in the state file with a valid endpoint
  try {
    const state = await loadState()
    const serverState = getServerState(state, server.name)

    // If server has a valid endpoint in state, use that for Cursor config
    if (serverState?.endpoint) {
      if (server.type === 'http' && serverState.endpoint.startsWith('http://')) {
        // For HTTP servers, use the endpoint URL directly
        return {
          url: serverState.endpoint,
        } as CursorHttpMcpEntry
      }

      if (server.type === 'stdio' && serverState.endpoint.startsWith('command:')) {
        // For STDIO servers, construct the args based on the stored endpoint
        // Since the command args may have changed, we still construct them fresh
        const dockerArgs = [
          'run',
          '-i',
          '--rm',
          '--env-file',
          getAbsoluteEnvFilePathForCursor(server.name),
          server.image,
          ...server.args,
        ]

        return {
          command: 'docker',
          args: dockerArgs,
        } as CursorStdioMcpEntry
      }
    }
  } catch (error) {
    logger.debug(`Error getting server state for Cursor config: ${error}`)
    // Continue with the fallback approach
  }

  // Fallback to constructing config from server configuration
  if (server.type === 'http') {
    // For HTTP servers, extract port from args or get an available port
    const port = await getPortFromArgs(server.args, true)
    if (!port) {
      logger.error(`Could not assign a port for ${server.name}`)
      // Still provide a default for Cursor config
      return {
        url: 'http://localhost:9000/sse',
      } as CursorHttpMcpEntry
    }

    return {
      url: `http://localhost:${port}/sse`,
    } as CursorHttpMcpEntry
  }

  // For STDIO servers, create a docker command with appropriate args
  const dockerArgs = [
    'run',
    '-i',
    '--rm',
    '--env-file',
    getAbsoluteEnvFilePathForCursor(server.name),
    server.image,
    ...server.args,
  ]

  return {
    command: 'docker',
    args: dockerArgs,
  } as CursorStdioMcpEntry
}

/**
 * Check if the environment file exists for a server
 * If not, suggest creating it from the example file
 *
 * @param server Server configuration
 * @returns True if the file exists or if no environment file is needed
 */
async function checkEnvFile(server: McpServerConfig): Promise<boolean> {
  const envFilePath = getEnvFilePath(server.name)
  if (await exists(envFilePath)) return true

  await suggestEnvFileCreation(server)
  return false
}

/**
 * Update state and save for a server with the given online status and endpoint
 *
 * @param serverName Name of the server
 * @param isOnline Whether the server is online
 * @param endpoint Optional endpoint URL
 */
async function updateAndSaveServerState(
  serverName: string,
  isOnline: boolean,
  endpoint?: string,
): Promise<void> {
  const state = await loadState()
  const updatedState = updateServerStatus(state, serverName, isOnline, endpoint)
  await saveState(updatedState)

  if (endpoint) {
    logger.debug(`Updated state file for ${serverName}: online=${isOnline}, endpoint=${endpoint}`)
  } else {
    logger.debug(`Updated state file: ${serverName} ${isOnline ? 'online' : 'offline'}`)
  }
}

/**
 * Handle server startup success for HTTP servers
 * Updates state, logs success message
 *
 * @param server Server configuration
 * @param port Port the server is running on
 * @returns true to indicate success
 */
async function handleHttpServerSuccess(server: McpServerConfig, port: number): Promise<boolean> {
  const { name } = server
  const endpoint = `http://localhost:${port}/sse`

  // Update state
  await updateAndSaveServerState(name, true, endpoint)

  logger.info(`${name} started successfully and is healthy!`)
  return true
}

/**
 * Handle server startup failure for HTTP servers
 * Cleans up container, logs error
 *
 * @param server Server configuration
 * @param message Error message
 * @returns false to indicate failure
 */
async function handleHttpServerFailure(
  server: McpServerConfig,
  message: string,
): Promise<boolean> {
  const { name } = server

  // Get logs for troubleshooting
  logger.info('Retrieving logs for troubleshooting:')
  await printDockerLogs(name)

  // Clean up container
  await stopAndRemoveContainer(name)

  // Log error
  logger.error(message)

  // Update state as offline
  await updateAndSaveServerState(name, false)

  return false
}

/**
 * Check if a server is healthy at the specified port
 *
 * @param server Server configuration
 * @param port Port to check
 * @returns Whether the server is healthy
 */
async function checkServerHealth(
  server: McpServerConfig,
  port: number,
): Promise<boolean> {
  const { name } = server

  const isHealthy = await validateServerHealth(server)

  if (isHealthy) {
    logger.info(`Health check passed for ${name} at port ${port}`)
  } else {
    logger.error(`Health check failed for ${name}`)
  }

  return isHealthy
}

/**
 * Start an HTTP-based MCP server
 */
async function startHttpServer(server: McpServerConfig): Promise<boolean> {
  const { name, type } = server

  try {
    if (type !== 'http') {
      logger.error(`Server ${name} is not configured as HTTP type`)
      return false
    }

    // Extract port from args or get an available port
    const port = await getPortFromArgs(server.args, true)
    if (!port) {
      logger.error(`Could not assign a port for ${name}`)
      return false
    }

    // Update the server args with the assigned port if it wasn't already specified
    let portSpecifiedInArgs = false
    for (let i = 0; i < server.args.length - 1; i++) {
      if (server.args[i] === '--port') {
        portSpecifiedInArgs = true
        break
      }
    }

    if (!portSpecifiedInArgs) {
      server.args.push('--port', port.toString())
      logger.info(`Updated server args with dynamically assigned port: ${port}`)
    }

    // Check if a server is already responding at the port with a quick port check
    const portResponding = await isPortOpen('localhost', port)
    if (portResponding) {
      logger.info(`Server already running on port ${port}`)

      if (await checkServerHealth(server, port)) {
        // Server is already running and healthy
        return await handleHttpServerSuccess(server, port)
      }

      logger.warn(`A different server appears to be running on port ${port}. Failed health check.`)
      return false
    }

    // Check existing container status
    if (await isContainerRunning(name)) {
      logger.info(`Container ${name} is already running.`)
      const isHealthy = await checkServerHealth(server, port)

      if (isHealthy) {
        return await handleHttpServerSuccess(server, port)
      }

      return isHealthy
    }

    // Clean up any existing containers
    await stopAndRemoveContainer(name)

    // Start new container
    const containerConfig = {
      imageName: server.image,
      containerName: name,
      args: server.args,
      envFile: getEnvFilePath(name),
      detached: true,
      ports: [{ hostPort: port, containerPort: port }],
    }

    const result = await runContainer(containerConfig)
    if (!result.success) {
      return await handleHttpServerFailure(
        server,
        `Failed to start ${name} container: ${result.error}`,
      )
    }

    logger.info(`Started ${name} container. Waiting for server to initialize...`)

    // Wait for server initialization with quick port checks first
    let serverAvailable = false
    const maxAttempts = 10
    const intervalMs = 1000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))

      if (await isPortOpen('localhost', port)) {
        serverAvailable = true
        break
      }

      logger.debug(`Waiting for server (attempt ${attempt + 1}/${maxAttempts})...`)
    }

    if (!serverAvailable) {
      return await handleHttpServerFailure(
        server,
        'Server did not become available within the timeout period.',
      )
    }

    // Final health check to ensure server is functioning correctly
    if (!await checkServerHealth(server, port)) {
      return await handleHttpServerFailure(server, `Health check failed for ${name}`)
    }

    // Server started successfully
    return await handleHttpServerSuccess(server, port)
  } catch (error) {
    logger.error(`Error starting HTTP server ${name}:`, error)
    return false
  }
}

/**
 * Validate STDIO-based MCP server
 *
 * STDIO servers are not kept running; we only validate they can run
 */
async function validateStdioServer(server: McpServerConfig): Promise<boolean> {
  const { name, image } = server

  try {
    if (server.type !== 'stdio') {
      logger.error(`Server ${name} is configured as STDIO type but has invalid type`)
      return false
    }

    logger.info(`Validating ${name} STDIO server...`)

    const isValid = await validateServerHealth(server)

    if (!isValid) {
      logger.error(`Validation failed for ${name}`)
      await updateAndSaveServerState(name, false)
      return false
    }

    // Update the state file - mark as validated but not running
    // STDIO servers aren't continuously running, but we store their config
    const endpoint = `command:docker:${image}`
    await updateAndSaveServerState(name, false, endpoint)

    logger.info(`${name} validation successful!`)
    logger.info(
      'NOTE: STDIO servers run on-demand when called from Cursor.\nNo persistent container is needed.',
    )

    return true
  } catch (error) {
    logger.error(`Error validating STDIO server ${name}:`, error)
    return false
  }
}

/**
 * Stop an MCP server
 *
 * @param server Server configuration
 * @returns True if server was stopped successfully, false otherwise
 */
async function stopServer(server: McpServerConfig): Promise<boolean> {
  const { name, description, type } = server

  try {
    logger.info(`Stopping ${description} (${name})...`)

    if (type === 'stdio') {
      logger.info(`${name} is a STDIO server and does not need to be stopped.`)
      return true
    }

    const success = await stopAndRemoveContainer(name)
    if (!success) {
      logger.error(`Failed to stop ${name}`)
      return false
    }

    // Update the state file to mark server as offline
    await updateAndSaveServerState(name, false)

    // Also update Cursor config to reflect the new server state
    // This ensures Cursor knows the server is now offline
    await updateCursorConfigForServer(server, true)

    logger.info(`${name} stopped successfully.`)
    return true
  } catch (error) {
    logger.error(`Error stopping ${name}:`, error)
    return false
  }
}

/**
 * Perform health check on an MCP server
 *
 * @param server Server configuration
 * @returns True if healthy, false otherwise
 */
async function healthCheck(server: McpServerConfig): Promise<boolean> {
  const { name, description } = server

  try {
    logger.info(`Performing health check for ${description} (${name})...`)

    // For HTTP servers, verify container is running first
    if (server.type === 'http') {
      const containerRunning = await isContainerRunning(name)
      if (!containerRunning) {
        logger.error(`Container ${name} is not running`)
        return false
      }
    }

    if (!server.healthValidator) {
      logger.info(`Skipping health check for ${name} as no healthValidator is configured`)
      return true
    }

    // Use the standardized health validator for all server types
    const isHealthy = await validateServerHealth(server)

    if (isHealthy) {
      logger.info(`Health check passed for ${name}`)
    } else {
      logger.error(`Health check failed for ${name}`)
    }

    return isHealthy
  } catch (error) {
    logger.error(`Error performing health check for ${name}:`, error)
    return false
  }
}

/**
 * Check if a server is running
 *
 * @param server Server configuration
 * @returns True if server is running, false otherwise
 */
async function isServerRunning(server: McpServerConfig): Promise<boolean> {
  const { name, type } = server

  try {
    if (type === 'http') {
      // First check if the container is running by name
      const containerRunning = await isContainerRunning(name)
      if (containerRunning) return true

      // Get the current state to find the stored endpoint with port
      const state = await loadState()
      const serverState = getServerState(state, name)

      // If server has a known endpoint in the state file, extract and check that port
      if (serverState?.endpoint) {
        const portMatch = serverState.endpoint.match(/:(\d+)\//)
        if (portMatch?.[1]) {
          const port = Number.parseInt(portMatch[1], 10)
          if (!Number.isNaN(port)) {
            // Check if that specific port is responding
            return await isPortOpen('localhost', port)
          }
        }
      }

      // If no endpoint in state, fall back to checking args
      // But do NOT get a random port - only check the configured one
      for (let i = 0; i < server.args.length - 1; i++) {
        if (server.args[i] === '--port') {
          const port = Number.parseInt(server.args[i + 1], 10)
          if (!Number.isNaN(port)) {
            return await isPortOpen('localhost', port)
          }
        }
      }

      // If we get here, we couldn't determine the port to check
      logger.debug(`Could not determine port for ${name}, can't check if it's running`)
      return false
    }

    if (type === 'stdio') {
      // STDIO servers are considered "running" if their validation passes
      // But since they run on demand, always return false for server status display
      return false
    }

    logger.error(`Unknown server type: ${type}`)
    return false
  } catch (error) {
    logger.error(`Error checking if ${name} is running:`, error)
    return false
  }
}

/**
 * Update Docker image for a server
 *
 * @param server Server configuration
 * @returns True if update successful, false otherwise
 */
async function updateServerImage(server: McpServerConfig): Promise<boolean> {
  const { name, description, image } = server

  try {
    logger.info(`Updating Docker image for ${description} (${name})...`)

    const pulled = await pullDockerImage(image)
    if (!pulled) {
      logger.error(`Failed to update image for ${name}`)
      return false
    }

    logger.info(`Successfully updated image for ${name}`)
    return true
  } catch (error) {
    logger.error(`Error updating image for ${name}:`, error)
    return false
  }
}

/**
 * Update Cursor MCP configuration for a server
 * This should be called whenever a server is started, stopped, or has its configuration changed
 *
 * @param server Server configuration
 * @param forceUpdate Whether to force update without prompting
 * @returns True if update was successful or user declined, false if it failed
 */
async function updateCursorConfigForServer(
  server: McpServerConfig,
  forceUpdate = false,
): Promise<boolean> {
  try {
    // Get app configuration
    const appConfig = await getAppConfig()
    const mcpConfigPath = appConfig.CURSOR_MCP_CONFIG_PATH

    if (!mcpConfigPath) {
      logger.debug('Cursor MCP config file path not configured, skipping config update')
      return true
    }

    // Transform server config for Cursor
    const transformedConfig = await transformServerConfigForCursor(server)

    // Get current Cursor MCP config
    const currentServers = await getMcpServers(mcpConfigPath)

    // Check if the server already exists in Cursor config
    const serverInConfig = !!currentServers[server.name]

    // Check if the configuration has changed by comparing with existing entry
    let configChanged = false
    if (serverInConfig) {
      const currentConfig = currentServers[server.name]
      const currentConfigStr = JSON.stringify(currentConfig)
      const newConfigStr = JSON.stringify(transformedConfig)
      configChanged = currentConfigStr !== newConfigStr

      if (!configChanged) {
        logger.debug(`Cursor config for ${server.name} is already up-to-date, no update needed`)
        return true
      }

      logger.debug(`Cursor config for ${server.name} has changed, update needed`)
    }

    // If not forcing update, prompt the user for confirmation
    let shouldUpdate = forceUpdate
    if (!forceUpdate) {
      const action = serverInConfig ? 'update' : 'add'
      shouldUpdate = await confirm(
        `Would you like to automatically ${action} ${server.description} (${server.name}) in your Cursor MCP config at ${mcpConfigPath}?`,
      )
    }

    if (shouldUpdate) {
      // Create the server config entry
      const serverConfig = {
        [server.name]: transformedConfig,
      }

      // Add to Cursor config
      const added = await addMcpServers(mcpConfigPath, serverConfig)

      if (added) {
        logger.info(
          `Successfully ${
            serverInConfig ? 'updated' : 'added'
          } ${server.name} in your Cursor MCP config at ${mcpConfigPath}`,
        )
        // Pass the transformed config and true to skip manual config instructions
        displayCursorConfig(server, transformedConfig, true)
        return true
      }

      logger.error(`Failed to update Cursor config for ${server.name}`)
      // Fall back to displaying manual instructions
      displayCursorConfig(server, transformedConfig, false)
      return false
    }

    logger.info('Manual configuration required:')
    // Display full manual instructions
    displayCursorConfig(server, transformedConfig, false)
    return true // User intentionally chose not to update, so consider it "successful"
  } catch (error) {
    logger.error(`Error updating Cursor config for ${server.name}: ${error}`)
    // Fall back to displaying manual instructions with the transformed config
    try {
      const transformedConfig = await transformServerConfigForCursor(server)
      displayCursorConfig(server, transformedConfig, false)
    } catch (e) {
      logger.error(`Failed to generate Cursor config: ${e}`)
    }
    return false
  }
}

/**
 * Start an MCP server
 *
 * @param server Server configuration
 * @returns True if server started successfully, false otherwise
 */
async function startServer(server: McpServerConfig): Promise<boolean> {
  const { name, description, image, type } = server
  logger.info(`Starting ${description} (${name})...`)

  try {
    // Verify environment file exists
    if (!await checkEnvFile(server)) return false

    // Ensure Docker image is available
    if (!await isDockerImagePulled(image)) {
      const pulled = await pullDockerImage(image)
      if (!pulled) {
        logger.error(`Failed to pull Docker image for ${name}. Aborting.`)
        return false
      }
    }

    // Server type-specific startup logic
    const startupHandlers = {
      http: () => startHttpServer(server),
      stdio: () => validateStdioServer(server),
    }

    const handler = startupHandlers[type]
    if (!handler) {
      logger.error(`Unknown server type: ${type}`)
      return false
    }

    const success = await handler()

    // If server started successfully, update Cursor config
    if (success) {
      await updateCursorConfigForServer(server)
    }

    return success
  } catch (error) {
    logger.error(`Error starting ${name}:`, error)
    return false
  }
}

export {
  checkDockerAvailability,
  checkEnvFile,
  checkServerHealth,
  getAbsoluteEnvFilePathForCursor,
  getPortFromArgs,
  getRelativeEnvFilePathForCursor,
  healthCheck,
  isServerRunning,
  startServer,
  stopServer,
  transformServerConfigForCursor,
  updateAndSaveServerState,
  updateCursorConfigForServer,
  updateServerImage,
}
