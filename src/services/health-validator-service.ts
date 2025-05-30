/**
 * Health validator service
 *
 * Standardized health validation for MCP servers using JSON-RPC 2.0 requests
 * Works for both HTTP and STDIO transports
 */

import type { HealthValidatorConfig, McpServerConfig } from '../types.ts'
import logger from '../utils/logger.ts'
import { getServerState, loadState } from '../state.ts'

/**
 * Check if a port is responding to HTTP requests
 * A lightweight check for availability without performing full health validation
 *
 * @param host Host to check (usually localhost)
 * @param port Port to check
 * @param path Path to check (defaults to /sse for MCP servers)
 * @param timeoutMs Timeout in milliseconds
 * @returns True if port is open and responding, false otherwise
 */
async function isPortOpen(
  host: string,
  port: number,
  path = '/sse',
  timeoutMs = 2000,
): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    const url = `http://${host}:${port}${path}`
    const _response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // Any response means the port is open
    return true
  } catch (_error) {
    // Either timeout or connection refused means port is not open
    return false
  }
}

/**
 * Generate a unique request ID for JSON-RPC requests
 */
function generateRequestId(): number {
  return Math.floor(Math.random() * 10000) + 1
}

/**
 * Create a JSON-RPC 2.0 request object
 */
function createJsonRpcRequest(
  method: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: generateRequestId(),
    method,
    params,
  }
}

/**
 * Perform health validation for an HTTP server
 */
async function validateHttpHealth(
  server: McpServerConfig,
  validator: HealthValidatorConfig,
): Promise<boolean> {
  if (server.type !== 'http') {
    logger.error(`Server ${server.name} is not an HTTP server`)
    return false
  }

  // First, try to get the port from the state file
  let port: number | undefined = undefined

  try {
    const state = await loadState()
    const serverState = getServerState(state, server.name)

    if (serverState?.endpoint) {
      const portMatch = serverState.endpoint.match(/:(\d+)\//)
      if (portMatch?.[1]) {
        port = Number.parseInt(portMatch[1], 10)
        logger.debug(`Using port ${port} from state file for ${server.name}`)
      }
    }
  } catch (error) {
    logger.debug(`Error getting port from state file: ${error}`)
  }

  // If not found in state, extract port from server args
  if (!port) {
    port = 9000 // Default port
    for (let i = 0; i < server.args.length - 1; i++) {
      if (server.args[i] === '--port') {
        const parsedPort = Number.parseInt(server.args[i + 1], 10)
        if (!Number.isNaN(parsedPort)) {
          port = parsedPort
          logger.debug(`Using port ${port} from server args for ${server.name}`)
          break
        }
      }
    }
  }

  const timeoutMs = validator.timeoutMs || 5000

  try {
    const endpoint = `http://localhost:${port}/sse`
    const rpcRequest = createJsonRpcRequest(validator.method, validator.params)

    logger.debug(
      `Sending health validation request to ${endpoint}:`,
      rpcRequest,
    )

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      logger.error(`HTTP error: ${response.status} ${response.statusText}`)
      return false
    }

    const responseData = await response.json()
    logger.debug('Health validation response:', responseData)

    // Check for JSON-RPC error
    if (responseData.error) {
      logger.error(`JSON-RPC error: ${JSON.stringify(responseData.error)}`)
      return false
    }

    // Check for required response content if specified
    if (validator.responseContains) {
      const responseStr = JSON.stringify(responseData)
      if (!responseStr.includes(validator.responseContains)) {
        logger.error(
          `Response does not contain required string: "${validator.responseContains}"`,
        )
        return false
      }
    }

    return true
  } catch (error) {
    logger.error(`Error validating HTTP health for ${server.name}:`, error)
    return false
  }
}

/**
 * Perform health validation for a STDIO server
 */
async function validateStdioHealth(
  server: McpServerConfig,
  validator: HealthValidatorConfig,
): Promise<boolean> {
  if (server.type !== 'stdio') {
    logger.error(`Server ${server.name} is not a STDIO server`)
    return false
  }

  try {
    const rpcRequest = createJsonRpcRequest(validator.method, validator.params)
    const requestJson = JSON.stringify(rpcRequest)

    logger.debug(
      `Validating STDIO health for ${server.name} with request:`,
      rpcRequest,
    )

    const timeoutMs = validator.timeoutMs || 10000

    // Prepare command arguments
    const dockerArgs = [
      'run',
      '--rm',
      '-e',
      `TIMEOUT_MS=${timeoutMs}`,
      ...(server.args || []),
    ]

    // Add the image as the last argument
    dockerArgs.push(server.image)

    // Run the Docker command and pipe the request to stdin
    const command = new Deno.Command('docker', {
      args: dockerArgs,
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped',
    })

    const process = command.spawn()

    // Write the JSON-RPC request to stdin
    const writer = process.stdin.getWriter()
    const encoder = new TextEncoder()
    await writer.write(encoder.encode(`${requestJson}\n`))
    await writer.close()

    // Wait for the command to complete
    const { code, stdout, stderr } = await process.output()

    const stdoutText = new TextDecoder().decode(stdout)
    const stderrText = new TextDecoder().decode(stderr)

    if (code !== 0) {
      logger.error(
        `Docker command failed with exit code ${code}: ${stderrText}`,
      )
      return false
    }

    logger.debug('STDIO validation response:', stdoutText)

    // Parse the JSON-RPC response from stdout
    // Look for the first valid JSON object in the output (may contain log lines)
    let responseData: Record<string, unknown> | null = null
    try {
      const jsonLines = stdoutText.split('\n')
        .filter((line: string) => line.trim().startsWith('{'))

      for (const line of jsonLines) {
        try {
          const parsedData = JSON.parse(line) as Record<string, unknown>
          if (parsedData.id === rpcRequest.id) {
            responseData = parsedData
            break
          }
        } catch {
          // Skip invalid JSON lines
        }
      }

      if (!responseData) {
        throw new Error('No valid JSON response found in output')
      }
    } catch (parseError) {
      logger.error('Failed to parse JSON response:', parseError)
      return false
    }

    // Check for JSON-RPC error
    if (responseData.error) {
      logger.error(`JSON-RPC error: ${JSON.stringify(responseData.error)}`)
      return false
    }

    // Check for required response content if specified
    if (validator.responseContains) {
      const responseStr = JSON.stringify(responseData)
      if (!responseStr.includes(validator.responseContains)) {
        logger.error(
          `Response does not contain required string: "${validator.responseContains}"`,
        )
        return false
      }
    }

    return true
  } catch (error) {
    logger.error(`Error validating STDIO health for ${server.name}:`, error)
    return false
  }
}

/**
 * Validate the health of an MCP server using the standardized validator
 * This is the only method needed to check if a server is responding and healthy
 *
 * @param server MCP server configuration
 * @param options Optional validation options
 * @returns True if server is responding and healthy, false otherwise
 */
async function validateServerHealth(
  server: McpServerConfig,
  options?: { silent?: boolean },
): Promise<boolean> {
  if (!server.healthValidator) {
    if (!options?.silent) {
      logger.info(
        `Skipping health check for ${server.name} as no healthValidator is configured`,
      )
    }
    return true
  }

  if (server.type === 'http') {
    return validateHttpHealth(server, server.healthValidator)
  }

  if (server.type === 'stdio') {
    return validateStdioHealth(server, server.healthValidator)
  }

  // If we get here, there's an invalid server type
  if (!options?.silent) {
    logger.error(`Unknown server type (expected 'http' or 'stdio')`)
  }
  return false
}

export { isPortOpen, validateServerHealth }
