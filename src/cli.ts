#!/usr/bin/env -S deno run -A

/**
 * @module cli
 * @description Main entry point for the CLI
 * @see {@link https://jsr.io/@std/cli/doc/~/parseArgs}
 * @see {@link https://jsr.io/@std/cli/doc/parse-args/~/Args}
 * @see {@link https://jsr.io/@std/cli/doc/~/ParseOptions}
 */
import { parseArgs, type ParseOptions } from '@std/cli'
import CommandRouter from './utils/command-router.ts'
import type {
  CommandRouteDefinition,
  CommandRouteOptions as _CommandRouteOptions,
} from './utils/command-router.ts'

// Define global CLI options that apply to all commands
const GLOBAL_OPTIONS: ParseOptions = {
  string: ['server'],
  alias: {
    n: 'server',
  },
}

/**
 * Static mapping of commands
 * We explicitly import all command modules using static imports.
 */
const COMMANDS: Record<string, CommandRouteDefinition> = {
  help: (await import('./commands/help.ts')).default,
  version: (await import('./commands/version.ts')).default,
  start: (await import('./commands/start.ts')).default,
  stop: (await import('./commands/stop.ts')).default,
  status: (await import('./commands/status.ts')).default,
  'health-check': (await import('./commands/health-check.ts')).default,
  // DISABLED FOR NOW:sync: (await import('./commands/sync.ts')).default,
  update: (await import('./commands/update.ts')).default,
  logs: (await import('./commands/logs.ts')).default,
  // Add more commands if needed, a template for a command is in commands/example.disabled.ts
}

/**
 * Main entry point for the CLI
 */
async function run(): Promise<void> {
  try {
    const router = new CommandRouter(COMMANDS)
    const route = router.getRoute(Deno.args)
    const opts = router.getOptions(route)

    // Add global server arg if present
    const server = parseArgs(Deno.args, GLOBAL_OPTIONS).server
    if (server) opts.args.server = server

    await route.command(opts)
  } catch (err) {
    throw new Error(`Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export default run
