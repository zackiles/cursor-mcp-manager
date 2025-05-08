# Changelog

All notable changes to this project will be documented in this file. This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.0.2 (Unreleased)

### Features

- Added simple `update` command to update MCP servers to their latest versions
- Added Docker image version checking during MCP server startup

### Architecture

- Reorganized project structure with dedicated service layers for Docker, HTTP, and STDIO operations
- Introduced new orchestrator module for centralized server management
- Improved state management with enhanced server status tracking
- Added presentation layer for consistent UI/UX output
- Refactored CLI commands to use a global `--server` flag, simplifying individual command options and centralizing server targeting logic.

### Configuration

- Moved server configurations to `servers/` directory
- Refactored configuration file structure - moved server configs to `/servers`, environment files to `/servers/config`, and examples to `/examples` directories
- Enhanced configuration system with better type safety and validation
- Added support for HTTP and STDIO server types
- Improved type system with string literal unions and discriminated unions for better type safety
  - Replaced `McpTransportType` enum with string literal union for simpler type checking
  - Restructured `McpServerConfig` into a discriminated union based on transport type

### Documentation

- Added comprehensive documentation for configuration system
- Improved code comments and type definitions
- Added examples for common configuration scenarios
- Updated command documentation to reflect the global `--server` flag and the separation of the `update` command.

### Bug Fixes

- Fixed Docker image version checking
- Improved error handling in configuration loading
- Fixed state management issues during server updates

### Development

- Added linting and formatting rules
- Improved type safety across the codebase
- Added development documentation

## 0.0.1 (2024-03-01)

Initial release with basic functionality.
