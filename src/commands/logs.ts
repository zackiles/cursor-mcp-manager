import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import { getMcpServerConfigs } from '../config.ts'
import { isServerRunning } from '../orchestrator.ts'
import { isContainerRunning } from '../services/docker-service.ts'
import { validateServerSelection } from '../utils/server-validator.ts'

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'logs',
  command: command,
  description: 'Display logs from MCP server Docker containers',
  options: {
    boolean: ['stream'],
    default: { stream: false },
    alias: { s: 'stream' },
  },
}

/**
 * Format a single log line
 */
function formatLogLine(line: string): string {
  // Skip completely empty lines
  if (line.trim() === '') {
    return ''
  }

  let result = line

  // Remove Python byte string prefixes/suffixes (b'...' or b"...")
  result = result.replace(/b['"](.*)['"]/g, '$1')

  // Handle escaped JSON/strings
  result = result
    .replace(/\\"/g, '"') // Replace escaped quotes
    .replace(/\\n/g, '\n') // Replace escaped newlines
    .replace(/\\r/g, '') // Remove carriage returns
    .replace(/\\t/g, '    ') // Replace tabs with spaces
    .replace(/\\'/g, "'") // Replace escaped single quotes

  // Fix double backslashes more carefully - only replace if not followed by another special char
  result = result.replace(/\\\\([^ntr'"])/g, '\\$1')

  // Fix common serialization artifacts
  result = result.replace(/"{/g, '{').replace(/}"/g, '}')

  // Remove trailing quote followed by newline that the user specifically requested to remove
  result = result.replace(/'\r?\n/g, '')
  result = result.replace(/"\r?\n/g, '')

  // Trim trailing whitespace
  result = result.trimEnd()

  return result
}

/**
 * Format multi-line log text by applying formatLogLine to each line
 * and handling consecutive blank lines.
 */
function formatLogText(text: string): string {
  if (!text || text.trim() === '') {
    return ''
  }

  // Split into lines and process each line
  const lines = text.split('\n')

  // Format each line and handle consecutive blank lines
  const formattedLines: string[] = []
  let previousLineEmpty = false

  for (const line of lines) {
    const formattedLine = formatLogLine(line)
    const isEmpty = !formattedLine

    // Skip consecutive empty lines
    if (isEmpty && previousLineEmpty) {
      continue
    }

    if (formattedLine) {
      formattedLines.push(formattedLine)
    } else if (!previousLineEmpty) {
      // Add a single blank line when needed
      formattedLines.push('')
    }

    previousLineEmpty = isEmpty
  }

  return formattedLines.join('\n')
}

/**
 * Process a readable stream and format each line
 */
async function processStream(
  stream: ReadableStream<Uint8Array>,
  isError = false,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Add new text to existing buffer
      buffer += decoder.decode(value, { stream: true })

      // Process complete lines
      const lines = buffer.split('\n')

      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || ''

      // Process and output complete lines
      for (const line of lines) {
        const formattedLine = formatLogLine(line)
        if (formattedLine) { // Only output non-empty lines
          if (isError) {
            console.error(formattedLine)
          } else {
            console.log(formattedLine)
          }
        }
      }
    }

    // Process any remaining text in buffer
    if (buffer) {
      const formattedLine = formatLogLine(buffer)
      if (formattedLine) {
        if (isError) {
          console.error(formattedLine)
        } else {
          console.log(formattedLine)
        }
      }
    }
  } catch (error) {
    console.error(`Error reading stream: ${error}`)
  } finally {
    reader.releaseLock()
  }
}

/**
 * Stream logs from a container and format them in real-time
 */
async function streamFormattedLogs(containerNames: string[]): Promise<void> {
  try {
    // Build args for docker logs
    const args = ['logs', '--follow', '--tail', '100', ...containerNames]

    // Start the docker logs process with piped output
    const command = new Deno.Command('docker', {
      args,
      stdout: 'piped',
      stderr: 'piped',
    })

    const process = command.spawn()

    // Start processing both stdout and stderr
    const stdoutPromise = processStream(process.stdout)
    const stderrPromise = processStream(process.stderr, true)

    // Wait for the process to finish
    await Promise.all([stdoutPromise, stderrPromise, process.status])
  } catch (error) {
    logger.error(`Error streaming logs: ${error}`)
  }
}

async function command(
  { args, routes: _ }: CommandRouteOptions,
): Promise<void> {
  // Check if streaming mode is enabled
  const streamMode = args.stream === true

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

  // Get running servers
  const runningServers = []

  for (const server of serversToProcess) {
    // Skip STDIO servers as they don't have persistent containers
    if (server.type === 'stdio') {
      logger.info(
        `Skipping ${server.name} as STDIO servers don't have persistent logs`,
      )
      continue
    }

    const isRunning = await isContainerRunning(server.name)

    if (isRunning) {
      runningServers.push(server)
    } else {
      logger.info(`Server ${server.name} is not running, skipping logs`)
    }
  }

  if (runningServers.length === 0) {
    logger.error('No running servers found to display logs from')
    return
  }

  // Display logs
  if (streamMode) {
    // For streaming mode, use our custom streaming function
    if (runningServers.length === 1) {
      // Single server streaming
      const server = runningServers[0]
      logger.info(`Streaming logs for ${server.name}. Press Ctrl+C to exit.`)

      await streamFormattedLogs([server.name])
    } else {
      // Multiple servers streaming
      logger.info(
        `Streaming logs for ${runningServers.length} servers. Press Ctrl+C to exit.`,
      )

      const serverNames = runningServers.map((server) => server.name)
      await streamFormattedLogs(serverNames)
    }
  } else {
    // Non-streaming mode: display last 100 lines with pretty formatting
    for (const server of runningServers) {
      console.log('\n')
      console.log(
        '╔═════════════════════════════════════════════════════════════════════════════',
      )
      console.log(`║ Logs for ${server.name} (last 100 lines)`)
      console.log(
        '╚═════════════════════════════════════════════════════════════════════════════',
      )
      console.log('')

      const command = new Deno.Command('docker', {
        args: ['logs', '--tail', '100', server.name],
        stdout: 'piped',
        stderr: 'piped',
      })

      const { stdout, stderr } = await command.output()

      const stdoutText = formatLogText(new TextDecoder().decode(stdout))
      const stderrText = formatLogText(new TextDecoder().decode(stderr))

      if (stdoutText) {
        console.log(stdoutText)
      }

      if (stderrText) {
        console.log('\n--- STDERR ---')
        console.log(stderrText)
      }

      if (!stdoutText && !stderrText) {
        console.log('No logs available')
      }

      console.log('\n')
    }
  }
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
