import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getMcpServerConfigs } from '../config.ts'
import { healthCheck, updateCursorConfigForServer } from '../orchestrator.ts'
import {
  loadState,
  saveState,
  syncStateWithConfig,
  updateServerStatus,
} from '../state.ts'
import { validateServerSelection } from '../utils/server-validator.ts'

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'health-check',
  command: command,
  description: 'Run health checks on MCP servers',
  options: {},
}

async function command({ args }: CommandRouteOptions): Promise<void> {
  const serverConfigs = await getMcpServerConfigs()

  if (serverConfigs.length === 0) {
    logger.error('No MCP server configurations found')
    return
  }

  let currentState = await loadState()
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

  // Print header
  const header = '='.repeat(50)
  logger.info(`${header}\nMCP Server Health Check\n${header}`)

  let allHealthy = true

  // Check each server
  for (const server of serversToProcess) {
    logger.info(`Checking health of ${server.name}...`)

    const result = await healthCheck(server)
    const status = result ? 'HEALTHY' : 'UNHEALTHY'
    logger.info(`${server.name}: ${status}`)

    // Update the state
    currentState = updateServerStatus(currentState, server.name, result)

    // Also update Cursor config to reflect the current server health status
    // This ensures Cursor always has the correct server information
    await updateCursorConfigForServer(server, true) // Force update without prompting

    if (!result) {
      allHealthy = false
    }
  }

  await saveState(currentState)

  // Provide summary
  logger.info(
    `${header}\nHealth Check Summary: ${
      allHealthy ? 'ALL HEALTHY' : 'ISSUES DETECTED'
    }\n${header}`,
  )
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
