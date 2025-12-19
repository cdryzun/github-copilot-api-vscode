import * as vscode from 'vscode';
import { CopilotApiGateway } from './CopilotApiGateway';

export class CopilotPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'copilotApiControls';
    private _view?: vscode.WebviewView;

    // Full editor panel singleton
    private static currentPanel: vscode.WebviewPanel | undefined;
    private static panelDisposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gateway: CopilotApiGateway
    ) {
        this._gateway.onDidChangeStatus(async () => {
            if (this._view) {
                this._view.webview.html = await this._getSidebarHtml(this._view.webview);
            }
            // Also update the full panel if it's open
            if (CopilotPanel.currentPanel) {
                CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, this._gateway);
            }
        });
        this._gateway.onDidLogRequest(log => {
            if (this._view) {
                this._view.webview.postMessage({ type: 'liveLog', value: log });
            }
            if (CopilotPanel.currentPanel) {
                CopilotPanel.currentPanel.webview.postMessage({ type: 'liveLog', value: log });
            }
        });
    }

    /**
     * Opens the dashboard as a full-size editor panel (not a sidebar view).
     */
    public static async createOrShow(extensionUri: vscode.Uri, gateway: CopilotApiGateway): Promise<void> {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (CopilotPanel.currentPanel) {
            CopilotPanel.currentPanel.reveal(column);
            // Update HTML in case state changed
            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'copilotApiDashboard',
            'Copilot API Dashboard',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        CopilotPanel.currentPanel = panel;

        panel.webview.html = await CopilotPanel.getPanelHtml(panel.webview, gateway);

        panel.webview.onDidReceiveMessage(
            data => {
                CopilotPanel.handleMessage(data, gateway);
            },
            undefined,
            CopilotPanel.panelDisposables
        );

        panel.onDidDispose(() => {
            CopilotPanel.currentPanel = undefined;
            for (const d of CopilotPanel.panelDisposables) {
                d.dispose();
            }
            CopilotPanel.panelDisposables = [];
        }, null, CopilotPanel.panelDisposables);
    }

    private static handleMessage(data: { type: string; value?: unknown }, gateway: CopilotApiGateway): void {
        switch (data.type) {
            case 'openChat':
                void vscode.commands.executeCommand('github-copilot-api-vscode.openCopilotChat');
                break;
            case 'askCopilot':
                void vscode.commands.executeCommand('github-copilot-api-vscode.askCopilot');
                break;
            case 'showControls':
                void vscode.commands.executeCommand('github-copilot-api-vscode.showServerControls');
                break;
            case 'startServer':
                void gateway.startServer();
                break;
            case 'stopServer':
                void gateway.stopServer();
                break;
            case 'toggleHttp':
                void gateway.toggleHttp();
                break;
            case 'toggleWs':
                void gateway.toggleWebSocket();
                break;
            case 'toggleLogging':
                void gateway.toggleLogging();
                break;
            case 'setApiKey':
                if (typeof data.value === 'string') {
                    void gateway.setApiKey(data.value);
                }
                break;
            case 'setRateLimit':
                if (typeof data.value === 'number') {
                    void gateway.setRateLimit(data.value);
                }
                break;
            case 'hostLocal':
                void gateway.setHost('127.0.0.1');
                break;
            case 'hostLan':
                void gateway.setHost('0.0.0.0');
                break;
            case 'setHost':
                if (typeof data.value === 'string') {
                    void gateway.setHost(data.value);
                }
                break;
            case 'setPort':
                if (typeof data.value === 'number') {
                    void gateway.setPort(data.value);
                }
                break;
            case 'setModel':
                if (typeof data.value === 'string') {
                    void gateway.setDefaultModel(data.value);
                }
                break;
            case 'clearHistory':
                gateway.clearHistory();
                break;
            case 'toggleMcp':
                if (typeof data.value === 'boolean') {
                    void gateway.toggleMcp(data.value);
                }
                break;
            case 'addRedactionPattern':
                if (data.value && typeof data.value === 'object') {
                    const { name, pattern } = data.value as { name: string; pattern: string };
                    void gateway.addRedactionPattern(name, pattern).then(async success => {
                        if (!success) {
                            void vscode.window.showErrorMessage('Invalid regex pattern');
                        } else if (CopilotPanel.currentPanel) {
                            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
                        }
                    });
                }
                break;
            case 'removeRedactionPattern':
                if (typeof data.value === 'string') {
                    void gateway.removeRedactionPattern(data.value).then(async () => {
                        if (CopilotPanel.currentPanel) {
                            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
                        }
                    });
                }
                break;
            case 'toggleRedactionPattern':
                if (data.value && typeof data.value === 'object') {
                    const { id, enabled } = data.value as { id: string; enabled: boolean };
                    void gateway.toggleRedactionPattern(id, enabled);
                    // Don't refresh entire page - toggle state is already updated in the UI
                    // The state is persisted to config for next load
                }
                break;
            case 'addIpAllowlistEntry':
                if (typeof data.value === 'string') {
                    void gateway.addIpAllowlistEntry(data.value).then(async success => {
                        if (!success) {
                            void vscode.window.showErrorMessage('Invalid IP address or CIDR range');
                        } else if (CopilotPanel.currentPanel) {
                            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
                        }
                    });
                }
                break;
            case 'removeIpAllowlistEntry':
                if (typeof data.value === 'string') {
                    void gateway.removeIpAllowlistEntry(data.value).then(async () => {
                        if (CopilotPanel.currentPanel) {
                            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
                        }
                    });
                }
                break;
            case 'setRequestTimeout':
                if (typeof data.value === 'number') {
                    void gateway.setRequestTimeout(data.value).then(async () => {
                        if (CopilotPanel.currentPanel) {
                            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
                        }
                    });
                }
                break;
            case 'setMaxPayloadSize':
                if (typeof data.value === 'number') {
                    void gateway.setMaxPayloadSize(data.value).then(async () => {
                        if (CopilotPanel.currentPanel) {
                            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
                        }
                    });
                }
                break;
            case 'setMaxConnectionsPerIp':
                if (typeof data.value === 'number') {
                    void gateway.setMaxConnectionsPerIp(data.value).then(async () => {
                        if (CopilotPanel.currentPanel) {
                            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
                        }
                    });
                }
                break;
            case 'setMaxConcurrency':
                if (typeof data.value === 'number') {
                    void gateway.setMaxConcurrency(data.value).then(async () => {
                        if (CopilotPanel.currentPanel) {
                            CopilotPanel.currentPanel.webview.html = await CopilotPanel.getPanelHtml(CopilotPanel.currentPanel.webview, gateway);
                        }
                    });
                }
                break;
            case 'getHistory':
                if (CopilotPanel.currentPanel) {
                    const history = gateway.getHistory(50);
                    void CopilotPanel.currentPanel.webview.postMessage({
                        type: 'historyData',
                        data: history
                    });
                }
                break;
            case 'getStats':
                // Send stats back to webview
                if (CopilotPanel.currentPanel) {
                    void CopilotPanel.currentPanel.webview.postMessage({
                        type: 'statsData',
                        data: gateway.getStats()
                    });
                }
                break;
            case 'getAuditStats':
                if (CopilotPanel.currentPanel) {
                    // Send daily stats for charts
                    void gateway.getDailyStats(30).then(stats => {
                        void CopilotPanel.currentPanel?.webview.postMessage({
                            type: 'auditStatsData',
                            data: stats
                        });
                    });
                }
                break;
            case 'getAuditLogs':
                console.log('[CopilotPanel] Received getAuditLogs request');
                if (CopilotPanel.currentPanel) {
                    const val = data.value as any || {};
                    const page = val.page || 1;
                    const pageSize = val.pageSize || 10;
                    gateway.getAuditLogs(page, pageSize).then(res => {
                        console.log('[CopilotPanel] Got audit logs:', res.total, 'total,', res.entries.length, 'entries');
                        void CopilotPanel.currentPanel?.webview.postMessage({
                            type: 'auditLogData',
                            data: res.entries,
                            page: page,
                            total: res.total,
                            pageSize: pageSize
                        });
                    }).catch(err => {
                        console.error('[CopilotPanel] Error getting audit logs:', err);
                        // Send empty result on error
                        void CopilotPanel.currentPanel?.webview.postMessage({
                            type: 'auditLogData',
                            data: [],
                            page: page,
                            total: 0,
                            pageSize: pageSize
                        });
                    });
                } else {
                    console.warn('[CopilotPanel] No currentPanel available for getAuditLogs response');
                }
                break;
            case 'openLogFolder':
                const logPath = gateway.getLogFolderPath();
                if (logPath) {
                    void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(logPath));
                } else {
                    void vscode.window.showErrorMessage('Log folder not found');
                }
                break;
        }
    }

    /**
     * Simple sidebar HTML that prompts user to open full dashboard
     */
    private async _getSidebarHtml(webview: vscode.Webview): Promise<string> {
        const nonce = getNonce();
        const status = await this._gateway.getStatus();
        const isRunning = status.running;
        const statusColor = isRunning ? '#4ade80' : '#f87171';
        const statusText = isRunning ? 'Running' : 'Stopped';
        const url = `http://${status.config.host}:${status.config.port}`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 12px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
        .status { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 6px ${statusColor}; }
        .url { font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: 0.8; word-break: break-all; margin-bottom: 12px; }
        button { width: 100%; padding: 8px 12px; margin-bottom: 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-family: var(--vscode-font-family); font-weight: 500; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .hint { font-size: 11px; opacity: 0.7; text-align: center; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="status">
        <div class="dot"></div>
        <strong>${statusText}</strong>
    </div>
    <div style="font-size: 11px; opacity: 0.8; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
        <div style="width: 7px; height: 7px; border-radius: 50%; background: ${status.copilot.ready ? '#4ade80' : '#fbbf24'};"></div>
        <span>Copilot: ${status.copilot.ready ? 'Ready' : (status.copilot.signedIn ? 'Extension Check' : 'Sign-in Needed')}</span>
    </div>
    <div class="url">${url}</div>
    <button id="btn-dashboard">Open Dashboard</button>
    <button id="btn-toggle" class="secondary">${isRunning ? 'Stop Server' : 'Start Server'}</button>
    <div class="hint">Use the dashboard for full controls</div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('btn-dashboard').addEventListener('click', () => {
            vscode.postMessage({ type: 'openDashboard' });
        });
        document.getElementById('btn-toggle').addEventListener('click', () => {
            vscode.postMessage({ type: '${isRunning ? 'stopServer' : 'startServer'}' });
        });
    </script>
</body>
</html>`;
    }

    private static async getPanelHtml(webview: vscode.Webview, gateway: CopilotApiGateway): Promise<string> {
        const nonce = getNonce();
        const status = await gateway.getStatus();
        const config = status.config;
        const isRunning = status.running;
        const statusColor = isRunning ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
        const statusText = isRunning ? 'Running' : 'Stopped';
        const url = `http://${config.host}:${config.port}`;
        const networkInfo = status.networkInfo;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src http: https:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot API Dashboard</title>
    <title>Copilot API Dashboard</title>
    <!-- Removed Chart.js for reliability -->
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        body {
            margin: 0; padding: 0; min-height: 100vh;
            background: radial-gradient(120% 120% at 20% 20%, rgba(56,189,248,0.05), transparent),
                        radial-gradient(120% 120% at 80% 0%, rgba(147,197,253,0.05), transparent),
                        var(--vscode-editor-background);
            font-family: var(--vscode-font-family); color: var(--vscode-foreground);
        }
        .page { max-width: 1400px; margin: 0 auto; padding: 32px 32px 64px; display: flex; flex-direction: column; gap: 24px; }
        .hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 8px; }
        .hero h1 { margin: 0; font-size: 26px; letter-spacing: -0.4px; font-weight: 700; }
        .hero p { margin: 6px 0 0 0; opacity: 0.7; font-size: 14px; max-width: 600px; line-height: 1.5; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; }
        .card { background-color: color-mix(in srgb, var(--vscode-sideBar-background) 80%, transparent); border: 1px solid var(--vscode-widget-border); border-radius: 12px; padding: 24px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
        .card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.12); border-color: var(--vscode-focusBorder); }
        .card.full-width { grid-column: 1 / -1; }
        h3 { margin-top: 0; margin-bottom: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.8; }
        .status-row { display: flex; align-items: center; gap: 10px; font-weight: 600; }
        .status-dot { width: 12px; height: 12px; border-radius: 50%; background-color: ${statusColor}; box-shadow: 0 0 10px ${statusColor}; }
        .info-grid { display: grid; grid-template-columns: 120px 1fr; gap: 6px 12px; font-size: 12px; align-items: center; }
        .label { opacity: 0.7; text-transform: uppercase; letter-spacing: 0.3px; font-size: 11px; }
        .value { font-family: var(--vscode-editor-font-family); word-break: break-all; }
        .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
        button { display: inline-flex; justify-content: center; align-items: center; gap: 6px; width: 100%; padding: 10px 12px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid color-mix(in srgb, var(--vscode-button-background) 50%, transparent); border-radius: 6px; cursor: pointer; font-family: var(--vscode-font-family); font-weight: 600; transition: transform 120ms ease, background-color 120ms ease; }
        button:hover { background-color: var(--vscode-button-hoverBackground); transform: translateY(-1px); }
        button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        button.secondary { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        button.success { background-color: var(--vscode-testing-iconPassed); }
        button.danger { background-color: var(--vscode-testing-iconFailed); }
        .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--vscode-widget-border); }
        .toggle-row:last-child { border-bottom: none; }
        .switch { position: relative; width: 36px; height: 20px; }
        .switch input { display: none; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--vscode-input-background); border: 1px solid var(--vscode-widget-border); transition: .2s; border-radius: 999px; }
        .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: var(--vscode-foreground); transition: .2s; border-radius: 50%; }
        input:checked + .slider { background: var(--vscode-testing-iconPassed); border-color: var(--vscode-testing-iconPassed); }
        input:checked + .slider:before { transform: translateX(16px); background: var(--vscode-editor-background); }
        .muted { opacity: 0.75; font-size: 12px; }
        .inline-form { display: grid; grid-template-columns: 140px 1fr; gap: 16px; align-items: center; }
        .stacked { display: flex; flex-direction: column; gap: 12px; }
        input, select, textarea { width: 100%; padding: 8px 10px; font-size: 13px; border-radius: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: var(--vscode-font-family); box-sizing: border-box; }
        textarea { font-family: var(--vscode-editor-font-family); font-size: 12px; resize: vertical; min-height: 120px; }
        select { cursor: pointer; }
        .pill-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .pill { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--vscode-widget-border); background: var(--vscode-editor-background); cursor: pointer; }
        .pill:hover { border-color: var(--vscode-testing-iconPassed); color: var(--vscode-testing-iconPassed); }
        .docs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
        .doc-card { border: 1px dashed var(--vscode-widget-border); border-radius: 8px; padding: 10px; background: color-mix(in srgb, var(--vscode-editor-background) 90%, transparent); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
        .doc-card:hover { border-color: var(--vscode-focusBorder); background: color-mix(in srgb, var(--vscode-editor-background) 70%, transparent); }
        .doc-card h4 { margin: 0 0 6px 0; font-size: 13px; display: flex; gap: 8px; align-items: center; }
        .doc-card code { display: inline-block; padding: 3px 6px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); font-family: var(--vscode-editor-font-family); }
        .doc-card p { margin: 6px 0 0 0; opacity: 0.85; font-size: 12px; }
        pre { background: var(--vscode-textBlockQuote-background); border-radius: 8px; padding: 10px; font-size: 12px; overflow-x: auto; margin: 0; white-space: pre-wrap; word-break: break-word; }
        a { color: var(--vscode-textLink-foreground); }
        
        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 50%; border-top-color: transparent; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Live Log Tail Styles */
        .log-container {
            background: #0d1117;
            color: #e6edf3;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            padding: 12px;
            border-radius: 8px;
            height: 300px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 2px;
            border: 1px solid var(--vscode-widget-border);
            margin-top: 8px;
        }
        .log-line {
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-all;
            display: flex;
            gap: 8px;
        }
        .log-time { color: #8b949e; min-width: 75px; flex-shrink: 0; }
        .log-method { font-weight: 600; color: #58a6ff; min-width: 50px; flex-shrink: 0; }
        .log-path { color: #d2a8ff; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .log-status { font-weight: 600; min-width: 35px; flex-shrink: 0; }
        .log-status.success { color: #3fb950; }
        .log-status.error { color: #f85149; }
        .log-latency { color: #d0d7de; min-width: 60px; text-align: right; flex-shrink: 0; }
        
        #log-status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
            transition: background-color 0.3s ease;
        }
        #log-status-indicator.active { background-color: #3fb950; box-shadow: 0 0 8px #3fb950; }
        #log-status-indicator.inactive { background-color: #8b949e; }

    </style>
</head>
<body>
    <div class="page">
        <div class="hero">
            <div>
                <h1>Copilot API Dashboard</h1>
                <p>Monitor and control your local Copilot API Gateway.</p>
                <div style="margin-top: 8px; font-size: 13px; opacity: 0.9; font-family: var(--vscode-editor-font-family);">
                    <span style="opacity: 0.6;">Running on:</span> 
                    <strong>http://${config.host}:${config.port}</strong>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="btn-toggle-server" class="${status.running ? 'danger' : 'success'}" data-running="${status.running}" style="min-width: 140px;">
                    ${status.running ? 'Stop Server' : 'Start Server'}
                </button>
                <button class="secondary" id="btn-open-chat" title="Open Copilot Chat" style="min-width: 90px;">💬 Chat</button>
                <button class="secondary" id="btn-ask-copilot" title="Ask Copilot" style="min-width: 90px;">❓ Ask</button>
                <button class="secondary" id="btn-settings" title="Settings">⚙️</button>
            </div>
        </div>

        <!-- Copilot Health Banner -->
        ${!status.copilot.ready ? `
        <div style="background: var(--vscode-statusBarItem-warningBackground); color: var(--vscode-statusBarItem-warningForeground); padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; font-weight: 500; border: 1px solid rgba(0,0,0,0.1);">
            <span style="font-size: 20px;">⚠️</span>
            <div style="flex: 1;">
                <div style="font-size: 14px;">GitHub Copilot is not fully ready</div>
                <div style="font-size: 12px; opacity: 0.9; font-weight: 400;">
                    ${!status.copilot.installed ? '• GitHub Copilot extension is missing. ' : ''}
                    ${!status.copilot.chatInstalled ? '• GitHub Copilot Chat extension is missing. ' : ''}
                    ${!status.copilot.signedIn ? '• You are not signed in to GitHub Copilot. ' : ''}
                </div>
            </div>
            <button class="secondary" onclick="vscode.postMessage({ type: 'askCopilot' })" style="width: auto; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: inherit;">Resolve</button>
        </div>
        ` : ''}

        <!-- Server Status Card -->
        <div class="card full-width">
            <div class="status-row" style="justify-content: space-between; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div id="status-dot" class="status-dot"></div>
                    <span id="server-status-text" style="font-size: 16px;">${statusText}</span>
                </div>
                <div class="muted">
                    v${gateway.getVersion()}
                </div>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="card" style="padding: 16px;">
                    <div class="label">Requests</div>
                    <div class="value" style="font-size: 20px;" id="stat-requests">${status.stats?.totalRequests ?? 0}</div>
                </div>
                <div class="card" style="padding: 16px;">
                    <div class="label">Req/Min</div>
                    <div class="value" style="font-size: 20px;" id="stat-rpm">0</div>
                </div>
                <div class="card" style="padding: 16px;">
                    <div class="label">Latency</div>
                    <div class="value" style="font-size: 20px;" id="stat-latency">0ms</div>
                </div>
                <div class="card" style="padding: 16px;">
                    <div class="label">Error Rate</div>
                    <div class="value" style="font-size: 20px;" id="stat-errors">0%</div>
                </div>
                <div class="card" style="padding: 16px;">
                    <div class="label">Tokens In</div>
                    <div class="value" style="font-size: 20px;" id="stat-tokens-in">${status.stats?.totalTokensIn ?? 0}</div>
                </div>
                <div class="card" style="padding: 16px;">
                    <div class="label">Tokens Out</div>
                    <div class="value" style="font-size: 20px;" id="stat-tokens-out">${status.stats?.totalTokensOut ?? 0}</div>
                </div>
                <div class="card" style="padding: 16px;">
                    <div class="label">Uptime</div>
                    <div class="value" style="font-size: 20px;" id="stat-uptime">0m</div>
                </div>
            </div>

            <div class="info-grid">
                <div class="label">Connection</div>
                <div class="value">
                    ${config.enableHttp ? 'HTTP ' : ''}
                    ${config.enableWebSocket ? 'WebSocket ' : ''}
                </div>
                <div class="label">Auth Mode</div>
                <div class="value">${config.apiKey ? 'API Key (Protected)' : 'Open (No Auth)'}</div>
                <div class="label">Default Model</div>
                <div class="value">${config.defaultModel}</div>
                <div class="label">Copilot Health</div>
                <div class="value" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <span class="badge" style="background: ${status.copilot.chatInstalled ? 'var(--vscode-charts-green)' : (status.copilot.signedIn ? 'var(--vscode-charts-yellow)' : 'var(--vscode-charts-red)')}; color: ${status.copilot.chatInstalled ? 'var(--vscode-editor-background)' : (status.copilot.signedIn ? 'var(--vscode-editor-background)' : 'white')}; padding: 1px 6px; border-radius: 4px; font-size: 10px;">Chat: ${status.copilot.chatInstalled ? 'Installed' : (status.copilot.signedIn ? 'Not Detected' : 'Missing')}</span>
                    <span class="badge" style="background: ${status.copilot.signedIn ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-red)'}; color: ${status.copilot.signedIn ? 'var(--vscode-editor-background)' : 'white'}; padding: 1px 6px; border-radius: 4px; font-size: 10px;">Auth: ${status.copilot.signedIn ? 'Signed In' : 'Signed Out'}</span>
                </div>
            </div>
        </div>

        <div class="grid">
            <!-- Configuration Card -->
            <div class="card">
                <h3>⚙️ Server Configuration</h3>
                <div class="stacked">
                    <div class="toggle-row">
                        <span>Enable HTTP Server</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-http" ${config.enableHttp ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-row">
                        <span>Enable WebSocket</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-ws" ${config.enableWebSocket ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-row">
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span>Detailed Logging</span>
                            <span title="Enables verbose output to the VS Code Output channel. Useful for debugging." style="cursor: help; opacity: 0.6; font-size: 14px;">ℹ️</span>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="toggle-logging" ${config.enableLogging ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div style="margin-top: 16px;">
                        <div style="display: flex; gap: 16px; margin-bottom: 12px;">
                            <div style="flex: 1;">
                                <span style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 6px;">HOST</span>
                                <input type="text" id="custom-host" value="${config.host}" placeholder="127.0.0.1" style="width: 100% !important;">
                            </div>
                            <div style="width: 100px;">
                                <span style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 6px;">PORT</span>
                                <input type="number" id="custom-port" value="${config.port}" style="width: 100% !important;">
                            </div>
                            <div style="display: flex; align-items: flex-end;">
                                <button class="secondary" id="btn-set-host" style="height: 36px; padding: 0 16px;">Apply</button>
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button class="secondary" id="btn-host-local" style="flex: 1;">Bind Localhost</button>
                            <button class="secondary" id="btn-host-lan" style="flex: 1;">Bind LAN (0.0.0.0)</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Security Card -->
            <div class="card">
                <h3>🔒 Security</h3>
                <div class="stacked">
                    <div class="toggle-row">
                        <span>Enable Authentication</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-auth" ${config.apiKey ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div style="margin-top: 12px;">
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="password" id="api-key-input" value="${config.apiKey || ''}" placeholder="sk-..." style="flex: 1;">
                            <button class="secondary" id="btn-show-key" style="width: 40px;" title="Show/Hide Key">👁</button>
                            <button class="secondary" id="btn-copy-key" style="width: 40px;" title="Copy Key">📋</button>
                        </div>
                        <div class="actions">
                            <button class="secondary" id="btn-generate-key">Generate New Key</button>
                            <button class="secondary" id="btn-set-apikey">Set Manual Key</button>
                        </div>
                    </div>

                    <div style="margin-top: 16px; border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                        <span style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 8px;">RATE LIMIT</span>
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <input type="number" id="rate-limit-input" value="${config.rateLimitPerMinute || 0}" placeholder="0 = unlimited" style="width: 100px !important;">
                            <span class="muted">req/min</span>
                            <button class="secondary" id="btn-set-ratelimit" style="width: auto; padding: 6px 16px;">Set</button>
                        </div>
                    </div>

                    <div style="margin-top: 16px; border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                        <div class="inline-form" style="margin-bottom: 8px;">
                            <span style="font-size: 12px; font-weight: 600;">ALLOW IP / DOMAIN</span>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="ip-allowlist-input" placeholder="e.g. 192.168.1.5, 10.0.0.0/24, or example.com">
                                <button class="secondary" id="btn-add-ip" style="width: auto;">Add</button>
                            </div>
                        </div>
                        <div class="pill-row" id="ip-list">
                            ${(config.ipAllowlist || []).map(ip =>
            `<span class="pill" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">${ip} <span class="btn-remove-ip" data-value="${ip}" style="cursor: pointer; opacity: 0.6;">×</span></span>`
        ).join('')}
                            ${(!config.ipAllowlist || config.ipAllowlist.length === 0) ? '<span class="muted">No access restrictions (all IPs allowed)</span>' : ''}
                        </div>
                    </div>

                    <div style="margin-top: 16px; border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                        <span style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 8px;">HARDENING & LIMITS</span>
                        
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="muted" style="width: 120px; font-size: 11px;">Request Timeout</span>
                                <input type="number" id="timeout-input" value="${config.requestTimeoutSeconds || 60}" style="width: 80px !important;">
                                <span class="muted">sec</span>
                                <button class="secondary" id="btn-set-timeout" style="width: auto; padding: 4px 12px; font-size: 11px;">Set</button>
                            </div>

                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="muted" style="width: 120px; font-size: 11px;">Max Payload</span>
                                <input type="number" id="payload-input" value="${config.maxPayloadSizeMb || 1}" style="width: 80px !important;">
                                <span class="muted">MB</span>
                                <button class="secondary" id="btn-set-payload" style="width: auto; padding: 4px 12px; font-size: 11px;">Set</button>
                            </div>

                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="muted" style="width: 120px; font-size: 11px;">Max Connections/IP</span>
                                <input type="number" id="connections-input" value="${config.maxConnectionsPerIp || 10}" style="width: 80px !important;">
                                <span class="muted">conn</span>
                                <button class="secondary" id="btn-set-connections" style="width: auto; padding: 4px 12px; font-size: 11px;">Set</button>
                            </div>

                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <span class="muted" style="width: 120px; font-size: 11px;">Total Concurrency</span>
                                <input type="number" id="concurrency-input" value="${config.maxConcurrentRequests || 4}" style="width: 80px !important;">
                                <span class="muted">req</span>
                                <button class="secondary" id="btn-set-concurrency" style="width: auto; padding: 4px 12px; font-size: 11px;">Set</button>
                            </div>
                            <div class="muted" style="font-size: 10px; margin-top: 2px; opacity: 0.9; line-height: 1.4;">
                                <div style="display: flex; gap: 4px; margin-bottom: 2px;">
                                    <span style="font-weight: 600; color: var(--vscode-charts-blue); min-width: 105px;">Connections/IP:</span>
                                    <span>Limits simultaneous requests from a <b>single</b> user/client.</span>
                                </div>
                                <div style="display: flex; gap: 4px;">
                                    <span style="font-weight: 600; color: var(--vscode-charts-orange); min-width: 105px;">Total Concurrency:</span>
                                    <span>Global limit across <b>all</b> users to protect the Copilot backend.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- MCP Status -->
        <div class="card full-width" id="mcp-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">🔌 MCP Status <span id="mcp-status-badge" class="badge">Checking...</span></h3>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <label style="font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer; opacity: 0.8;">
                        <input type="checkbox" id="mcp-enabled-toggle" style="width: 14px; height: 14px; margin: 0;"> Enabled
                    </label>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                <div style="padding: 12px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; background: rgba(0,0,0,0.1);">
                    <div class="muted" style="font-size: 11px; margin-bottom: 4px;">Connected Servers</div>
                    <div id="mcp-servers-count" style="font-size: 18px; font-weight: 600;">0</div>
                    <div id="mcp-servers-list" class="muted" style="font-size: 10px; margin-top: 4px;">None</div>
                </div>
                <div style="padding: 12px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; background: rgba(0,0,0,0.1);">
                    <div class="muted" style="font-size: 11px; margin-bottom: 4px;">Available Tools</div>
                    <div id="mcp-tools-count" style="font-size: 18px; font-weight: 600;">0</div>
                    <div id="mcp-tools-list" class="muted" style="font-size: 10px; margin-top: 4px; max-height: 60px; overflow-y: auto;">None</div>
                </div>
            </div>
        </div>

        <!-- Live Log Tail -->
        <div class="card full-width">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">📟 Live Log Tail <div id="log-status-indicator" class="active"></div></h3>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <label style="font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer; opacity: 0.8;">
                        <input type="checkbox" id="log-autoscroll" checked style="width: 14px; height: 14px; margin: 0;"> Auto-scroll
                    </label>
                    <button class="secondary" id="btn-clear-logs" style="width: auto; padding: 4px 12px; font-size: 11px; font-weight: 500;">🧹 Clear</button>
                </div>
            </div>
            <div id="live-log-container" class="log-container">
                <div class="muted" style="text-align: center; padding-top: 120px; opacity: 0.5;">Waiting for API requests...</div>
            </div>
        </div>

        <!-- Audit & Analytics -->
        <div class="card full-width">
            
            <!-- Charts removed per user request -->
            <div style="margin-bottom: 24px;"></div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h4 style="margin: 0; font-size: 13px; opacity: 0.9;">Recent Activity</h4>
                <span id="refresh-timer" class="muted" style="font-weight: normal; font-size: 11px; opacity: 0.6;"></span>
                <div style="display: flex; gap: 8px;">
                    <button class="secondary" id="btn-refresh-audit" style="padding: 4px 10px; font-size: 11px;">🔄 Refresh</button>
                    <button class="secondary" id="btn-open-logs" style="padding: 4px 10px; font-size: 11px;">📂 Open Log Folder</button>
                </div>
            </div>

            <div style="overflow-x: auto;">
                <table id="audit-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="text-align: left; border-bottom: 1px solid var(--vscode-widget-border);">
                            <th style="padding: 8px 12px; opacity: 0.7;">Time</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Method</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Path</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Status</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Latency</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Tokens</th>
                            <th style="padding: 8px 12px; opacity: 0.7;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="audit-table-body">
                        <tr style="border-bottom: 1px solid var(--vscode-widget-border);">
                            <td style="padding: 8px 12px; opacity: 0.6; font-style: italic;" colspan="7">Loading audit logs...</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--vscode-widget-border);">
                <div class="muted" style="font-size: 11px;" id="page-info">Showing 0-0 of 0</div>
                <div style="display: flex; gap: 8px;">
                    <button class="secondary" id="btn-prev-page" disabled>Previous</button>
                    <button class="secondary" id="btn-next-page" disabled>Next</button>
                </div>
            </div>
        </div>
        
        <div class="card full-width">
            <h3>🛡️ Data Redaction</h3>
            <p class="muted" style="margin-bottom: 16px;">
                Toggle patterns to automatically redact sensitive data from logs. All patterns are applied in real-time.
            </p>
            
            <!-- Built-in Patterns -->
            <div style="margin-bottom: 20px;">
                <h4 style="font-size: 13px; margin-bottom: 12px; opacity: 0.9;">Built-in Patterns</h4>
                <div id="builtin-patterns-list" style="display: flex; flex-direction: column; gap: 8px;">
                    ${(config.redactionPatterns || []).filter((p: any) => p.isBuiltin).map((p: any) => `
                        <div class="toggle-row" style="padding: 8px 12px; background: var(--vscode-editor-background); border-radius: 6px; border: 1px solid var(--vscode-widget-border);">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="font-weight: 600; font-size: 12px;">${p.name}</span>
                                <code style="font-size: 10px; opacity: 0.6; word-break: break-all;">${p.pattern.length > 40 ? p.pattern.substring(0, 40) + '...' : p.pattern}</code>
                            </div>
                            <label class="switch">
                                <input type="checkbox" class="toggle-redaction" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Custom Patterns -->
            <div style="border-top: 1px solid var(--vscode-widget-border); padding-top: 16px;">
                <h4 style="font-size: 13px; margin-bottom: 12px; opacity: 0.9;">Custom Patterns</h4>
                
                <div id="custom-patterns-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                    ${(config.redactionPatterns || []).filter((p: any) => !p.isBuiltin).map((p: any) => `
                        <div class="toggle-row" style="padding: 8px 12px; background: var(--vscode-editor-background); border-radius: 6px; border: 1px solid var(--vscode-widget-border);">
                            <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
                                <span style="font-weight: 600; font-size: 12px;">${p.name}</span>
                                <code style="font-size: 10px; opacity: 0.6; word-break: break-all;">${p.pattern}</code>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <label class="switch">
                                    <input type="checkbox" class="toggle-redaction" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <button class="secondary btn-remove-redaction" data-id="${p.id}" style="width: 28px; height: 28px; padding: 0; font-size: 14px;" title="Remove">×</button>
                            </div>
                        </div>
                    `).join('')}
                    ${(config.redactionPatterns || []).filter(p => !p.isBuiltin).length === 0 ? '<span class="muted" style="text-align: center; padding: 12px;">No custom patterns added yet</span>' : ''}
                </div>
                
                <!-- Add Custom Pattern Form -->
                <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--vscode-textBlockQuote-background); border-radius: 8px;">
                    <span style="font-size: 11px; font-weight: 600; opacity: 0.8;">ADD CUSTOM PATTERN</span>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <input type="text" id="redaction-name-input" placeholder="Pattern name (e.g. 'Bank Account')" style="flex: 1; min-width: 150px;">
                        <input type="text" id="redaction-pattern-input" placeholder="Regex pattern" style="flex: 2; min-width: 200px;">
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="secondary" id="btn-test-redaction" style="width: auto;">🧪 Test</button>
                        <button class="secondary" id="btn-add-redaction" style="width: auto;">➕ Add Pattern</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="card full-width">
            <h3>\ud83d\udcda API Documentation</h3>
            <p class="muted" style="margin-bottom: 16px;">
                The gateway supports multiple API formats. Use the endpoints below with your favorite SDKs.
            </p>
            <div class="docs-grid">
                <div class="doc-card">
                    <h4><span>🤖</span> OpenAI <code>/v1</code></h4>
                    <p>Compatible with OpenAI SDKs. Supports <code>chat/completions</code>, <code>completions</code>, and <code>models</code>.</p>
                </div>
                <div class="doc-card">
                    <h4><span>🧪</span> Anthropic <code>/v1</code></h4>
                    <p>Compatible with Claude SDKs. Supports <code>/v1/messages</code> with full streaming (SSE).</p>
                </div>
                <div class="doc-card">
                    <h4><span>🌟</span> Google <code>/v1beta</code></h4>
                    <p>Compatible with Gemini SDKs. Supports <code>generateContent</code> and <code>streamGenerateContent</code>.</p>
                </div>
                <div class="doc-card">
                    <h4><span>🔌</span> MCP Tools</h4>
                    <p>MCP tools are automatically prefixed with <code>mcp_{server}_{tool}</code>. The gateway handles execution automatically in non-streaming mode.</p>
                </div>
            </div>
            <div class="actions" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 16px;">
                <a href="http://${config.host}:${config.port}/docs" target="_blank" class="secondary" style="display: inline-flex; justify-content: center; align-items: center; gap: 6px; padding: 10px 12px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid color-mix(in srgb, var(--vscode-button-secondaryBackground) 50%, transparent); border-radius: 6px; text-decoration: none; font-weight: 600;">\ud83d\udcdd Swagger UI</a>
                <a href="http://${config.host}:${config.port}/openapi.json" target="_blank" class="secondary" style="display: inline-flex; justify-content: center; align-items: center; gap: 6px; padding: 10px 12px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid color-mix(in srgb, var(--vscode-button-secondaryBackground) 50%, transparent); border-radius: 6px; text-decoration: none; font-weight: 600;">\ud83d\udcc4 OpenAPI JSON</a>
            </div>
        </div>

        <div class="card full-width" style="background: linear-gradient(135deg, color-mix(in srgb, var(--vscode-sideBar-background) 90%, #3b82f6 10%), color-mix(in srgb, var(--vscode-sideBar-background) 95%, #8b5cf6 5%));">
            <h3>👨‍💻 About</h3>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 200px;">
                    <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">Suhaib Bin Younis</div>
                    <div class="muted" style="margin-bottom: 8px;">Developer & Creator</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <a href="https://suhaibbinyounis.com" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">🌐 Website</a>
                        <a href="https://suhaib.in" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">🔗 suhaib.in</a>
                        <a href="mailto:vscode@suhaib.in" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">📧 Email</a>
                        <a href="https://github.com/pmbyt/github-copilot-api-vscode" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--vscode-button-secondaryBackground); border-radius: 4px; text-decoration: none; font-size: 12px;">⭐ Star on GitHub</a>
                    </div>
                </div>
                <div class="muted" style="font-size: 11px; text-align: right;">
                    GitHub Copilot API Gateway v${gateway.getVersion()}<br>
                    Made with ❤️ and ☕
                </div>
            </div>
        </div>
    </div>

    <!-- Detail Modal -->
    <div id="detail-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
        <div style="background: var(--vscode-sideBar-background); padding: 24px; border-radius: 12px; width: 80%; max-width: 800px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--vscode-widget-border); box-shadow: 0 4px 24px rgba(0,0,0,0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0;">Request Details</h3>
                <button class="secondary" id="btn-close-modal" style="width: auto; padding: 6px 12px;">Close</button>
            </div>
            <div style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; padding-right: 8px;">
                <div style="position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h4 style="margin: 0; opacity: 0.8;">Request</h4>
                        <button class="secondary btn-copy-modal" data-target="modal-request" style="width: auto; padding: 2px 8px; font-size: 10px;">📋 Copy</button>
                    </div>
                    <pre id="modal-request" style="font-size: 11px; max-height: 300px; overflow: auto; margin: 0;"></pre>
                </div>
                <div style="position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h4 style="margin: 0; opacity: 0.8;">Response</h4>
                        <button class="secondary btn-copy-modal" data-target="modal-response" style="width: auto; padding: 2px 8px; font-size: 10px;">📋 Copy</button>
                    </div>
                    <pre id="modal-response" style="font-size: 11px; max-height: 300px; overflow: auto; margin: 0;"></pre>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        var vscode = acquireVsCodeApi();
        
        // Pagination state - declare at top to avoid hoisting issues
        var currentPage = 1;
        var pageSize = 10;
        var totalLogs = 0;
        var lastLogs = [];

        document.getElementById('btn-toggle-server').onclick = function() {
            var running = this.getAttribute('data-running') === 'true';
            vscode.postMessage({ type: running ? 'stopServer' : 'startServer' });
        };

        document.getElementById('btn-open-chat').onclick = function() {
            vscode.postMessage({ type: 'openChat' });
        };

        document.getElementById('btn-ask-copilot').onclick = function() {
            vscode.postMessage({ type: 'askCopilot' });
        };

        document.getElementById('btn-settings').onclick = function() {
            vscode.postMessage({ type: 'showControls' });
        };

        document.getElementById('toggle-http').onchange = function() {
            vscode.postMessage({ type: 'toggleHttp' });
        };

        document.getElementById('toggle-ws').onchange = function() {
            vscode.postMessage({ type: 'toggleWs' });
        };

        document.getElementById('toggle-logging').onchange = function() {
            vscode.postMessage({ type: 'toggleLogging' });
        };

        // Store the current API key for copy functionality
        var currentApiKey = '${config.apiKey || ''}';

        document.getElementById('toggle-auth').onchange = function() {
            if (!this.checked) {
                // Disable auth by clearing API key
                currentApiKey = '';
                vscode.postMessage({ type: 'setApiKey', value: '' });
            } else {
                // Generate a random key when enabling
                var key = 'sk-' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
                document.getElementById('api-key-input').value = key;
                document.getElementById('api-key-input').type = 'text';
                currentApiKey = key;
                vscode.postMessage({ type: 'setApiKey', value: key });
            }
        };

        document.getElementById('btn-set-apikey').onclick = function() {
            var v = document.getElementById('api-key-input').value.trim();
            currentApiKey = v;
            vscode.postMessage({ type: 'setApiKey', value: v });
            if (v) {
                document.getElementById('toggle-auth').checked = true;
            }
        };

        document.getElementById('btn-generate-key').onclick = function() {
            var key = 'sk-' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
            document.getElementById('api-key-input').value = key;
            document.getElementById('api-key-input').type = 'text';
            currentApiKey = key;
            vscode.postMessage({ type: 'setApiKey', value: key });
            document.getElementById('toggle-auth').checked = true;
        };

        document.getElementById('btn-copy-key').onclick = function() {
            var input = document.getElementById('api-key-input');
            var keyToCopy = input.value.trim() || currentApiKey;
            if (keyToCopy) {
                navigator.clipboard.writeText(keyToCopy).then(function() {
                    var btn = document.getElementById('btn-copy-key');
                    btn.textContent = '✓';
                    setTimeout(function() { btn.textContent = '📋'; }, 1500);
                });
            }
        };

        document.getElementById('btn-show-key').onclick = function() {
            var input = document.getElementById('api-key-input');
            var btn = document.getElementById('btn-show-key');
            if (input.type === 'password') {
                input.type = 'text';
                if (!input.value && currentApiKey) {
                    input.value = currentApiKey;
                }
                btn.textContent = '🙈';
            } else {
                input.type = 'password';
                btn.textContent = '👁';
            }
        };

        document.getElementById('btn-set-ratelimit').onclick = function() {
            var v = document.getElementById('rate-limit-input').value;
            vscode.postMessage({ type: 'setRateLimit', value: Number(v) || 0 });
        };

        // Initialize on load
        // try { initCharts(); } catch (e) { console.error('Failed to init charts', e); }
        
        // Request initial data
        setTimeout(() => vscode.postMessage({ type: 'getAuditStats' }), 500);

        document.getElementById('btn-refresh-audit').onclick = function() {
            startCountdown(); // Reset timer
            vscode.postMessage({ type: 'getAuditStats' });
            vscode.postMessage({ type: 'getAuditLogs', value: { page: currentPage, pageSize: pageSize } });
            this.textContent = '🔄 Loading...';
            setTimeout(() => { this.textContent = '🔄 Refresh'; }, 1000);
        };

        document.getElementById('btn-open-logs').onclick = function() {
            vscode.postMessage({ type: 'openLogFolder' });
        };

        // Modal Logic
        // Modal Logic
        const modal = document.getElementById('detail-modal');
        function closeModal() {
            modal.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
        }

        document.getElementById('btn-close-modal').onclick = closeModal;
        
        window.onclick = function(event) {
            if (event.target == modal) {
                closeModal();
            }
        }

        // Global function for View button
        window.showDetails = function(index) {
            if (!lastLogs || !lastLogs[index]) return;
            const log = lastLogs[index];
            
            const reqContent = {
                headers: log.requestHeaders,
                body: log.requestBody
            };
            const resContent = {
                headers: log.responseHeaders,
                body: log.responseBody,
                error: log.error
            };

            document.getElementById('modal-request').textContent = JSON.stringify(reqContent, null, 2);
            document.getElementById('modal-response').textContent = JSON.stringify(resContent, null, 2);
            
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden'; // Lock scrolling
        };

        // Copy content from modal
        document.querySelectorAll('.btn-copy-modal').forEach(btn => {
            btn.onclick = function() {
                const targetId = this.getAttribute('data-target');
                const content = document.getElementById(targetId).textContent;
                if (content) {
                    navigator.clipboard.writeText(content).then(() => {
                        const originalText = this.textContent;
                        this.textContent = '✓ Copied';
                        setTimeout(() => { this.textContent = originalText; }, 1500);
                    });
                }
            };
        });

        // Auto-refresh Countdown Logic
        let refreshTimer = 10;
        let refreshIntervalVal = null;
        const refreshSpan = document.getElementById('refresh-timer');
        
        function startCountdown() {
            if (refreshIntervalVal) clearInterval(refreshIntervalVal);
            
            refreshTimer = 10;
            updateTimerDisplay();
            
            refreshIntervalVal = setInterval(() => {
                refreshTimer--;
                updateTimerDisplay();
                
                if (refreshTimer <= 0) {
                    refreshTimer = 10;
                    vscode.postMessage({ type: 'getAuditStats' });
                    // Also refresh current page of logs
                    vscode.postMessage({ type: 'getAuditLogs', value: { page: currentPage, pageSize: pageSize } });
                }
            }, 1000);
        }

        function updateTimerDisplay() {
            if (refreshSpan) {
                refreshSpan.textContent = \`Refreshing in \${refreshTimer}s...\`;
            }
        }

        startCountdown();

        // IP Allowlist handlers
        document.getElementById('btn-add-ip').onclick = function() {
            var ip = document.getElementById('ip-allowlist-input').value.trim();
            if (ip) {
                vscode.postMessage({ type: 'addIpAllowlistEntry', value: ip });
                document.getElementById('ip-allowlist-input').value = '';
            }
        };

        document.querySelectorAll('.btn-remove-ip').forEach(function(btn) {
            btn.onclick = function() {
                var ip = btn.getAttribute('data-value');
                if (ip) {
                    vscode.postMessage({ type: 'removeIpAllowlistEntry', value: ip });
                }
            };
        });

        document.getElementById('btn-host-local').onclick = function() {
            vscode.postMessage({ type: 'hostLocal' });
        };

        document.getElementById('btn-host-lan').onclick = function() {
            vscode.postMessage({ type: 'hostLan' });
        };

        // Copy URL buttons for shareable LAN URLs
        document.querySelectorAll('.btn-copy-url').forEach(function(btn) {
            btn.onclick = function() {
                var url = btn.getAttribute('data-url');
                if (url) {
                    navigator.clipboard.writeText(url).then(function() {
                        var originalText = btn.textContent;
                        btn.textContent = '✓ Copied!';
                        setTimeout(function() { btn.textContent = originalText; }, 1500);
                    });
                }
            };
        });

        // MCP Toggle
        var mcpToggle = document.getElementById('mcp-enabled-toggle');
        if (mcpToggle) {
            mcpToggle.onchange = function() {
                vscode.postMessage({ type: 'toggleMcp', value: mcpToggle.checked });
            };
        }

        document.getElementById('btn-set-host').onclick = function() {
            var host = document.getElementById('custom-host').value;
            var port = document.getElementById('custom-port').value;
            if (host) vscode.postMessage({ type: 'setHost', value: host });
            if (port) vscode.postMessage({ type: 'setPort', value: Number(port) });
        };

        // btn-set-port removed - consolidated with btn-set-host Apply button

        document.getElementById('btn-set-timeout').onclick = function() {
            var val = document.getElementById('timeout-input').value;
            vscode.postMessage({ type: 'setRequestTimeout', value: Number(val) });
        };

        document.getElementById('btn-set-payload').onclick = function() {
            var val = document.getElementById('payload-input').value;
            vscode.postMessage({ type: 'setMaxPayloadSize', value: Number(val) });
        };

        document.getElementById('btn-set-connections').onclick = function() {
            var val = document.getElementById('connections-input').value;
            vscode.postMessage({ type: 'setMaxConnectionsPerIp', value: Number(val) });
        };

        document.getElementById('btn-set-concurrency').onclick = function() {
            var val = document.getElementById('concurrency-input').value;
            vscode.postMessage({ type: 'setMaxConcurrency', value: Number(val) });
        };

        // btn-set-model removed - element doesn't exist in current UI

        // Redaction pattern handlers
        document.getElementById('btn-add-redaction').onclick = function() {
            var name = document.getElementById('redaction-name-input').value.trim();
            var pattern = document.getElementById('redaction-pattern-input').value.trim();
            if (!name) {
                alert('Please enter a pattern name');
                return;
            }
            if (!pattern) {
                alert('Please enter a regex pattern');
                return;
            }
            try {
                new RegExp(pattern); // Validate
                vscode.postMessage({ type: 'addRedactionPattern', value: { name: name, pattern: pattern } });
                document.getElementById('redaction-name-input').value = '';
                document.getElementById('redaction-pattern-input').value = '';
            } catch (e) {
                alert('Invalid regex pattern: ' + e.message);
            }
        };

        document.getElementById('btn-test-redaction').onclick = function() {
            var pattern = document.getElementById('redaction-pattern-input').value.trim();
            if (!pattern) {
                alert('Enter a pattern first');
                return;
            }
            try {
                var regex = new RegExp(pattern, 'gi');
                var testStr = prompt('Enter test string to check redaction:', 'my-api-key-12345 or test@email.com');
                if (testStr) {
                    var result = testStr.replace(regex, '[REDACTED]');
                    alert('Result: ' + result);
                }
            } catch (e) {
                alert('Invalid regex pattern: ' + e.message);
            }
        };

        // Toggle redaction pattern on/off
        document.querySelectorAll('.toggle-redaction').forEach(function(toggle) {
            toggle.onchange = function() {
                var id = toggle.getAttribute('data-id');
                var enabled = toggle.checked;
                vscode.postMessage({ type: 'toggleRedactionPattern', value: { id: id, enabled: enabled } });
            };
        });

        // Remove redaction pattern buttons
        document.querySelectorAll('.btn-remove-redaction').forEach(function(btn) {
            btn.onclick = function() {
                var id = btn.getAttribute('data-id');
                if (id && confirm('Remove this pattern?')) {
                    vscode.postMessage({ type: 'removeRedactionPattern', value: id });
                }
            };
        });

        // Handle messages from extension
        window.addEventListener('message', function(event) {
            var message = event.data;
            console.log('[Dashboard] Received message:', message.type, message);
            if (message.type === 'historyData') {
                // Legacy support if needed
            } else if (message.type === 'statsData') {
                updateStats(message.data);
            } else if (message.type === 'auditStatsData') {
                updateCharts(message.data);
            } else if (message.type === 'auditLogData') {
                console.log('[Dashboard] Updating log table with', message.data?.length || 0, 'entries');
                updateLogTable(message.data, message.page, message.total, message.pageSize);
            } else if (message.type === 'liveLog') {
                appendLog(message.value);
            }
        });

        // Pagination state variables moved to top of script

        document.getElementById('btn-prev-page').onclick = function() {
            if (currentPage > 1) {
                currentPage--;
                vscode.postMessage({ type: 'getAuditLogs', value: { page: currentPage, pageSize: pageSize } });
                document.getElementById('audit-table-body').innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; opacity: 0.7;">Loading...</td></tr>';
            }
        };

        document.getElementById('btn-next-page').onclick = function() {
            if (currentPage * pageSize < totalLogs) {
                currentPage++;
                vscode.postMessage({ type: 'getAuditLogs', value: { page: currentPage, pageSize: pageSize } });
                document.getElementById('audit-table-body').innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; opacity: 0.7;">Loading...</td></tr>';
            }
        };

        function updateCharts(stats) {
            // Charts removed per user request
        }

        // lastLogs declared at top of script

        function formatNumber(num) {
            if (num === undefined || num === null) return '0';
            if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
            if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
            if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
            if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
            return num.toString();
        }

// Live Log Tail Logic
        const logContainer = document.getElementById('live-log-container');
        const autoScroll = document.getElementById('log-autoscroll');
        const logStatus = document.getElementById('log-status-indicator');
        let linesCount = 0;

        function appendLog(log) {
            if (!logContainer) return;
            if (linesCount === 0) logContainer.innerHTML = '';
            
            const line = document.createElement('div');
            line.className = 'log-line';
            
            const isError = log.status >= 400;
            const statusClass = isError ? 'error' : 'success';
            
            const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            line.innerHTML = '<span class="log-time">[' + time + ']</span>' +
                             '<span class="log-method">' + (log.method || 'UNK') + '</span>' +
                             '<span class="log-path">' + (log.path || '/') + '</span>' +
                             '<span class="log-status ' + statusClass + '">' + (log.status || 0) + '</span>' +
                             '<span class="log-latency">' + (log.durationMs || 0) + 'ms</span>';

            
            logContainer.appendChild(line);
            linesCount++;
            
            // Pulse status indicator
            if (logStatus) {
                logStatus.classList.remove('active');
                void logStatus.offsetWidth; // Trigger reflow
                logStatus.classList.add('active');
            }
            
            // Limit shown lines to 100 for performance
            if (linesCount > 100) {
                logContainer.removeChild(logContainer.firstChild);
                linesCount--;
            }
            
            if (autoScroll && autoScroll.checked) {
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }

        document.getElementById('btn-clear-logs').onclick = function() {
            if (logContainer) {
                logContainer.innerHTML = '<div class="muted" style="text-align: center; padding-top: 120px; opacity: 0.5;">Waiting for API requests...</div>';
                linesCount = 0;
            }
        };

        function updateLogTable(logs, page, total, pSize) {
            lastLogs = logs;
            currentPage = page;
            totalLogs = total;
            pageSize = pSize || 10;

            const tbody = document.getElementById('audit-table-body');
            const pageInfo = document.getElementById('page-info');
            const btnPrev = document.getElementById('btn-prev-page');
            const btnNext = document.getElementById('btn-next-page');

            if (pageInfo) {
                const start = (page - 1) * pageSize + 1;
                const end = Math.min(page * pageSize, total);
                pageInfo.textContent = \`Showing \${total === 0 ? 0 : start}-\${end} of \${total}\`;
            }
            if (btnPrev) btnPrev.disabled = page <= 1;
            if (btnNext) btnNext.disabled = page * pageSize >= total;

            if (!tbody) return;
            
            // Clear checks to force refresh
            tbody.innerHTML = '';
            
            if (!logs || logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="padding: 24px; text-align: center; opacity: 0.6; font-style: italic;">No audit logs found.<br><span style="font-size: 11px; opacity: 0.8; margin-top: 4px; display: block;">Make a request to generate logs.</span></td></tr>';
                return;
            }

            tbody.innerHTML = logs.map((log, index) => {
                const date = new Date(log.timestamp);
                const time = date.toLocaleTimeString();
                const statusColor = log.status >= 400 ? 'var(--vscode-testing-iconFailed)' : (log.status >= 300 ? 'var(--vscode-charts-yellow)' : 'var(--vscode-testing-iconPassed)');
                
                return \`
                <tr style="border-bottom: 1px solid var(--vscode-widget-border);">
                    <td style="padding: 8px 12px; white-space: nowrap; opacity: 0.8;">\${time}</td>
                    <td style="padding: 8px 12px; white-space: nowrap;"><span style="padding: 2px 6px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); font-size: 11px; font-family: var(--vscode-editor-font-family);">\${log.method || 'UNK'}</span></td>
                    <td style="padding: 8px 12px; word-break: break-all; font-family: var(--vscode-editor-font-family);">\${log.path || '/'}</td>
                    <td style="padding: 8px 12px; color: \${statusColor}; font-weight: 600;">\${log.status || 0}</td>
                    <td style="padding: 8px 12px;">\${log.durationMs || 0}ms</td>
                    <td style="padding: 8px 12px;" title="\${(log.tokensIn || 0) + (log.tokensOut || 0)} tokens">\${formatNumber ? formatNumber((log.tokensIn || 0) + (log.tokensOut || 0)) : 0}</td>
                    <td style="padding: 8px 12px;">
                        <button class="secondary btn-view-details" data-index="\${index}" style="padding: 2px 8px; font-size: 10px; width: auto;">🔍</button>
                    </td>
                </tr>\`;
    }).join('');

    // Add event listeners for view buttons (CSP safe)
    document.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', () => {
             const index = parseInt(btn.getAttribute('data-index') || '0');
             showDetails(index);
        });
    });
}

function updateStats(stats) {
    if (stats.totalRequests !== undefined) {
        document.getElementById('stat-requests').textContent = formatNumber(stats.totalRequests);
        document.getElementById('stat-requests').title = stats.totalRequests + ' requests';
    }
    if (stats.requestsPerMinute !== undefined) document.getElementById('stat-rpm').textContent = stats.requestsPerMinute;
    if (stats.avgLatencyMs !== undefined) document.getElementById('stat-latency').innerHTML = stats.avgLatencyMs + '<span style="font-size: 12px;">ms</span>';
    if (stats.totalTokensIn !== undefined) {
        document.getElementById('stat-tokens-in').textContent = formatNumber(stats.totalTokensIn);
        document.getElementById('stat-tokens-in').title = stats.totalTokensIn;
    }
    if (stats.totalTokensOut !== undefined) {
        document.getElementById('stat-tokens-out').textContent = formatNumber(stats.totalTokensOut);
        document.getElementById('stat-tokens-out').title = stats.totalTokensOut;
    }
    if (stats.errorRate !== undefined) document.getElementById('stat-errors').innerHTML = stats.errorRate + '<span style="font-size: 12px;">%</span>';
    if (stats.uptimeMs !== undefined) {
        var minutes = Math.floor(stats.uptimeMs / 60000);
        var hours = Math.floor(minutes / 60);
        var display = hours > 0 ? hours + 'h ' + (minutes % 60) + 'm' : minutes + 'm';
        document.getElementById('stat-uptime').textContent = display;
    }
    
    // Update MCP Status
    if (stats.mcp) {
        var mcpEnabled = stats.mcp.enabled;
        var statusBadge = document.getElementById('mcp-status-badge');
        if (statusBadge) {
            statusBadge.textContent = mcpEnabled ? (stats.mcp.servers.length > 0 ? 'Connected' : 'Ready') : 'Disabled';
            statusBadge.style.background = mcpEnabled ? (stats.mcp.servers.length > 0 ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-blue)') : 'var(--vscode-charts-red)';
            statusBadge.style.color = 'white';
            statusBadge.style.padding = '2px 8px';
            statusBadge.style.borderRadius = '10px';
            statusBadge.style.fontSize = '10px';
        }

        document.getElementById('mcp-servers-count').textContent = stats.mcp.servers.length;
        document.getElementById('mcp-servers-list').textContent = stats.mcp.servers.length > 0 ? stats.mcp.servers.join(', ') : 'None';
        
        document.getElementById('mcp-tools-count').textContent = stats.mcp.tools.length;
        var toolsList = stats.mcp.tools.map(function(t) { return t.name; }).join(', ');
        document.getElementById('mcp-tools-list').textContent = toolsList || 'None';
        
        var toggle = document.getElementById('mcp-enabled-toggle');
        if (toggle) toggle.checked = mcpEnabled;
    }
}

// Auto-refresh stats every 5 seconds
setInterval(function () {
    vscode.postMessage({ type: 'getStats' });
}, 5000);

// Load audit data on page load
// Load audit data on page load
vscode.postMessage({ type: 'getAuditStats' });
vscode.postMessage({ type: 'getAuditLogs', value: { page: 1, pageSize: 10 } });
</script>
    </body>
    </html>`;
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = await this._getSidebarHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'openDashboard':
                    await CopilotPanel.createOrShow(this._extensionUri, this._gateway);
                    break;
                case 'startServer':
                    void this._gateway.startServer();
                    break;
                case 'stopServer':
                    void this._gateway.stopServer();
                    break;
            }
        });
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
