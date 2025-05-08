/**
 * Docker service
 *
 * Encapsulates all Docker CLI interactions (run, stop, ps, logs, pull, image info)
 *
 * @module
 */
import logger from '../utils/logger.ts'

/**
 * Check if Docker is installed
 */
async function isDockerInstalled(): Promise<boolean> {
  try {
    const command = new Deno.Command('docker', {
      args: ['--version'],
      stdout: 'null',
      stderr: 'null',
    })
    const { code } = await command.output()
    return code === 0
  } catch (_error) {
    return false
  }
}

/**
 * Check if Docker daemon is running
 */
async function isDockerRunning(): Promise<boolean> {
  try {
    const command = new Deno.Command('docker', {
      args: ['info'],
      stdout: 'null',
      stderr: 'null',
    })
    const { code } = await command.output()
    return code === 0
  } catch (_error) {
    return false
  }
}

/**
 * Start Docker daemon (platform dependent)
 */
async function startDocker(): Promise<boolean> {
  // This is platform-dependent and may not work on all systems
  logger.info('Attempting to start Docker daemon...')

  // Different command based on platform
  const platform = Deno.build.os

  if (platform === 'darwin') {
    // macOS
    const command = new Deno.Command('open', {
      args: ['-a', 'Docker'],
      stdout: 'null',
      stderr: 'null',
    })
    await command.output()

    // Wait for Docker to start (it takes time)
    logger.info('Waiting for Docker to start...')
    let attempts = 0
    const maxAttempts = 30

    while (attempts < maxAttempts) {
      if (await isDockerRunning()) {
        logger.info('Docker daemon started successfully.')
        return true
      }

      // Wait 2 seconds between checks
      await new Promise((resolve) => setTimeout(resolve, 2000))
      attempts++
    }

    logger.error('Docker daemon did not start within the expected time.')
    return false
  }

  if (platform === 'linux') {
    // Linux
    try {
      const command = new Deno.Command('sudo', {
        args: ['systemctl', 'start', 'docker'],
        stdout: 'null',
        stderr: 'null',
      })
      const { code } = await command.output()

      if (code === 0) {
        logger.info('Docker daemon started successfully.')
        return true
      }

      return false
    } catch (_error) {
      return false
    }
  }

  if (platform === 'windows') {
    // Windows
    // Just check if Docker Desktop is running, can't easily start it
    logger.info('On Windows, please start Docker Desktop manually.')
    return false
  }

  logger.error(`Unsupported platform: ${platform}`)
  return false
}

/**
 * Check if a Docker image is already pulled
 */
async function isDockerImagePulled(imageName: string): Promise<boolean> {
  try {
    const command = new Deno.Command('docker', {
      args: ['image', 'inspect', imageName],
      stdout: 'null',
      stderr: 'null',
    })
    const { code } = await command.output()
    return code === 0
  } catch (_error) {
    return false
  }
}

/**
 * Pull a Docker image
 */
async function pullDockerImage(imageName: string): Promise<boolean> {
  try {
    logger.info(`Pulling Docker image: ${imageName}...`)

    const command = new Deno.Command('docker', {
      args: ['pull', imageName],
      stdout: 'piped',
      stderr: 'piped',
    })

    const { code, stderr } = await command.output()

    if (code !== 0) {
      logger.error(`Failed to pull image ${imageName}:`)
      logger.error(new TextDecoder().decode(stderr))
      return false
    }

    logger.info(`Successfully pulled image: ${imageName}`)
    return true
  } catch (error) {
    logger.error(`Error pulling image ${imageName}:`, error)
    return false
  }
}

/**
 * Check if a container is running
 */
async function isContainerRunning(containerName: string): Promise<boolean> {
  try {
    const command = new Deno.Command('docker', {
      args: ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}'],
      stdout: 'piped',
    })

    const { stdout } = await command.output()
    const output = new TextDecoder().decode(stdout).trim()

    return output === containerName
  } catch (_error) {
    return false
  }
}

/**
 * Check if a port is already in use
 */
async function isPortInUse(port: number): Promise<boolean> {
  try {
    // Different command based on platform
    const platform = Deno.build.os

    if (platform === 'darwin' || platform === 'linux') {
      // macOS or Linux
      const command = new Deno.Command('lsof', {
        args: ['-i', `:${port}`],
        stdout: 'piped',
        stderr: 'null',
      })

      const { code, stdout } = await command.output()

      if (code !== 0) {
        return false
      }

      const output = new TextDecoder().decode(stdout).trim()
      return output.length > 0
    }

    if (platform === 'windows') {
      // Windows
      const command = new Deno.Command('netstat', {
        args: ['-ano', '|', 'findstr', `:${port}`],
        stdout: 'piped',
        stderr: 'null',
      })

      const { stdout } = await command.output()
      const output = new TextDecoder().decode(stdout).trim()

      return output.length > 0
    }

    return false
  } catch (_error) {
    return false
  }
}

/**
 * Get Docker image version information
 *
 * @returns Version information object or null if not available
 */
async function getImageVersionInfo(
  imageName: string,
): Promise<{ version?: string; latestVersion?: string }> {
  try {
    // Default result
    const result: { version?: string; latestVersion?: string } = {}

    // Extract base image without tag
    let baseImageName = imageName
    if (imageName.includes(':')) {
      baseImageName = imageName.split(':')[0]
    }

    // Get current version
    const inspectCommand = new Deno.Command('docker', {
      args: [
        'image',
        'inspect',
        imageName,
        '--format',
        '{{index .Config.Labels "org.opencontainers.image.version"}}',
      ],
      stdout: 'piped',
      stderr: 'null',
    })

    const { stdout: inspectStdout } = await inspectCommand.output()
    const version = new TextDecoder().decode(inspectStdout).trim()

    if (version && version !== '<no value>') {
      result.version = version
    }

    // Pull latest without tag to get the latest version
    // We use pull --quiet to only get the digest
    const latestPullCommand = new Deno.Command('docker', {
      args: ['pull', '--quiet', baseImageName],
      stdout: 'piped',
      stderr: 'null',
    })

    await latestPullCommand.output()

    // Check the latest version
    const latestInspectCommand = new Deno.Command('docker', {
      args: [
        'image',
        'inspect',
        baseImageName,
        '--format',
        '{{index .Config.Labels "org.opencontainers.image.version"}}',
      ],
      stdout: 'piped',
      stderr: 'null',
    })

    const { stdout: latestStdout } = await latestInspectCommand.output()
    const latestVersion = new TextDecoder().decode(latestStdout).trim()

    if (latestVersion && latestVersion !== '<no value>') {
      result.latestVersion = latestVersion
    }

    return result
  } catch (error) {
    logger.debug(`Error getting image version info: ${error}`)
    return {}
  }
}

/**
 * Run a Docker container with the given options
 *
 * @param options Container run options
 * @returns Result of the operation
 */
async function runContainer(options: {
  imageName: string
  containerName: string
  args: string[]
  envFile?: string
  env?: Record<string, string>
  detached?: boolean
  ports?: { hostPort: number; containerPort: number }[]
}): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const dockerArgs = ['run']

    // Add detached mode if requested
    if (options.detached) {
      dockerArgs.push('-d')
    }

    // Add container name
    dockerArgs.push('--name', options.containerName)

    // Add port mappings if provided
    if (options.ports && options.ports.length > 0) {
      for (const portMapping of options.ports) {
        dockerArgs.push('-p', `${portMapping.hostPort}:${portMapping.containerPort}`)
      }
    }

    // Add env file if provided - this is the standardized approach
    if (options.envFile) {
      dockerArgs.push('--env-file', options.envFile)
    } else if (options.env && Object.keys(options.env).length > 0) {
      // For backward compatibility: log a warning if env vars are provided but no env file
      logger.warn(
        `Environment variables provided for container ${options.containerName} without an env file. Please migrate to using env files.`,
      )
      // We do not add individual -e flags as per the standardization proposal
    }

    // Add image name and additional args
    dockerArgs.push(options.imageName, ...options.args)

    // Run the container
    const command = new Deno.Command('docker', {
      args: dockerArgs,
      stdout: 'piped',
      stderr: 'piped',
    })

    const { code, stdout, stderr } = await command.output()

    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr)
      logger.error(`Failed to run container ${options.containerName}: ${errorText}`)
      return { success: false, error: errorText }
    }

    const outputText = new TextDecoder().decode(stdout).trim()
    return { success: true, output: outputText }
  } catch (error) {
    logger.error(`Error running container ${options.containerName}:`, error)
    return { success: false, error: String(error) }
  }
}

/**
 * Stop and remove a Docker container
 *
 * @param containerName Name of the container to stop
 * @returns True if successful, false otherwise
 */
async function stopAndRemoveContainer(containerName: string): Promise<boolean> {
  try {
    // Check if container exists
    const checkCommand = new Deno.Command('docker', {
      args: ['ps', '-a', '--filter', `name=${containerName}`, '--format', '{{.Names}}'],
      stdout: 'piped',
    })

    const { stdout } = await checkCommand.output()
    const output = new TextDecoder().decode(stdout).trim()

    if (output === '') {
      // Container doesn't exist
      return true
    }

    // Stop the container
    const stopCommand = new Deno.Command('docker', {
      args: ['stop', containerName],
      stdout: 'null',
      stderr: 'piped',
    })

    const stopResult = await stopCommand.output()

    if (stopResult.code !== 0) {
      const errorText = new TextDecoder().decode(stopResult.stderr)
      logger.error(`Failed to stop container ${containerName}: ${errorText}`)
      return false
    }

    // Remove the container
    const removeCommand = new Deno.Command('docker', {
      args: ['rm', containerName],
      stdout: 'null',
      stderr: 'piped',
    })

    const removeResult = await removeCommand.output()

    if (removeResult.code !== 0) {
      const errorText = new TextDecoder().decode(removeResult.stderr)
      logger.error(`Failed to remove container ${containerName}: ${errorText}`)
      return false
    }

    return true
  } catch (error) {
    logger.error(`Error stopping and removing container ${containerName}:`, error)
    return false
  }
}

/**
 * Get logs from a Docker container
 *
 * @param containerName Name of the container
 * @returns Container logs or error message
 */
async function getContainerLogs(containerName: string): Promise<{
  success: boolean
  stdout?: string
  stderr?: string
  error?: string
}> {
  try {
    const command = new Deno.Command('docker', {
      args: ['logs', containerName],
      stdout: 'piped',
      stderr: 'piped',
    })

    const { code, stdout, stderr } = await command.output()

    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr)
      return { success: false, error: errorText }
    }

    return {
      success: true,
      stdout: new TextDecoder().decode(stdout),
      stderr: new TextDecoder().decode(stderr),
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Run a command in a running Docker container
 *
 * @param options Exec options
 * @returns Result of the operation
 */
async function execInContainer(options: {
  containerName: string
  command: string[]
  input?: string
}): Promise<{
  success: boolean
  stdout?: string
  stderr?: string
  error?: string
}> {
  try {
    const execCommand = new Deno.Command('docker', {
      args: ['exec', '-i', options.containerName, ...options.command],
      stdin: options.input ? 'piped' : 'null',
      stdout: 'piped',
      stderr: 'piped',
    })

    const process = execCommand.spawn()

    // Write input to stdin if provided
    if (options.input) {
      const encoder = new TextEncoder()
      const writer = process.stdin.getWriter()
      await writer.write(encoder.encode(options.input))
      writer.releaseLock()
      process.stdin.close()
    }

    // Read response
    const output = await process.output()
    const stdout = new TextDecoder().decode(output.stdout)
    const stderr = new TextDecoder().decode(output.stderr)

    if (output.code !== 0) {
      return { success: false, stdout, stderr, error: stderr }
    }

    return { success: true, stdout, stderr }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Print Docker logs to the console
 *
 * @param containerName Name of the container
 */
async function printDockerLogs(containerName: string): Promise<void> {
  try {
    const logs = await getContainerLogs(containerName)

    if (!logs.success) {
      logger.error(`Failed to get logs for ${containerName}: ${logs.error}`)
      return
    }

    if (logs.stdout) {
      logger.info(`===== CONTAINER ${containerName} STDOUT LOGS =====`)
      logger.info(logs.stdout)
      logger.info('=================================')
    }

    if (logs.stderr) {
      logger.debug(`===== CONTAINER ${containerName} STDERR LOGS =====`)
      logger.debug(logs.stderr)
      logger.debug('=================================')
    }

    if (!logs.stdout && !logs.stderr) {
      logger.info('No logs available from container')
    }
  } catch (error) {
    logger.error(`Error printing logs for container ${containerName}:`, error)
  }
}

export {
  execInContainer,
  getContainerLogs,
  getImageVersionInfo,
  isContainerRunning,
  isDockerImagePulled,
  isDockerInstalled,
  isDockerRunning,
  isPortInUse,
  printDockerLogs,
  pullDockerImage,
  runContainer,
  startDocker,
  stopAndRemoveContainer,
}
