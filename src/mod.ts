/**
 * @module mod
 *
 * Main entry point for the package.
 */
import cli from './cli.ts'
import logger from './utils/logger.ts'
import { getMcpServerConfigs, initializeConfig } from './config.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'

await initializeConfig({
  PROJECT_NAME: 'cursor-mcp-manager',
  PACKAGE_NAME: '@zackiles/cursor-mcp-manager',
  PACKAGE_DESCRIPTION:
    'An MCP workspace manager for Cursor. Easily install, configure, start, stop, and update MCP servers centrally for your cursor workspace.',
  PACKAGE_VERSION: '0.0.1',
})

if (import.meta.main) {
  await gracefulShutdown.startAndWrap(cli, logger)
}

export type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from './utils/command-router.ts'
export type {
  CursorHttpMcpEntry,
  CursorMcpEntry,
  CursorStdioMcpEntry,
  McpServerConfig,
  McpState,
  McpStateFile,
} from './types.ts'
export { getMcpServerConfigs }

export * from './state.ts'
export * from './orchestrator.ts'
export * from './presentation.ts'
export * from './services/docker-service.ts'
export * from './services/health-validator-service.ts'
export * from './services/cursor-service.ts'
