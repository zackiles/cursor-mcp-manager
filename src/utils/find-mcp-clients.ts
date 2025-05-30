import { join } from '@std/path'

interface PathResolver {
  resolver: () => string | null
}

interface UnresolvedMCPClientConfig {
  name: string
  path: PathResolver
  description: string
}

export interface MCPClientConfig {
  name: string
  path: string
  description: string
}

const MCP_CLIENTS: UnresolvedMCPClientConfig[] = [
  {
    name: 'Windsurf',
    path: {
      resolver: () => {
        const homeDir = Deno.env.get('HOME') || Deno.env.get('USERPROFILE') ||
          ''
        return join(homeDir, '.codeium', 'windsurf', 'mcp_config.json')
      },
    },
    description: 'Codeium Windsurf client',
  },
  {
    name: 'Cursor',
    path: {
      resolver: () => {
        const homeDir = Deno.env.get('HOME') || Deno.env.get('USERPROFILE') ||
          ''
        return join(homeDir, '.cursor', 'mcp.json')
      },
    },
    description: 'Cursor client',
  },
  {
    name: 'Claude',
    path: {
      resolver: () => {
        const platform = Deno.build.os
        if (platform === 'windows') {
          const appData = Deno.env.get('APPDATA') || ''
          return join(appData, 'Claude', 'claude_desktop_config.json')
        }

        if (platform === 'darwin') {
          const homeDir = Deno.env.get('HOME') || ''
          return join(
            homeDir,
            'Library',
            'Application Support',
            'Claude',
            'claude_desktop_config.json',
          )
        }

        // not available for other platforms
        return null
      },
    },
    description: 'Claude desktop client',
  },
]

/**
 * Returns all MCP clients that are available for the current platform
 * with resolved paths that are guaranteed to be non-null
 */
function getPlatformClients(): MCPClientConfig[] {
  return MCP_CLIENTS.map((client) => {
    const resolvedPath = client.path.resolver()
    if (resolvedPath !== null) {
      return {
        name: client.name,
        description: client.description,
        path: resolvedPath,
      }
    }
    return null
  }).filter((client): client is MCPClientConfig => client !== null)
}

export { getPlatformClients }
