import type { CommandRouteDefinition } from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getAppConfig } from '../config.ts'

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'version',
  command: command,
  description: 'Show version',
}

async function command(): Promise<void> {
  const config = await getAppConfig()

  logger.print(`${config.PACKAGE_VERSION}`)
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
