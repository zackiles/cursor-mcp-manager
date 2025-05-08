/**
 * Presentation utilities
 *
 * Functions for displaying server information, configuration, and status
 *
 * @module
 */
import logger from './utils/logger.ts'
import { dedent } from '@qnighy/dedent'
import type { CursorMcpEntry, McpServerConfig, McpStateFile } from './types.ts'
import { getServerState } from './state.ts'
import { getEnvExampleFilePath, getEnvFilePath, getExamplesPath } from './config.ts'
import { join } from '@std/path'
import { exists } from '@std/fs'
import * as colors from '@std/fmt/colors'
import { promptSelect } from '@std/cli/unstable-prompt-select'

/**
 * Ask the user a yes/no question using promptSelect
 *
 * @param question The question to ask
 * @param defaultYes Whether the default answer is yes
 * @returns True if the user answered yes, false otherwise
 */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const defaultOption = defaultYes ? 'Yes' : 'No'
  const options = defaultYes ? ['Yes', 'No'] : ['No', 'Yes']

  try {
    const response = promptSelect(question, options, { clear: false })
    return response === 'Yes'
  } catch (error) {
    // Fall back to default if there's an error or user cancels
    logger.debug(`Prompt error: ${error}, using default: ${defaultOption}`)
    return defaultYes
  }
}

/**
 * Display configuration instructions for Cursor
 *
 * @param server Server configuration
 * @param transformedConfig The cursor configuration generated from the server config
 * @param skipConfigInstructions Whether to skip displaying manual configuration instructions
 */
function displayCursorConfig(
  server: McpServerConfig,
  transformedConfig: CursorMcpEntry,
  skipConfigInstructions = false,
): void {
  logger.info(dedent`\
    === Configuration Instructions ===
    MCP Server: ${server.description} (${server.name})`)

  // Display URL for HTTP-type configurations
  if ('url' in transformedConfig) {
    logger.info(`URL: ${transformedConfig.url}`)
  }

  // Only display manual configuration steps if not skipped
  if (!skipConfigInstructions) {
    // Display configuration steps
    logger.info(dedent`\
      To configure in Cursor:
      1. Open Cursor Settings
      2. Navigate to: Settings → Features → MCP Servers → + Add new global MCP server
      3. Add the following configuration:`)
    logger.info(JSON.stringify(
      {
        mcpServers: {
          [server.name]: transformedConfig,
        },
      },
      null,
      2,
    ))

    // Extract test prompt from postStartInstructions or use generic one
    let testPrompt = 'Test connection to the MCP server'
    if (server.postStartInstructions) {
      // Try to find a test prompt in the instructions
      const match = server.postStartInstructions.match(/Try using (.*?)(\n|$)/i)
      if (match?.[1]) {
        testPrompt = match[1].trim()
      }
    }

    // Add guidance for testing
    logger.info(dedent`\
      4. After setting up, test by typing this in Cursor chat:
         "${testPrompt}"
      ===============================`)
  } else {
    // Extract test prompt from postStartInstructions or use generic one
    let testPrompt = 'Test connection to the MCP server'
    if (server.postStartInstructions) {
      // Try to find a test prompt in the instructions
      const match = server.postStartInstructions.match(/Try using (.*?)(\n|$)/i)
      if (match?.[1]) {
        testPrompt = match[1].trim()
      }
    }

    logger.info(dedent`\
      Test by typing this in Cursor chat:
      "${testPrompt}"
      ===============================`)
  }

  // Display post-start instructions if available
  if (server.postStartInstructions) {
    logger.info(server.postStartInstructions)
  }
}

/**
 * Display the status of all servers
 *
 * @param servers List of server configurations
 * @param mcpState Current state of MCP servers
 */
function displayServerStatus(
  servers: McpServerConfig[],
  mcpState: McpStateFile,
): void {
  logger.info('\n=== MCP Server Status ===')

  if (servers.length === 0) {
    logger.info('No MCP servers configured')
    return
  }

  for (const server of servers) {
    const serverState = getServerState(mcpState, server.name)
    const isRunning = serverState?.online || false

    logger.info(dedent`\
      ${server.description} (${server.name}):
        Status: ${isRunning ? 'Running' : 'Stopped'}
        Type: ${server.type.toUpperCase()}`)

    if (server.type === 'http') {
      // Get port from the server state if available, or from args
      // This avoids the need to call getPortFromArgs which is now async
      let portDisplay = 'Not specified'

      // Try to get port from server args (as a simple parse)
      for (let i = 0; i < server.args.length - 1; i++) {
        if (server.args[i] === '--port') {
          const port = server.args[i + 1]
          if (port) {
            portDisplay = port
            break
          }
        }
      }

      // If we have a server state with endpoint, extract port from URL
      if (serverState?.online && serverState.endpoint) {
        const url = serverState.endpoint
        const portMatch = url.match(/:(\d+)\//)
        if (portMatch?.[1]) {
          portDisplay = portMatch[1]
        }
      }

      logger.info(dedent`\
        Port: ${portDisplay}
        Endpoint: /sse`)
    }

    logger.info(dedent`\
      Docker Image: ${server.image}
      Environment: ${getEnvFilePath(server.name)}
    `)
  }

  logger.info('========================\n')
}

/**
 * Display the status of a single server with colorized output
 *
 * @param server Server configuration
 * @param isRunning Whether the server is running
 * @param endpoint Server endpoint URL (if running)
 */
function displaySingleServerStatus(
  server: McpServerConfig,
  isRunning: boolean,
  endpoint?: string,
): void {
  console.log(`\n${colors.bold(`${server.description || server.name} Status:`)}\n`)
  console.log(`Name: ${colors.cyan(server.name)}`)
  console.log(`Type: ${colors.cyan(server.type)}`)
  console.log(`Environment: ${colors.cyan(getEnvFilePath(server.name))}`)

  if (isRunning && endpoint) {
    console.log(`Status: ${colors.green('RUNNING')}`)
    console.log(`Endpoint: ${colors.cyan(endpoint)}`)
  } else {
    console.log(`Status: ${colors.red('STOPPED')}`)
  }
}

/**
 * Suggest how to create an environment file from the example
 *
 * @param server Server configuration
 */
async function suggestEnvFileCreation(server: McpServerConfig): Promise<void> {
  const envFilePath = getEnvFilePath(server.name)
  const envExampleFilePath = getEnvExampleFilePath(server.name)

  console.error(colors.red(`Environment file not found: ${envFilePath}`))
  console.error('You need to create an environment file with your credentials.\n')

  if (await exists(envExampleFilePath)) {
    console.error('You can create one by copying the example file:')
    console.error(colors.cyan(`cp ${envExampleFilePath} ${envFilePath}`))
  } else {
    // If server-specific example doesn't exist, check for a generic example
    const defaultExamplePath = join(
      getExamplesPath(),
      'mcp-generic.env.example',
    )
    if (await exists(defaultExamplePath)) {
      console.error('You can create one by copying the generic example file:')
      console.error(colors.cyan(`cp ${defaultExamplePath} ${envFilePath}`))
    } else {
      console.error('Create a new environment file:')
      console.error(colors.cyan(`touch ${envFilePath}`))
    }
  }

  console.error('\nThen edit the file to add your credentials and settings.')
}

export {
  displayCursorConfig,
  displayServerStatus,
  displaySingleServerStatus,
  suggestEnvFileCreation,
}
