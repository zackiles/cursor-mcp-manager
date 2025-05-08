import type { ParseOptions } from '@std/cli'
import { dedent } from '@qnighy/dedent'
import type { CommandRouteDefinition, CommandRouteOptions } from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getAppConfig } from '../config.ts'

const config = await getAppConfig()

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'help',
  command: command,
  description: 'Display help menu',
  options: {
    string: ['command'],
    alias: { c: 'command' },
  },
}

async function command({ args, routes }: CommandRouteOptions): Promise<void> {
  const targetCommand = args.command

  if (targetCommand) {
    // Show help for a specific command
    const cmd = routes.find((r) => r.name === targetCommand)
    if (!cmd) {
      logger.error(`Command '${targetCommand}' not found.`)
      return
    }

    logger.print(dedent`
      ${config.PACKAGE_NAME} - ${targetCommand}

      ${cmd.description || 'No description available'}

      ${cmd.options ? formatOptions(cmd.options) : ''}
    `)
    return
  }

  // Show general help
  logger.print(dedent`
    ${config.PACKAGE_NAME} - ${config.PACKAGE_DESCRIPTION}

    USAGE
      ${config.PACKAGE_NAME} <command> [options]

    COMMANDS
    ${formatCommands(routes)}
  `)
}

/**
 * Format commands for display in help text
 */
function formatCommands(routes: CommandRouteDefinition[]): string {
  return routes
    .map((route) => `  ${route.name.padEnd(15)} ${route.description || ''}`)
    .join('\n')
}

/**
 * Format command options for display in help text
 */
function formatOptions(options: ParseOptions): string {
  const sections: string[] = []

  // Handle boolean options
  if (options.boolean) {
    const booleanOptions = Array.isArray(options.boolean)
      ? options.boolean
      : typeof options.boolean === 'string'
      ? [options.boolean]
      : []

    if (booleanOptions.length > 0) {
      sections.push(
        `OPTIONS (FLAGS)
${
          booleanOptions
            .map((name: string) => {
              const alias = findAlias(
                options.alias as Record<string, string | readonly string[]>,
                name,
              )
              const aliasText = alias ? `, -${alias}` : ''
              return `  --${name}${aliasText}`
            })
            .join('\n')
        }`,
      )
    }
  }

  // Handle string options
  if (options.string) {
    const stringOptions = Array.isArray(options.string)
      ? options.string
      : typeof options.string === 'string'
      ? [options.string]
      : []

    if (stringOptions.length > 0) {
      sections.push(
        `OPTIONS (PARAMS)
${
          stringOptions
            .map((name: string) => {
              const alias = findAlias(
                options.alias as Record<string, string | readonly string[]>,
                name,
              )
              const aliasText = alias ? `, -${alias}` : ''
              return `  --${name}${aliasText} <value>`
            })
            .join('\n')
        }`,
      )
    }
  }

  return sections.join('\n\n')
}

/**
 * Find the alias for a command option
 */
function findAlias(
  alias: Record<string, string | readonly string[]> | undefined,
  name: string,
): string | undefined {
  if (!alias) return undefined

  for (const [key, value] of Object.entries(alias)) {
    if (value === name || (Array.isArray(value) && value.includes(name))) {
      return key
    }
  }

  return undefined
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
