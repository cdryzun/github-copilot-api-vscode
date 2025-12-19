import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
    ListToolsResultSchema,
    CallToolResultSchema,
    CompatibilityCallToolResult
} from '@modelcontextprotocol/sdk/types.js';

export interface McpServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
}

export interface McpTool {
    serverName: string;
    name: string;
    description?: string;
    inputSchema: any;
}

export class McpService implements vscode.Disposable {
    private clients: Map<string, Client> = new Map();
    private cachedTools: McpTool[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly output: vscode.OutputChannel) { }

    public async initialize(): Promise<void> {
        await this.refreshServers();
    }

    public async refreshServers(): Promise<void> {
        // Dispose existing clients
        for (const client of this.clients.values()) {
            await client.close();
        }
        this.clients.clear();

        const config = vscode.workspace.getConfiguration('githubCopilotApi.mcp');
        const enabled = config.get<boolean>('enabled', true);
        if (!enabled) {
            this.output.appendLine('[MCP] Disabled in configuration.');
            return;
        }

        const servers = config.get<Record<string, McpServerConfig>>('servers', {});
        for (const [name, serverConfig] of Object.entries(servers)) {
            try {
                await this.connectToServer(name, serverConfig);
            } catch (error) {
                this.output.appendLine(`[MCP] Failed to connect to server "${name}": ${error}`);
            }
        }

        // Populate tool cache after all servers tried to connect
        this.cachedTools = await this.getAllTools();
    }

    public getTools(): McpTool[] {
        return this.cachedTools;
    }

    public getConnectedServers(): string[] {
        return Array.from(this.clients.keys());
    }

    private async connectToServer(name: string, config: McpServerConfig): Promise<void> {
        let transport;
        if (config.url) {
            transport = new SSEClientTransport(new URL(config.url));
        } else if (config.command) {
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: this.getCleanEnv(config.env)
            });
        } else {
            throw new Error(`Invalid configuration for MCP server "${name}"`);
        }

        const client = new Client(
            { name: 'github-copilot-api-gateway', version: '0.0.1' },
            { capabilities: {} }
        );

        await client.connect(transport);
        this.clients.set(name, client);
        this.output.appendLine(`[MCP] Connected to server "${name}"`);
    }

    public async getAllTools(): Promise<McpTool[]> {
        const allTools: McpTool[] = [];
        for (const [name, client] of this.clients.entries()) {
            try {
                const result = await client.request({ method: 'tools/list' }, ListToolsResultSchema);
                const tools = result.tools.map(t => ({
                    serverName: name,
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema
                }));
                allTools.push(...tools);
            } catch (error) {
                this.output.appendLine(`[MCP] Failed to list tools for server "${name}": ${error}`);
            }
        }
        return allTools;
    }

    public async callTool(serverName: string, toolName: string, args: any): Promise<any> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found or not connected`);
        }

        const result = await client.request(
            {
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: args
                }
            },
            CallToolResultSchema
        );

        return result;
    }

    private getCleanEnv(extraEnv?: Record<string, string>): Record<string, string> {
        const clean: Record<string, string> = {};

        // Add current process env, filtering out undefined
        for (const [key, value] of Object.entries(process.env)) {
            if (value !== undefined) {
                clean[key] = value;
            }
        }

        // Add extra env from config
        if (extraEnv) {
            for (const [key, value] of Object.entries(extraEnv)) {
                if (value !== undefined) {
                    clean[key] = value;
                }
            }
        }

        return clean;
    }

    public dispose(): void {
        for (const client of this.clients.values()) {
            client.close().catch(err => console.error(`[MCP] Error closing client: ${err}`));
        }
        this.clients.clear();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
