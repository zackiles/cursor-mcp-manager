import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getMcpServerConfigs } from '../config.ts'
import { isServerRunning } from '../orchestrator.ts'
import {
  loadState,
  saveState,
  syncStateWithConfig,
} from '../state.ts'
import { validateServerSelection } from '../utils/server-validator.ts'

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'sync',
  command: command,
  description: 'Sync MCP server state with disk configuration',
  options: {},
}

async function command({ args }: CommandRouteOptions): Promise<void> {
  // Load server configurations
  const serverConfigs = await getMcpServerConfigs()

  if (serverConfigs.length === 0) {
    logger.error('No MCP server configurations found')
    return
  }

  // Load current state
  let currentState = await loadState()

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

  // Sync state with all configurations first
  currentState = syncStateWithConfig(currentState, serverConfigs)

  // Print header
  const header = '='.repeat(40)
  logger.info(`${header}\nSyncing MCP Server State\n${header}`)

  // Update the running status for each server
  for (const server of serversToProcess) {
    logger.info(`Checking status for ${server.name}...`)
    const isRunning = await isServerRunning(server)

    // Update state based on actual status
    const mcpIndex = currentState.mcps.findIndex((mcp) =>
      mcp.name === server.name
    )
    if (mcpIndex !== -1) {
      currentState.mcps[mcpIndex] = {
        ...currentState.mcps[mcpIndex],
        online: isRunning,
      }
    }

    logger.info(`${server.name}: ${isRunning ? 'RUNNING' : 'STOPPED'}`)
  }

  // Save updated state
  await saveState(currentState)
  logger.info(`${header}\nSync completed\n${header}`)
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
