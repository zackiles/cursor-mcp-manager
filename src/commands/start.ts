import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getAppConfig, getMcpServerConfigs } from '../config.ts'
import { checkDockerAvailability, startServer } from '../orchestrator.ts'
import {
  loadState,
  saveState,
  syncStateWithConfig,
  updateServerStatus,
} from '../state.ts'
import { validateServerSelection } from '../utils/server-validator.ts'
import { dryRunAddServers } from '../utils/dry-run.ts'

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'start',
  command: command,
  description: 'Start MCP servers',
  options: {
    boolean: ['dry-run'],
    default: { 'dry-run': false },
    alias: { d: 'dry-run' },
  },
}

async function command(
  { args, routes: _ }: CommandRouteOptions,
): Promise<void> {
  // Check if dry run mode is enabled
  const isDryRun = args['dry-run'] === true
  if (isDryRun) {
    logger.info('Dry run mode enabled - no actual changes will be made')
  }

  // Load server configurations
  const serverConfigs = await getMcpServerConfigs()
  const appConfig = await getAppConfig()

  if (serverConfigs.length === 0) {
    logger.error('No MCP server configurations found')
    return
  }

  // Load current state
  let currentState = await loadState()

  // Sync state with current configuration
  currentState = syncStateWithConfig(currentState, serverConfigs)

  // Save the synced state to ensure all servers are persisted
  await saveState(currentState)

  const targetServer = args.server as string | undefined

  // Validate the server selection if a specific one is requested
  if (targetServer && !(await validateServerSelection(targetServer))) {
    return
  }

  // Filter servers if a specific one is requested
  const serversToProcess = targetServer
    ? serverConfigs.filter((s) => s.name === targetServer)
    : serverConfigs

  if (serversToProcess.length === 0 && targetServer) {
    logger.error(
      `Server "${targetServer}" not found. Available servers: ${
        serverConfigs.map((s) => s.name).join(', ')
      }`,
    )
    return
  }

  // For dry run mode, show a single aggregate config comparison for all servers to process
  if (isDryRun) {
    await dryRunAddServers(serversToProcess)
    return // Exit early for dry run
  }

  // Check Docker availability for actual runs
  if (!await checkDockerAvailability()) {
    await saveState(currentState) // Save state even if Docker is not available
    return
  }

  // Process each server
  for (const server of serversToProcess) {
    // Start the server (default action)
    logger.info(`Starting server ${server.name}...`)
    const success = await startServer(server)

    // Reload state to capture any changes made during server start
    // (e.g., user preferences saved by the orchestrator)
    currentState = await loadState()

    // Re-sync with configurations to ensure all servers are present
    currentState = syncStateWithConfig(currentState, serverConfigs)

    // Update state based on start result
    if (success) {
      currentState = updateServerStatus(currentState, server.name, true)
      logger.info(`Server ${server.name} started successfully.`)

      // Log CURSOR_MCP_CONFIG_PATH content
      const mcpConfigPath = appConfig.CURSOR_MCP_CONFIG_PATH
      if (mcpConfigPath) {
        try {
          const rawContent = await Deno.readTextFile(mcpConfigPath)
          try {
            const jsonContent = JSON.parse(rawContent)
            // Pass the parsed JSON object as a separate argument for masking
            logger.debug('Contents of Cursor MCP config:', jsonContent)
          } catch (parseError) {
            // If parsing fails, log a warning without the raw content.
            logger.warn(
              `Could not parse ${mcpConfigPath} as JSON. Error: ${
                (parseError as Error).message
              }`,
            )
          }
        } catch (err) {
          if (err instanceof Deno.errors.NotFound) {
            logger.debug('Cursor MCP config file not found')
          } else {
            logger.warn(
              `Error reading Cursor MCP config file: ${(err as Error).message}`,
            )
          }
        }
      }
    } else {
      currentState = updateServerStatus(currentState, server.name, false)
      logger.error(`Failed to start ${server.name}`)
    }
  }

  // Save final state
  await saveState(currentState)
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
