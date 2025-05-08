# How to Use MCPs Securely

The attack surface of an MCP is surprisingly wide. This is not to be downplayed, and you must take extreme care when using them. The following are some brief tips on using MCPs securely:

1) Use ONLY local MCPs on your machine. Anything else would be outside of your company's IT policy unless it's hosted on an approved vendor's domain, such as [Atlassian's](https://www.atlassian.com/blog/announcements/remote-mcp-server)
2) Use the docker container. Get the outbound host (e.g atlassian.net) from the codebase, and do an outbound allowlist rule: only outbound.host, drop all
3) Use an official MCP if you can (e.g Atlassian's)
4) Most have "read only mode", use it
5) Some have "tool filters", use them. Filter tools that write data or read things you don't want
6) If you're generating PATs/tokens, scope them tightly. Set expiry dates on them
Inspect source code, ideally fork it and pin dependencies. Ensure you know the base image it uses and don't upgrade them unless you've reviewed the diff like you would your own code going to production
7) Be **extra vigilant** inspecting MCPs which have `prompt` endpoints (most don't). Those are endpoints that return instructions to your model and should be thought of no differently than if you gave full control of your machine to the prompt - the possibilities are endless.
8) Enable "MCP Tools Protection" in Cursor settings so it never runs an MCP command without your permission
