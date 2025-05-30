/**
 * Dry Run Utilities
 *
 * Helper functions for the --dry-run flag in commands
 * Shows differences between current and future Cursor MCP configs
 *
 * @module utils/dry-run
 */

import { getAppConfig } from '../config.ts'
import { readMcpConfigFile } from '../services/cursor-service.ts'
import { transformServerConfigForCursor } from '../orchestrator.ts'
import type { CursorMcpEntry, McpServerConfig } from '../types.ts'
import logger from './logger.ts'
import { blue, bold, cyan, green, red, yellow } from '@std/fmt/colors'

/**
 * Print a colorized header for the dry run output
 *
 * @param text Header text
 * @param colorFn Color function to apply
 */
function printColorHeader(text: string, colorFn: (s: string) => string) {
  // Use console.log directly for the colored headers
  console.log(`\n${bold(colorFn(text))}\n`)
}

/**
 * Perform a dry run for adding servers to Cursor MCP config
 *
 * @param servers Array of server configurations to add/update
 * @returns True if successful, false if failed
 */
export async function dryRunAddServers(
  servers: McpServerConfig[],
): Promise<boolean> {
  try {
    const appConfig = await getAppConfig()
    const mcpConfigPath = appConfig.CURSOR_MCP_CONFIG_PATH

    if (!mcpConfigPath) {
      logger.error(
        'Cursor MCP config file path not configured, cannot perform dry run',
      )
      return false
    }

    // Get the complete Cursor MCP config file contents - leave it unmodified
    const currentFullConfig = await readMcpConfigFile(mcpConfigPath)

    // Create a deep copy of the current config for the future state
    const futureFullConfig = JSON.parse(JSON.stringify(currentFullConfig))

    // Initialize mcpServers in the future config if it doesn't exist
    if (!futureFullConfig.mcpServers) {
      futureFullConfig.mcpServers = {}
    }

    // Add each server to the future config's mcpServers
    for (const server of servers) {
      // Transform server config for Cursor
      const transformedConfig = await transformServerConfigForCursor(server)

      // Add it to the future config's mcpServers property
      const mcpServers = futureFullConfig.mcpServers as Record<
        string,
        CursorMcpEntry
      >
      mcpServers[server.name] = transformedConfig
    }

    // Display the single comparison for all servers with color
    printColorHeader('===== DRY RUN: START OPERATION =====', cyan)

    printColorHeader('Current Complete Cursor MCP Config File:', blue)
    logger.log('', currentFullConfig)

    printColorHeader(
      'Future Complete Cursor MCP Config File (after start):',
      green,
    )
    logger.log('', futureFullConfig)

    const serverNames = servers.map((s) => bold(yellow(s.name))).join(', ')
    printColorHeader(
      `===== DRY RUN: NO CHANGES MADE [Servers: ${serverNames}] =====`,
      cyan,
    )

    return true
  } catch (error) {
    logger.error(`Error performing dry run: ${error}`)
    return false
  }
}

/**
 * Perform a dry run for removing servers from Cursor MCP config
 *
 * @param servers Array of server configurations to remove
 * @returns True if successful, false if failed
 */
export async function dryRunRemoveServers(
  servers: McpServerConfig[],
): Promise<boolean> {
  try {
    const appConfig = await getAppConfig()
    const mcpConfigPath = appConfig.CURSOR_MCP_CONFIG_PATH

    if (!mcpConfigPath) {
      logger.error(
        'Cursor MCP config file path not configured, cannot perform dry run',
      )
      return false
    }

    // Get the complete Cursor MCP config file contents - leave it unmodified
    const currentFullConfig = await readMcpConfigFile(mcpConfigPath)

    // Create a deep copy of the current config
    const futureFullConfig = JSON.parse(JSON.stringify(currentFullConfig))

    // If there are no servers configured, nothing to remove
    if (!futureFullConfig.mcpServers) {
      logger.log('No MCP servers found in Cursor config, nothing to remove')
      return true
    }

    // Remove each server from the future config's mcpServers
    for (const server of servers) {
      const mcpServers = futureFullConfig.mcpServers as Record<string, unknown>
      if (mcpServers[server.name]) {
        delete mcpServers[server.name]
      }
    }

    // Display the single comparison for all servers with color
    printColorHeader('===== DRY RUN: STOP OPERATION =====', cyan)

    printColorHeader('Current Complete Cursor MCP Config File:', blue)
    logger.log('', currentFullConfig)

    printColorHeader(
      'Future Complete Cursor MCP Config File (after stop):',
      red,
    )
    logger.log('', futureFullConfig)

    const serverNames = servers.map((s) => bold(yellow(s.name))).join(', ')
    printColorHeader(
      `===== DRY RUN: NO CHANGES MADE [Servers: ${serverNames}] =====`,
      cyan,
    )

    return true
  } catch (error) {
    logger.error(`Error performing dry run: ${error}`)
    return false
  }
}

/**
 * @deprecated Use dryRunAddServers instead
 */
export async function dryRunAddServer(
  server: McpServerConfig,
): Promise<boolean> {
  return dryRunAddServers([server])
}

/**
 * @deprecated Use dryRunRemoveServers instead
 */
export async function dryRunRemoveServer(
  server: McpServerConfig,
): Promise<boolean> {
  return dryRunRemoveServers([server])
}
