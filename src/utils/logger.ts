/**
 * @module logger
 * @description Logger utility library.
 */

import { blue, bold, dim, green, red, yellow } from '@std/fmt/colors'

const LOG_PREFIX = '[mcp-manager]'
// Default patterns that indicate sensitive information
const DEFAULT_SENSITIVE_PATTERNS = [
  'TOKEN',
  'KEY',
  'SECRET',
  'PASSWORD',
  'AUTH',
  'CREDENTIAL',
  'APIKEY',
  'CERT',
  'PRIVATE',
  'ACCESS',
  'ID',
  'TEAM',
  'CHANNEL',
]

const LOG_LEVEL = (Deno.env.get('LOG_LEVEL') || 'debug').toLowerCase()
const shouldLog = (level: string) =>
  ['debug', 'info', 'warn', 'error'].indexOf(level) >=
    ['debug', 'info', 'warn', 'error'].indexOf(LOG_LEVEL)

/**
 * Mask a sensitive string (like a token or password)
 * Shows first 4 and last 4 characters, masks the rest with asterisks
 */
function maskSensitiveValue(value: string): string {
  if (!value) return '[not set]'

  // For very short values, show at least some characters
  if (value.length <= 8) {
    return value.substring(0, 2) + '*'.repeat(value.length - 3) +
      value.substring(value.length - 1)
  }

  // For longer values, show first 4 and last 4
  return value.substring(0, 4) + '*'.repeat(Math.min(8, value.length - 8)) +
    value.substring(value.length - 4)
}

/**
 * Process arguments to mask any sensitive data
 *
 * @param args Arguments to process
 * @returns Processed arguments with sensitive data masked
 */
function processArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === 'object' && arg !== null) {
      // For objects, apply maskSensitiveData
      if (Array.isArray(arg)) {
        return arg.map((item) =>
          typeof item === 'object' && item !== null
            ? maskSensitiveData(item as Record<string, string>)
            : item
        )
      }
      return maskSensitiveData(arg as Record<string, string>)
    }
    return arg
  })
}

/**
 * Create a masked version of an object containing sensitive data
 * Returns a new object with sensitive values masked
 *
 * @param data Object containing sensitive data to mask
 * @param serverFilter Optional server name to filter variables by
 * @param additionalPatterns Optional array of additional patterns to consider sensitive
 * @returns A new object with sensitive values masked
 */
function maskSensitiveData(
  data: Record<string, unknown>,
  serverFilter?: string,
  additionalPatterns: string[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const sensitivePatterns = [
    ...DEFAULT_SENSITIVE_PATTERNS,
    ...additionalPatterns,
  ]

  for (const [key, value] of Object.entries(data)) {
    // If serverFilter is provided, only include variables that might be related to that server
    if (serverFilter) {
      const normalizedServerName = serverFilter.replace('mcp-', '')
        .toUpperCase()
      // Skip variables not matching the server filter
      if (!key.toUpperCase().includes(normalizedServerName)) {
        continue
      }
    }

    // Check if the variable might contain sensitive information
    const upperKey = key.toUpperCase()
    const isSensitive = sensitivePatterns.some((pattern) =>
      upperKey.includes(pattern)
    )

    if (isSensitive && typeof value === 'string') {
      result[key] = maskSensitiveValue(value)
    } else if (
      typeof value === 'object' && value !== null && !Array.isArray(value)
    ) {
      // Recursively mask nested objects
      result[key] = maskSensitiveData(
        value as Record<string, unknown>,
        serverFilter,
        additionalPatterns,
      )
    } else {
      // Keep the value as is
      result[key] = value
    }
  }

  return result
}

const logger = {
  print: (msg: string, ...args: unknown[]) => console.log(msg, ...args),

  log: (msg: string, ...args: unknown[]) =>
    console.log(`${bold(green(`${LOG_PREFIX}`))} ${msg}`, ...processArgs(args)),

  info: (msg: string, ...args: unknown[]) =>
    shouldLog('info') &&
    console.log(`${bold(blue(`${LOG_PREFIX}`))} ${msg}`, ...processArgs(args)),

  error: (msg: string, ...args: unknown[]) =>
    shouldLog('error') &&
    console.error(`${bold(red(`${LOG_PREFIX}`))} ${msg}`, ...processArgs(args)),

  debug: (msg: string, ...args: unknown[]) =>
    shouldLog('debug') &&
    console.debug(
      `${bold(dim(`${LOG_PREFIX}`))} ${dim(msg)}`,
      ...processArgs(args),
    ),

  warn: (msg: string, ...args: unknown[]) =>
    shouldLog('warn') &&
    console.warn(
      `${bold(yellow(`${LOG_PREFIX}`))} ${msg}`,
      ...processArgs(args),
    ),

  /**
   * Print masked environment variables for a server
   *
   * @param serverName Name of the server
   * @param envVars Environment variables from an environment file
   * @param processEnvVars Optional process environment variables
   */
  printMaskedEnvVars: (
    serverName: string,
    envVars: Record<string, string> = {},
    processEnvVars?: Record<string, string>,
  ): void => {
    logger.info(`=== Environment Variables for ${serverName} ===`)

    // Print environment variables from file
    if (Object.keys(envVars).length > 0) {
      logger.info('From env file:')

      const maskedEnvVars = maskSensitiveData(envVars, serverName)
      if (Object.keys(maskedEnvVars).length > 0) {
        for (const [key, maskedValue] of Object.entries(maskedEnvVars)) {
          logger.info(`  ${key}=${maskedValue}`)
        }
      } else {
        logger.info('  No sensitive variables found in env file.')
      }
    }

    // Print environment variables from process.env
    if (processEnvVars) {
      const maskedProcessEnv = maskSensitiveData(processEnvVars, serverName)

      if (Object.keys(maskedProcessEnv).length > 0) {
        logger.info('From process environment:')
        for (const [key, maskedValue] of Object.entries(maskedProcessEnv)) {
          logger.info(`  ${key}=${maskedValue}`)
        }
      } else if (!Object.keys(envVars).length) {
        logger.info('No sensitive environment variables found.')
      }
    }

    logger.info('=======================================')
  },

  maskSensitiveData,
}

export default logger
