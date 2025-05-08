/**
 * @module server-validator
 *
 * Utility functions for validating server selection and status
 */

import { isServerEnabled } from '../config.ts'
import logger from './logger.ts'

/**
 * Validates that a specified server is enabled
 *
 * @param serverName The name of the server to validate, or undefined if no specific server
 * @returns True if validation passes, false on failure
 */
export async function validateServerSelection(serverName?: string): Promise<boolean> {
  // If no specific server was provided, validation passes
  if (!serverName) {
    return true
  }

  // Check if the server is enabled
  const serverStatus = await isServerEnabled(serverName)

  // If the server status is a string, it means the server wasn't found
  if (typeof serverStatus === 'string') {
    logger.error(serverStatus)
    return false
  }

  // If the server is not enabled, show an error message
  if (!serverStatus) {
    logger.error(`Server "${serverName}" is not enabled in ENABLED_SERVERS configuration.`)
    logger.info('Check servers/config/main.env and ensure the server is listed in ENABLED_SERVERS.')
    return false
  }

  return true
}
