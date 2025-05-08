# How To Use The Context Folder

This folder is for storing context specific to the configured MCP servers, such as IDs, names, channels, Jira boards, Confluence spaces, repositories, or other specifics. Context files are useful to add to the chat when making MCP tool calls as it will provide common references the agent can reference to create the proper tool calls. Cursor or Claude rules can be created to automatically source these context files when making tool calls.

For an example of a context file that might be useful to use with the provided MCP servers.

**IMPORTANT**: Content here will not be checked into git, and is for local use, however, the folder is searchable and indexable by cursor (enabled in `.cursorignore` and `.cursorignoreindex`) so take care not to keep secrets in context files, use .env files for that instead (ignored by Cursor).
