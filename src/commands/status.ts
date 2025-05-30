import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getMcpServerConfigs } from '../config.ts'
import { isServerRunning } from '../orchestrator.ts'
import { loadState, saveState, syncStateWithConfig } from '../state.ts'
import { validateServerSelection } from '../utils/server-validator.ts'

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'status',
  command: command,
  description: 'Check MCP server status',
  options: {
    // No specific options for status
  },
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

  // Print status header
  const header = '='.repeat(40)
  logger.info(`${header}\nMCP Server Status\n${header}`)

  // Check each server's status
  for (const server of serversToProcess) {
    // Determine if running and update status message
    const isRunning = await isServerRunning(server)
    const status = isRunning
      ? 'Running'
      : (server.type === 'stdio' ? 'On-Demand' : 'Stopped')
    const statusPadding = ' '.repeat(12 - status.length)
    const typePadding = ' '.repeat(6 - server.type.length)

    logger.info(
      `${server.name}:${
        ' '.repeat(20 - server.name.length)
      }[${status}]${statusPadding}Type: ${server.type}${typePadding}${server.description}`,
    )
  }

  // Save state updates
  await saveState(currentState)
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
