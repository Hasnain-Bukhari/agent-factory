# Local plugin operations

These steps are for an approved agent to perform; the user does not edit commands, JSON, paths, or credentials.

## Local package and service

The portable package is rooted at `agents/finance-os/plugin/`. Its `mcp.json` deterministically declares `http://127.0.0.1:8400/mcp` with bearer API-key authentication and contains no token. The credential is supplied only through the connection setup flow and remains separate from the package, skill, memory, and logs.

For a synthetic local check, the agent:

1. runs the runtime doctor and verifies the supported host, Node.js version, permissions, encrypted store, audit continuity, and credential-file mode;
2. starts the Finance OS command runtime, then the loopback MCP service with an explicit synthetic data directory and owner-only credential file;
3. checks initialization and all four advertised tools with the authenticated MCP client;
4. installs or refreshes the local portable plugin package in the supported desktop client, supplies the bearer token through the client's credential UI, and reruns the evaluation set;
5. stops the MCP service and command runtime when the session ends.

Disconnect by disabling/removing the plugin connection and revoking or replacing its credential; this does not delete the encrypted store. Refresh after any tool name, description, schema, annotation, authentication, skill, or manifest change, then start a new conversation and rerun affected evaluations.

## ChatGPT external connection boundary

ChatGPT cannot reach this loopback-only endpoint directly. A real connection requires either a workspace-supported Secure MCP Tunnel or a separately reviewed stable public HTTPS `/mcp` endpoint. Account/workspace policy, risk acknowledgement, connection creation, authentication entry, and refresh require user/admin consent. Public submission additionally requires stable public HTTPS and reviewed OAuth 2.1 or equivalent user authentication; the local fixed bearer design is not a public deployment architecture.

Do not invent a tunnel, registered plugin ID, public URL, OAuth client, or connection result. Record these as external blockers until the user chooses and authorizes a supported connection method.
