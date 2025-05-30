import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getMcpServerConfigs } from '../config.ts'
import { checkDockerAvailability, updateServerImage } from '../orchestrator.ts'
import { validateServerSelection } from '../utils/server-validator.ts'

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'update',
  command: command,
  description: 'Update MCP server Docker images',
  options: {},
}

async function command({ args }: CommandRouteOptions): Promise<void> {
  // Load server configurations
  const serverConfigs = await getMcpServerConfigs()

  if (serverConfigs.length === 0) {
    logger.error('No MCP server configurations found')
    return
  }

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

  // Check Docker availability
  if (!await checkDockerAvailability()) {
    return
  }

  // Print header
  const header = '='.repeat(60)
  logger.info(`${header}\nUpdating MCP Server Images\n${header}`)

  let allSuccessful = true
  const successCount = { http: 0, stdio: 0 }
  const failCount = { http: 0, stdio: 0 }

  // Update each server
  for (const server of serversToProcess) {
    logger.info(`Updating image for ${server.name} (${server.image})...`)

    const success = await updateServerImage(server)
    const statusText = success ? 'SUCCESS' : 'FAILED'
    logger.info(`${server.name} image update: ${statusText}`)

    if (success) {
      successCount[server.type]++
    } else {
      failCount[server.type]++
      allSuccessful = false
    }
  }

  // Print summary
  logger.info(`${header}\nUpdate Summary\n${header}`)
  logger.info(
    `HTTP Servers: ${successCount.http} updated, ${failCount.http} failed`,
  )
  logger.info(
    `STDIO Servers: ${successCount.stdio} updated, ${failCount.stdio} failed`,
  )
  logger.info(
    `${header}\nUpdate ${
      allSuccessful ? 'COMPLETED SUCCESSFULLY' : 'COMPLETED WITH ERRORS'
    }\n${header}`,
  )

  // Optional instructions for next steps
  if (allSuccessful) {
    logger.info('To start using the updated servers, run:')
    if (targetServer) {
      logger.info(`deno task start --server=${targetServer}`)
    } else {
      logger.info('deno task start')
    }
  } else {
    logger.warn('Some updates failed. Check the logs above for details.')
  }
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
