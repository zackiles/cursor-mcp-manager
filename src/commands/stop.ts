import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getAppConfig, getMcpServerConfigs } from '../config.ts'
import { checkDockerAvailability, stopServer, updateCursorConfigForServer } from '../orchestrator.ts'
import {
  loadState,
  saveState,
  syncStateWithConfig,
  updateServerStatus,
  getServerState,
} from '../state.ts'
import { validateServerSelection } from '../utils/server-validator.ts'
import { dryRunRemoveServers } from '../utils/dry-run.ts'
import { removeMcpServers } from '../services/cursor-service.ts'

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'stop',
  command: command,
  description: 'Stop MCP servers',
  options: {
    boolean: ['dry-run'],
    default: { 'dry-run': false },
    alias: { d: 'dry-run' },
  },
}

async function command({ args }: CommandRouteOptions): Promise<void> {
  // Check if dry run mode is enabled
  const isDryRun = args['dry-run'] === true
  if (isDryRun) {
    logger.info('Dry run mode enabled - no actual changes will be made')
  }

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
    await dryRunRemoveServers(serversToProcess)
    return // Exit early for dry run
  }

  if (!await checkDockerAvailability()) {
    await saveState(currentState) // Save state even if Docker is not available
    return
  }

  // Keep track of servers to remove from cursor config
  const serversToRemoveFromConfig: string[] = []

  // Process each server
  for (const server of serversToProcess) {
    const success = await stopServer(server)
    if (success) {
      currentState = updateServerStatus(currentState, server.name, false)
      logger.info(`${server.name} stopped successfully.`)

      // Check if user wants us to manage their Cursor config for this server
      const serverState = getServerState(currentState, server.name)
      if (serverState?.manageCursorConfig === true) {
        // User previously said yes, so add to the list of servers to remove
        serversToRemoveFromConfig.push(server.name)
        logger.debug(`Will remove ${server.name} from Cursor MCP config`)
      } else if (serverState?.manageCursorConfig === false) {
        // User previously said no, so skip updating Cursor config
        logger.debug(`Skipping Cursor config update for ${server.name} (user previously declined)`)
      } else {
        // manageCursorConfig is undefined - user was never asked
        logger.debug(`Skipping Cursor config update for ${server.name} (user was never asked)`)
      }
    } else {
      logger.error(`Failed to stop ${server.name}.`)
    }
  }

  // Remove servers from Cursor config if any need to be removed
  if (serversToRemoveFromConfig.length > 0) {
    const mcpConfigPath = appConfig.CURSOR_MCP_CONFIG_PATH
    if (mcpConfigPath) {
      const removed = await removeMcpServers(mcpConfigPath, serversToRemoveFromConfig)
      if (removed) {
        logger.info(
          `Removed ${serversToRemoveFromConfig.length} server(s) from Cursor MCP config: ${
            serversToRemoveFromConfig.join(', ')
          }`,
        )
      } else {
        logger.error('Failed to remove servers from Cursor MCP config')
      }

      // Log updated CURSOR_MCP_CONFIG_PATH content
      try {
        const rawContent = await Deno.readTextFile(mcpConfigPath)
        try {
          const jsonContent = JSON.parse(rawContent)
          // Pass the parsed JSON object as a separate argument for masking
          logger.debug('Updated contents of Cursor MCP config:', jsonContent)
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
    } else {
      logger.debug('No Cursor MCP config path configured, skipping removal')
    }
  }

  // Save updated state
  await saveState(currentState)
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
