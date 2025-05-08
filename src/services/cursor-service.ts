/**
 * Cursor Configuration Service
 *
 * Manages reading and writing to the Cursor MCP configuration file
 *
 * @module services/cursor-service
 */

import { exists } from '@std/fs'
import { dirname } from '@std/path'
import logger from '../utils/logger.ts'
import type { CursorMcpEntry } from '../types.ts'

/**
 * Read the Cursor MCP configuration file
 *
 * @param configPath Path to the Cursor MCP configuration file
 * @returns Object representing the parsed configuration, or an empty object if file doesn't exist
 */
async function readMcpConfigFile(configPath: string): Promise<Record<string, unknown>> {
  try {
    if (!await exists(configPath)) {
      logger.debug(`Cursor MCP config file not found: ${configPath}`)
      return {}
    }

    const rawContent = await Deno.readTextFile(configPath)
    try {
      const jsonContent = JSON.parse(rawContent)
      logger.debug(`Successfully read Cursor MCP config file: ${configPath}`)
      return jsonContent
    } catch (parseError) {
      logger.warn(
        `Could not parse Cursor MCP config file as JSON: ${(parseError as Error).message}`,
      )
      return {}
    }
  } catch (error) {
    logger.warn(
      `Error reading Cursor MCP config file: ${(error as Error).message}`,
    )
    return {}
  }
}

/**
 * Write to the Cursor MCP configuration file
 *
 * @param configPath Path to the Cursor MCP configuration file
 * @param config Configuration object to write
 * @returns True if successful, false otherwise
 */
async function writeMcpConfigFile(
  configPath: string,
  config: Record<string, unknown>,
): Promise<boolean> {
  try {
    // Ensure the directory exists
    const dir = dirname(configPath)
    try {
      await Deno.mkdir(dir, { recursive: true })
    } catch (err) {
      if (!(err instanceof Deno.errors.AlreadyExists)) {
        throw err
      }
    }

    // Write the file with pretty formatting
    await Deno.writeTextFile(
      configPath,
      JSON.stringify(config, null, 2),
    )

    logger.debug(`Successfully wrote Cursor MCP config file: ${configPath}`)
    return true
  } catch (error) {
    logger.error(`Failed to write Cursor MCP config file: ${(error as Error).message}`)
    return false
  }
}

/**
 * Get MCP servers from the Cursor configuration file
 *
 * @param configPath Path to the Cursor MCP configuration file
 * @returns Record of server configurations (empty if no file or servers found)
 */
async function getMcpServers(configPath: string): Promise<Record<string, CursorMcpEntry>> {
  try {
    const config = await readMcpConfigFile(configPath)
    const mcpServers = config.mcpServers as Record<string, CursorMcpEntry> || {}
    return mcpServers
  } catch (error) {
    logger.warn(`Error getting MCP servers from Cursor config: ${(error as Error).message}`)
    return {}
  }
}

/**
 * Add MCP servers to the Cursor configuration file
 *
 * @param configPath Path to the Cursor MCP configuration file
 * @param servers Map of server names to server configurations to add
 * @returns True if successful, false otherwise
 */
async function addMcpServers(
  configPath: string,
  servers: Record<string, CursorMcpEntry>,
): Promise<boolean> {
  try {
    // Read current config
    const config = await readMcpConfigFile(configPath)

    // Initialize mcpServers if it doesn't exist
    if (!config.mcpServers) {
      config.mcpServers = {}
    }

    // Add each server
    for (const [name, serverConfig] of Object.entries(servers)) {
      ;(config.mcpServers as Record<string, CursorMcpEntry>)[name] = serverConfig
      logger.debug(`Added/updated server ${name} in Cursor MCP config`)
    }

    // Write updated config
    return await writeMcpConfigFile(configPath, config)
  } catch (error) {
    logger.error(`Error adding MCP servers to Cursor config file: ${(error as Error).message}`)
    return false
  }
}

/**
 * Remove MCP servers from the Cursor configuration file
 *
 * @param configPath Path to the Cursor MCP configuration file
 * @param serverNames Array of server names to remove
 * @returns True if successful, false otherwise
 */
async function removeMcpServers(
  configPath: string,
  serverNames: string[],
): Promise<boolean> {
  try {
    // Check if config file exists
    if (!await exists(configPath)) {
      logger.warn(`Cursor MCP config file not found: ${configPath}, nothing to remove`)
      return true // Return true as there's nothing to remove
    }

    // Read current config
    const config = await readMcpConfigFile(configPath)

    // If mcpServers doesn't exist, nothing to remove
    if (!config.mcpServers) {
      logger.warn('No MCP servers in Cursor config, nothing to remove')
      return true
    }

    // Remove each server
    let removed = false
    for (const name of serverNames) {
      if ((config.mcpServers as Record<string, unknown>)[name]) {
        delete (config.mcpServers as Record<string, unknown>)[name]
        logger.debug(`Removed server ${name} from Cursor MCP config`)
        removed = true
      }
    }

    // Write updated config if any servers were removed
    if (removed) {
      return await writeMcpConfigFile(configPath, config)
    }

    return true // Nothing was removed, but that's not an error
  } catch (error) {
    logger.warn(`Error removing MCP servers from Cursor config file: ${(error as Error).message}`)
    // Log a warning but return true as specified in the requirements (no errors thrown)
    return true
  }
}

export { addMcpServers, getMcpServers, readMcpConfigFile, removeMcpServers, writeMcpConfigFile }
