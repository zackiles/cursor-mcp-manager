import type { CommandRouteDefinition, CommandRouteOptions } from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getAppConfig } from '../config.ts'

// NOTE: If config is needed in the command, otherwise you can remove this.
// NOTE: the config singleton is automatically loaded in the entry point src/mod.ts which initializes the default config.
const config = await getAppConfig()

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'example',
  command: command,
  description: 'An example command template',
  options: {
    // Define command-specific options here
    // Global options like --server are handled by cli.ts and passed to all commands
    boolean: ['flag'],
    alias: { f: 'flag' },
  },
}

async function command({ args, routes }: CommandRouteOptions): Promise<void> {
  // Access command-specific arguments
  const flag = args.flag

  // Access global arguments (defined in cli.ts)
  // These are automatically passed to all commands
  const targetServer = args.server

  if (targetServer) {
    logger.info(`Flag: ${flag}`)
  }

  logger.print(`Command ${commandRouteDefinition.name} executed`, {
    args,
    config,
    routes,
  })
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
