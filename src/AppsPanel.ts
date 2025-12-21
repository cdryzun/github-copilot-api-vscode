/**
 * Apps Panel - Full Tab UI for Enterprise Apps Hub
 * 
 * Provides webview panels for:
 * 1. Apps Hub - grid of all apps (opens in editor tab)
 * 2. Individual App - each app opens in its own tab
 */

import * as vscode from 'vscode';
import { appRegistry, getAppsGroupedByCategory, categoryMetadata, getAppById } from './apps/registry';
import { appService } from './apps/AppService';
import { projectManager } from './apps/ProjectManager';
import { AppDefinition, AppsHubPreferences, SavedProject } from './apps/types';

/**
 * Apps Hub Panel Manager
 */
export class AppsPanel {
    private static hubPanel: vscode.WebviewPanel | undefined;
    private static appPanels: Map<string, vscode.WebviewPanel> = new Map();
    private static context: vscode.ExtensionContext;

    /**
     * Initialize the Apps Panel manager
     */
    public static initialize(context: vscode.ExtensionContext): void {
        AppsPanel.context = context;
        projectManager.initialize(context);
    }

    /**
     * Open the Apps Hub tab
     */
    public static openAppsHub(): void {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        // If hub panel exists, reveal it
        if (AppsPanel.hubPanel) {
            AppsPanel.hubPanel.reveal(column);
            return;
        }

        // Create new hub panel
        const panel = vscode.window.createWebviewPanel(
            'copilotAppsHub',
            '📦 Copilot Apps',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        AppsPanel.hubPanel = panel;
        panel.webview.html = AppsPanel.getHubHtml(panel.webview);

        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'openApp':
                    AppsPanel.openApp(message.appId);
                    break;
                case 'toggleFavorite':
                    await AppsPanel.toggleFavorite(message.appId);
                    if (AppsPanel.hubPanel) {
                        AppsPanel.hubPanel.webview.html = AppsPanel.getHubHtml(AppsPanel.hubPanel.webview);
                    }
                    break;
            }
        });

        panel.onDidDispose(() => {
            AppsPanel.hubPanel = undefined;
        });
    }

    /**
     * Open a specific app in its own tab
     */
    public static openApp(appId: string): void {
        const app = getAppById(appId);
        if (!app) {
            vscode.window.showErrorMessage(`App "${appId}" not found`);
            return;
        }

        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        // Check if app is already open
        const existingPanel = AppsPanel.appPanels.get(appId);
        if (existingPanel) {
            existingPanel.reveal(column);
            return;
        }

        // Create new panel for this app
        const panel = vscode.window.createWebviewPanel(
            `copilotApp-${appId}`,
            `${app.icon} ${app.name}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        AppsPanel.appPanels.set(appId, panel);
        const savedProjects = projectManager.getSavedProjects();
        panel.webview.html = AppsPanel.getAppHtml(panel.webview, app, savedProjects);

        panel.webview.onDidReceiveMessage(async (message) => {
            await AppsPanel.handleAppMessage(message, app, panel);
        });

        panel.onDidDispose(() => {
            AppsPanel.appPanels.delete(appId);
        });

        // Track recent app
        AppsPanel.addRecentApp(appId);
    }

    /**
     * Handle messages from app panel
     */
    private static async handleAppMessage(
        message: any,
        app: AppDefinition,
        panel: vscode.WebviewPanel
    ): Promise<void> {
        switch (message.type) {
            case 'executeApp':
                panel.webview.postMessage({ type: 'processingStart' });
                try {
                    const result = await appService.executeApp(
                        app,
                        message.inputs,
                        (progress) => {
                            panel.webview.postMessage({ type: 'progress', message: progress });
                        }
                    );
                    panel.webview.postMessage({ type: 'result', result });
                } catch (error) {
                    panel.webview.postMessage({
                        type: 'result',
                        result: {
                            success: false,
                            error: error instanceof Error ? error.message : String(error),
                            durationMs: 0
                        }
                    });
                }
                break;

            case 'pickProjectFolder':
                const folderPath = await projectManager.pickProjectFolder();
                if (folderPath) {
                    await projectManager.addProject(folderPath);
                    panel.webview.postMessage({
                        type: 'projectAdded',
                        project: { path: folderPath, name: folderPath.split('/').pop() }
                    });
                }
                break;

            case 'copyToClipboard':
                await vscode.env.clipboard.writeText(message.value);
                vscode.window.showInformationMessage('Copied to clipboard!');
                break;

            case 'insertAtCursor':
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    await editor.edit(builder => {
                        builder.insert(editor.selection.active, message.value);
                    });
                    vscode.window.showInformationMessage('Inserted at cursor!');
                }
                break;

            case 'saveAsFile':
                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(message.filename),
                    filters: { 'All Files': ['*'] }
                });
                if (uri) {
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(message.content, 'utf-8'));
                    vscode.window.showInformationMessage(`Saved to ${uri.fsPath}`);
                    // Open the file in editor
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc);
                }
                break;

            case 'downloadPlaywrightProject':
                // Create a project folder with all necessary files
                const projectUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: 'Select folder to save Playwright project',
                    openLabel: 'Save Project Here'
                });
                if (projectUri && projectUri[0]) {
                    try {
                        const projectPath = projectUri[0];
                        const files = message.files as { name: string; content: string }[];
                        for (const file of files) {
                            const fileUri = vscode.Uri.joinPath(projectPath, file.name);
                            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf-8'));
                        }
                        vscode.window.showInformationMessage(`Playwright project saved to ${projectPath.fsPath}`);
                        // Open the folder in VS Code
                        await vscode.commands.executeCommand('vscode.openFolder', projectPath, { forceNewWindow: false });
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to save project: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                break;

            case 'runTerminalCommand':
                // Run a command in the integrated terminal
                const terminal = vscode.window.createTerminal({
                    name: `${message.name || 'Playwright Test'}`,
                    cwd: message.cwd
                });
                terminal.show();
                terminal.sendText(message.command);
                break;

            case 'pickFiles':
                // File picker for Excel, DOCX, TXT, MD files
                const fileUris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: true,
                    filters: {
                        'Test Documents': ['xlsx', 'xls', 'docx', 'doc', 'txt', 'md'],
                        'Excel Files': ['xlsx', 'xls'],
                        'Word Documents': ['docx', 'doc'],
                        'Text Files': ['txt', 'md']
                    },
                    title: 'Select files with test steps or locators'
                });

                if (fileUris && fileUris.length > 0) {
                    const files: { name: string; content: string; type: string }[] = [];

                    for (const fileUri of fileUris) {
                        const fileName = fileUri.fsPath.split('/').pop() || '';
                        const ext = fileName.split('.').pop()?.toLowerCase() || '';

                        try {
                            let content = '';

                            if (ext === 'txt' || ext === 'md') {
                                // Read text files directly
                                const bytes = await vscode.workspace.fs.readFile(fileUri);
                                content = Buffer.from(bytes).toString('utf-8');
                            } else if (ext === 'xlsx' || ext === 'xls') {
                                // For Excel, we'll read as base64 and note to user
                                const bytes = await vscode.workspace.fs.readFile(fileUri);
                                content = `[Excel File: ${fileName}]\n` +
                                    `Note: Excel file attached. The content will be processed.\n` +
                                    `Base64 preview (first 500 chars): ${Buffer.from(bytes).toString('base64').slice(0, 500)}...`;
                            } else if (ext === 'docx' || ext === 'doc') {
                                // For Word docs, basic handling
                                const bytes = await vscode.workspace.fs.readFile(fileUri);
                                content = `[Word Document: ${fileName}]\n` +
                                    `Note: Word document attached. The content will be processed.\n` +
                                    `Size: ${bytes.length} bytes`;
                            }

                            files.push({ name: fileName, content, type: ext });
                        } catch (error) {
                            vscode.window.showWarningMessage(`Could not read file: ${fileName}`);
                        }
                    }

                    if (files.length > 0) {
                        panel.webview.postMessage({
                            type: 'filesReceived',
                            fieldId: message.fieldId,
                            files
                        });
                    }
                }
                break;

            case 'getAvailableModels':
                // Fetch all available language models from VS Code
                try {
                    const allModels = await vscode.lm.selectChatModels({});
                    const modelList = allModels.map(m => ({
                        id: m.id,
                        name: m.name,
                        vendor: m.vendor,
                        family: m.family
                    }));
                    panel.webview.postMessage({
                        type: 'modelsReceived',
                        fieldId: message.fieldId,
                        models: modelList
                    });
                } catch (error) {
                    vscode.window.showWarningMessage('Could not fetch available models');
                }
                break;

            case 'extractAndCreateProject':
                // Extract files from LLM response and create project
                try {
                    const rawContent = message.rawContent as string;
                    const language = message.language || 'typescript';
                    const extractedFiles: { name: string; content: string }[] = [];

                    // File extension map
                    const extMap: Record<string, string> = {
                        typescript: 'ts',
                        javascript: 'js',
                        python: 'py'
                    };
                    const ext = extMap[language] || 'ts';

                    // Extract all code blocks with their language markers
                    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
                    let match;
                    const foundBlocks: { lang: string; code: string }[] = [];

                    while ((match = codeBlockRegex.exec(rawContent)) !== null) {
                        const lang = (match[1] || '').toLowerCase();
                        const code = match[2].trim();
                        if (code.length > 20) {
                            foundBlocks.push({ lang, code });
                        }
                    }

                    // Categorize blocks
                    for (const block of foundBlocks) {
                        if (block.lang === 'json' && block.code.includes('"name"') && block.code.includes('"devDependencies"')) {
                            extractedFiles.push({ name: 'package.json', content: block.code });
                        } else if ((block.lang === 'typescript' || block.lang === 'ts' || block.lang === 'javascript' || block.lang === 'js')
                            && block.code.includes('defineConfig')) {
                            extractedFiles.push({ name: `playwright.config.${ext}`, content: block.code });
                        } else if ((block.lang === 'typescript' || block.lang === 'ts' || block.lang === 'javascript' || block.lang === 'js' || block.lang === 'python' || block.lang === 'py')
                            && (block.code.includes('test(') || block.code.includes('def test_'))) {
                            const testFileName = language === 'python'
                                ? 'tests/test_spec.py'
                                : `tests/test.spec.${ext}`;
                            extractedFiles.push({ name: testFileName, content: block.code });
                        }
                    }

                    // If we found files, create the project
                    if (extractedFiles.length > 0) {
                        const targetPath = message.targetFolder;
                        const testName = message.testName || 'playwright-test';
                        const safeName = testName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

                        // Create project folder
                        const projectFolderUri = vscode.Uri.file(`${targetPath}/${safeName}`);
                        await vscode.workspace.fs.createDirectory(projectFolderUri);

                        // Write each file
                        for (const file of extractedFiles) {
                            const fileUri = vscode.Uri.joinPath(projectFolderUri, file.name);
                            // Create subdirectories if needed
                            const dirPath = file.name.split('/').slice(0, -1).join('/');
                            if (dirPath) {
                                await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(projectFolderUri, dirPath));
                            }
                            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf-8'));
                        }

                        vscode.window.showInformationMessage(
                            `✅ Created ${extractedFiles.length} files in: ${safeName}`,
                            'Open Folder',
                            'Run npm install'
                        ).then(selection => {
                            if (selection === 'Open Folder') {
                                vscode.commands.executeCommand('vscode.openFolder', projectFolderUri);
                            } else if (selection === 'Run npm install') {
                                const term = vscode.window.createTerminal({ name: '🎭 Playwright Setup', cwd: projectFolderUri.fsPath });
                                term.show();
                                term.sendText('npm install && npx playwright install');
                            }
                        });

                        panel.webview.postMessage({
                            type: 'projectCreated',
                            path: projectFolderUri.fsPath,
                            files: extractedFiles.map(f => f.name)
                        });
                    } else {
                        // No files found - notify user
                        panel.webview.postMessage({
                            type: 'projectError',
                            error: 'Could not extract files from the AI response. Please try again or check the output format.'
                        });
                    }
                } catch (error) {
                    panel.webview.postMessage({
                        type: 'projectError',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                break;

            case 'createPlaywrightProject':
                // Create project folder with all files
                try {
                    const targetPath = message.targetFolder;
                    const testName = message.testName || 'playwright-test';
                    const safeName = testName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

                    // Create project folder
                    const projectFolderUri = vscode.Uri.file(`${targetPath}/${safeName}`);
                    await vscode.workspace.fs.createDirectory(projectFolderUri);

                    // Write each file
                    const filesList = message.files as { name: string; content: string }[];
                    for (const file of filesList) {
                        const fileUri = vscode.Uri.joinPath(projectFolderUri, file.name);
                        // Create subdirectories if needed
                        const dirPath = file.name.split('/').slice(0, -1).join('/');
                        if (dirPath) {
                            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(projectFolderUri, dirPath));
                        }
                        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf-8'));
                    }

                    vscode.window.showInformationMessage(
                        `✅ Created project: ${safeName}`,
                        'Open Folder',
                        'Run npm install'
                    ).then(selection => {
                        if (selection === 'Open Folder') {
                            vscode.commands.executeCommand('vscode.openFolder', projectFolderUri);
                        } else if (selection === 'Run npm install') {
                            const term = vscode.window.createTerminal({ name: '🎭 Playwright Setup', cwd: projectFolderUri.fsPath });
                            term.show();
                            term.sendText('npm install && npx playwright install');
                        }
                    });

                    panel.webview.postMessage({
                        type: 'projectCreated',
                        path: projectFolderUri.fsPath
                    });
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
                    panel.webview.postMessage({
                        type: 'projectError',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
                break;

            case 'goBack':
                panel.dispose();
                AppsPanel.openAppsHub();
                break;
        }
    }

    /**
     * Get user preferences
     */
    private static getPreferences(): AppsHubPreferences {
        return AppsPanel.context.globalState.get<AppsHubPreferences>('appsHub.preferences', {
            favoriteApps: [],
            recentApps: [],
            savedProjects: [],
            appSettings: {}
        });
    }

    /**
     * Toggle favorite
     */
    private static async toggleFavorite(appId: string): Promise<void> {
        const prefs = AppsPanel.getPreferences();
        const index = prefs.favoriteApps.indexOf(appId);
        if (index >= 0) {
            prefs.favoriteApps.splice(index, 1);
        } else {
            prefs.favoriteApps.push(appId);
        }
        await AppsPanel.context.globalState.update('appsHub.preferences', prefs);
    }

    /**
     * Add to recent apps
     */
    private static async addRecentApp(appId: string): Promise<void> {
        const prefs = AppsPanel.getPreferences();
        const index = prefs.recentApps.indexOf(appId);
        if (index >= 0) {
            prefs.recentApps.splice(index, 1);
        }
        prefs.recentApps.unshift(appId);
        prefs.recentApps = prefs.recentApps.slice(0, 5);
        await AppsPanel.context.globalState.update('appsHub.preferences', prefs);
    }

    /**
     * Generate Apps Hub HTML
     */
    private static getHubHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const prefs = AppsPanel.getPreferences();
        const grouped = getAppsGroupedByCategory();

        const favoriteApps = prefs.favoriteApps
            .map(id => getAppById(id))
            .filter(Boolean) as AppDefinition[];

        const recentApps = prefs.recentApps
            .map(id => getAppById(id))
            .filter(Boolean) as AppDefinition[];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot Apps</title>
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 32px;
        }
        .header {
            text-align: center;
            margin-bottom: 48px;
        }
        .header h1 {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #38bdf8, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .header p {
            font-size: 16px;
            opacity: 0.7;
        }
        .search-container {
            max-width: 500px;
            margin: 32px auto;
        }
        .search-box {
            width: 100%;
            padding: 14px 20px;
            border-radius: 12px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 15px;
            transition: all 0.2s ease;
        }
        .search-box:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent);
        }
        .section {
            margin-bottom: 40px;
        }
        .section-title {
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.6;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .apps-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px;
        }
        .app-card {
            position: relative;
            padding: 24px;
            border-radius: 16px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .app-card:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        .app-icon {
            font-size: 40px;
            margin-bottom: 16px;
        }
        .app-name {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .app-desc {
            font-size: 13px;
            opacity: 0.7;
            line-height: 1.5;
        }
        .app-category {
            display: inline-block;
            margin-top: 12px;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
            background: color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
            color: var(--vscode-foreground);
        }
        .favorite-btn {
            position: absolute;
            top: 16px;
            right: 16px;
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            opacity: 0.3;
            transition: all 0.15s ease;
        }
        .favorite-btn:hover { opacity: 0.8; transform: scale(1.1); }
        .favorite-btn.active { opacity: 1; }
        .category-section {
            margin-top: 32px;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📦 Copilot Apps Hub</h1>
            <p>AI-powered tools for developers, QA, and leadership</p>
        </div>

        <div class="search-container">
            <input type="text" class="search-box" placeholder="🔍 Search apps..." id="search-input">
        </div>

        ${favoriteApps.length > 0 ? `
        <div class="section" id="favorites-section">
            <div class="section-title">⭐ Favorites</div>
            <div class="apps-grid">
                ${favoriteApps.map(app => AppsPanel.renderAppCard(app, true)).join('')}
            </div>
        </div>
        ` : ''}

        ${recentApps.length > 0 ? `
        <div class="section" id="recent-section">
            <div class="section-title">🕐 Recently Used</div>
            <div class="apps-grid">
                ${recentApps.slice(0, 4).map(app => AppsPanel.renderAppCard(app, prefs.favoriteApps.includes(app.id))).join('')}
            </div>
        </div>
        ` : ''}

        <div class="section" id="all-apps-section">
            <div class="section-title">📦 All Apps</div>
            ${Object.entries(grouped).filter(([_, apps]) => apps.length > 0).map(([category, apps]) => `
                <div class="category-section">
                    <div class="section-title" style="font-size: 12px; margin-bottom: 16px;">
                        ${categoryMetadata[category as keyof typeof categoryMetadata]?.icon || '📁'} 
                        ${categoryMetadata[category as keyof typeof categoryMetadata]?.label || category}
                    </div>
                    <div class="apps-grid">
                        ${apps.map(app => AppsPanel.renderAppCard(app, prefs.favoriteApps.includes(app.id))).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // App click handlers
        document.querySelectorAll('.app-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.favorite-btn')) return;
                vscode.postMessage({ type: 'openApp', appId: card.dataset.appId });
            });
        });
        
        // Favorite handlers
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({ type: 'toggleFavorite', appId: btn.dataset.appId });
            });
        });
        
        // Search
        document.getElementById('search-input').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.app-card').forEach(card => {
                const name = card.querySelector('.app-name').textContent.toLowerCase();
                const desc = card.querySelector('.app-desc').textContent.toLowerCase();
                card.style.display = (name.includes(query) || desc.includes(query)) ? 'block' : 'none';
            });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Render an app card for the hub
     */
    private static renderAppCard(app: AppDefinition, isFavorite: boolean): string {
        return `
            <div class="app-card" data-app-id="${app.id}">
                <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-app-id="${app.id}">
                    ${isFavorite ? '⭐' : '☆'}
                </button>
                <div class="app-icon">${app.icon}</div>
                <div class="app-name">${app.name}</div>
                <div class="app-desc">${app.description}</div>
                <div class="app-category">${categoryMetadata[app.category]?.label || app.category}</div>
            </div>
        `;
    }

    /**
     * Generate individual app HTML
     */
    private static getAppHtml(webview: vscode.Webview, app: AppDefinition, savedProjects: SavedProject[]): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${app.icon} ${app.name}</title>
    <style>
        :root { color-scheme: var(--vscode-color-scheme); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 32px;
        }
        .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
            margin-bottom: 24px;
            transition: all 0.15s ease;
        }
        .back-btn:hover {
            background: var(--vscode-button-secondaryBackground);
            border-color: var(--vscode-focusBorder);
        }
        .header {
            display: flex;
            align-items: center;
            gap: 20px;
            margin-bottom: 32px;
        }
        .header-icon {
            font-size: 56px;
            width: 80px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 20px;
            background: linear-gradient(135deg, rgba(56,189,248,0.15), rgba(167,139,250,0.1));
            border: 1px solid var(--vscode-widget-border);
        }
        .header-text h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .header-text p {
            font-size: 15px;
            opacity: 0.7;
        }
        .form-section {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 16px;
            padding: 28px;
            margin-bottom: 24px;
        }
        .form-group {
            margin-bottom: 24px;
        }
        .form-group:last-child { margin-bottom: 0; }
        .form-label {
            display: block;
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .form-hint {
            font-size: 12px;
            opacity: 0.6;
            margin-top: 6px;
        }
        input[type="text"], textarea, select {
            width: 100%;
            padding: 12px 14px;
            border-radius: 10px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 14px;
            transition: all 0.15s ease;
        }
        input:focus, textarea:focus, select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
        }
        textarea {
            font-family: var(--vscode-editor-font-family);
            resize: vertical;
            min-height: 140px;
            line-height: 1.5;
        }
        .radio-group, .checkbox-group {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .radio-option, .checkbox-option {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 14px 16px;
            border-radius: 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .radio-option:hover, .checkbox-option:hover {
            border-color: var(--vscode-focusBorder);
        }
        .radio-option.selected, .checkbox-option.selected {
            border-color: var(--vscode-focusBorder);
            background: color-mix(in srgb, var(--vscode-focusBorder) 8%, var(--vscode-editor-background));
        }
        .radio-option input, .checkbox-option input {
            margin: 3px 0 0 0;
        }
        .option-content { flex: 1; }
        .option-label {
            font-weight: 500;
            font-size: 14px;
        }
        .option-desc {
            font-size: 12px;
            opacity: 0.7;
            margin-top: 3px;
        }
        .project-picker {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .project-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            border-radius: 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
        }
        .project-item .name { flex: 1; font-weight: 500; }
        .project-item .path {
            font-size: 11px;
            opacity: 0.6;
            font-family: var(--vscode-editor-font-family);
        }
        .project-item .remove-btn {
            background: none;
            border: none;
            cursor: pointer;
            opacity: 0.5;
            font-size: 16px;
        }
        .project-item .remove-btn:hover { opacity: 1; }
        .add-project-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px;
            border-radius: 10px;
            border: 2px dashed var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.15s ease;
        }
        .add-project-btn:hover {
            border-color: var(--vscode-focusBorder);
            background: color-mix(in srgb, var(--vscode-focusBorder) 5%, transparent);
        }
        .submit-btn {
            width: 100%;
            padding: 16px 28px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, var(--vscode-button-background), color-mix(in srgb, var(--vscode-button-background) 80%, black));
            color: var(--vscode-button-foreground);
            font-family: var(--vscode-font-family);
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        }
        .submit-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .spinner {
            width: 18px;
            height: 18px;
            border: 2px solid currentColor;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .result-section {
            margin-top: 32px;
        }
        .result-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        .result-header h3 {
            font-size: 18px;
        }
        .result-actions {
            display: flex;
            gap: 10px;
        }
        .action-btn {
            padding: 10px 16px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
        }
        .action-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            border-color: var(--vscode-focusBorder);
        }
        .result-content {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 12px;
            padding: 24px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 1.7;
            white-space: pre-wrap;
            overflow-x: auto;
            max-height: 600px;
            overflow-y: auto;
        }
        .result-content.error {
            background: color-mix(in srgb, var(--vscode-testing-iconFailed) 10%, var(--vscode-editor-background));
            border-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-testing-iconFailed);
        }
        .progress-msg {
            text-align: center;
            font-size: 14px;
            opacity: 0.7;
            padding: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }
        .hidden { display: none !important; }
        .conditional-field { display: none; }
        .conditional-field.visible { display: block; }
        .file-picker-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .file-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .file-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 8px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
        }
        .file-item .file-icon { font-size: 20px; }
        .file-item .file-info { flex: 1; }
        .file-item .file-name { font-weight: 500; font-size: 13px; }
        .file-item .file-size { font-size: 11px; opacity: 0.6; }
        .file-item .remove-file-btn {
            background: none;
            border: none;
            cursor: pointer;
            opacity: 0.5;
            font-size: 16px;
            padding: 4px;
        }
        .file-item .remove-file-btn:hover { opacity: 1; }
        .add-file-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px;
            border-radius: 10px;
            border: 2px dashed var(--vscode-widget-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.15s ease;
        }
        .add-file-btn:hover {
            border-color: var(--vscode-focusBorder);
            background: color-mix(in srgb, var(--vscode-focusBorder) 5%, transparent);
        }
        .model-picker-container {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .model-select {
            flex: 1;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 13px;
        }
        .refresh-models-btn {
            padding: 10px 14px;
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-models-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <button class="back-btn" id="back-btn">← Back to Apps</button>
        
        <div class="header">
            <div class="header-icon">${app.icon}</div>
            <div class="header-text">
                <h1>${app.name}</h1>
                <p>${app.description}</p>
            </div>
        </div>

        <form id="app-form">
            <div class="form-section">
                ${app.inputs.map(input => AppsPanel.renderInputField(input, savedProjects)).join('')}
            </div>

            <button type="submit" class="submit-btn" id="submit-btn">
                ${app.primaryAction}
            </button>
        </form>

        <div class="result-section hidden" id="result-section">
            <div class="result-header">
                <h3>📋 Result</h3>
                <div class="result-actions">
                    <button class="action-btn" id="copy-btn">📋 Copy</button>
                    <button class="action-btn" id="insert-btn">📝 Insert</button>
                    <button class="action-btn" id="save-btn">💾 Save</button>
                </div>
            </div>
            <div class="progress-msg hidden" id="progress-msg">
                <div class="spinner"></div>
                <span id="progress-text">Processing...</span>
            </div>
            <div class="result-content hidden" id="result-content"></div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const appId = '${app.id}';
        let currentResult = '';
        let selectedProjects = ${JSON.stringify(savedProjects.map(p => p.path))};

        // Back button
        document.getElementById('back-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'goBack' });
        });

        // Form submission
        document.getElementById('app-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const inputs = {};
            
            for (const [key, value] of formData.entries()) {
                inputs[key] = value;
            }
            
            // Handle multi-select
            document.querySelectorAll('.checkbox-group').forEach(group => {
                const name = group.dataset.name;
                const checked = Array.from(group.querySelectorAll('input:checked')).map(cb => cb.value);
                inputs[name] = checked.join(',');
            });
            
            // Handle project picker
            if (selectedProjects.length > 0) {
                inputs['projectPaths'] = JSON.stringify(selectedProjects);
            }
            
            // Show loading
            const btn = document.getElementById('submit-btn');
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner"></div> Processing...';
            
            document.getElementById('result-section').classList.remove('hidden');
            document.getElementById('progress-msg').classList.remove('hidden');
            document.getElementById('result-content').classList.add('hidden');
            
            vscode.postMessage({ type: 'executeApp', inputs });
        });

        // Handle messages
        window.addEventListener('message', (event) => {
            const message = event.data;
            
            switch (message.type) {
                case 'progress':
                    document.getElementById('progress-text').textContent = message.message;
                    break;
                    
                case 'result':
                    const submitBtn = document.getElementById('submit-btn');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '${app.primaryAction}';
                    
                    document.getElementById('progress-msg').classList.add('hidden');
                    const content = document.getElementById('result-content');
                    content.classList.remove('hidden', 'error');
                    
                    if (message.result.success) {
                        currentResult = message.result.output.content;
                        
                        // Check if this is Playwright app - auto-create project
                        const isPlaywrightApp = '${app.id}' === 'playwright-generator';
                        const targetFolder = selectedProjects[0];
                        
                        if (isPlaywrightApp && targetFolder) {
                            content.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div><p>Creating project files...</p></div>';
                            
                            const testName = document.querySelector('input[name="testName"]')?.value || 'playwright-test';
                            vscode.postMessage({
                                type: 'extractAndCreateProject',
                                targetFolder: targetFolder,
                                testName: testName,
                                rawContent: currentResult,
                                language: document.querySelector('input[name="language"]:checked')?.value || 'typescript'
                            });
                        } else if (isPlaywrightApp && !targetFolder) {
                            content.innerHTML = '<div style="color:orange;padding:20px;text-align:center;">⚠️ Please select a target folder first!</div>';
                        } else {
                            content.textContent = currentResult;
                        }
                    } else {
                        content.classList.add('error');
                        content.textContent = 'Error: ' + message.result.error;
                    }
                    break;
                    
                case 'projectAdded':
                    if (!selectedProjects.includes(message.project.path)) {
                        selectedProjects.push(message.project.path);
                        updateProjectList();
                    }
                    break;
                    
                case 'filesReceived':
const fieldId = message.fieldId;
if (!attachedFiles[fieldId]) {
    attachedFiles[fieldId] = [];
}
message.files.forEach(f => {
    if (!attachedFiles[fieldId].some(existing => existing.name === f.name)) {
        attachedFiles[fieldId].push(f);
    }
});
updateFileList(fieldId);
break;
                    
                case 'modelsReceived':
const modelFieldId = message.fieldId;
const select = document.getElementById('model-select-' + modelFieldId);
if (select) {
    // Keep auto option, add models
    select.innerHTML = '<option value="auto">🤖 Auto (Best Available)</option>' +
        message.models.map(m =>
            \`<option value="\${m.id}">\${m.vendor} - \${m.name}</option>\`
                            ).join('');
                    }
                    break;
                    
                case 'projectCreated':
                    document.getElementById('result-section').classList.remove('hidden');
                    document.getElementById('progress-msg').classList.add('hidden');
                    document.getElementById('submit-btn').disabled = false;
                    const createdContent = document.getElementById('result-content');
                    createdContent.classList.remove('hidden', 'error');
                    createdContent.innerHTML = \`
                        <div style="text-align: center; padding: 20px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                            <h3 style="margin-bottom: 8px;">Project Created Successfully!</h3>
                            <p style="opacity: 0.7; margin-bottom: 16px;">Location: \${message.path}</p>
                            <p style="font-size: 13px; margin-bottom: 16px;">Files: \${message.files ? message.files.join(', ') : 'package.json, config, test'}</p>
                        </div>
                        <div style="text-align: left; background: var(--vscode-terminal-background, #1e1e1e); border-radius: 8px; padding: 16px; margin-top: 16px;">
                            <p style="font-weight: 600; margin-bottom: 12px; color: var(--vscode-terminal-foreground, #ccc);">📦 Install & Run Commands:</p>
                            <pre style="background: var(--vscode-editor-background); padding: 12px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 13px; line-height: 1.6;"><code># Navigate to project folder
cd "\${message.path}"

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Run the tests
npx playwright test

# View HTML report
npx playwright show-report</code></pre>
                        </div>
                    \`;
                    break;
                    
                case 'projectError':
                    document.getElementById('result-section').classList.remove('hidden');
                    document.getElementById('progress-msg').classList.add('hidden');
                    document.getElementById('submit-btn').disabled = false;
                    const errorContent = document.getElementById('result-content');
                    errorContent.classList.remove('hidden');
                    errorContent.classList.add('error');
                    errorContent.textContent = 'Error creating project: ' + message.error;
                    break;
            }
        });

        // Action buttons
        document.getElementById('copy-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'copyToClipboard', value: currentResult });
        });

        document.getElementById('insert-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'insertAtCursor', value: currentResult });
        });

        document.getElementById('save-btn').addEventListener('click', () => {
            vscode.postMessage({ 
                type: 'saveAsFile', 
                content: currentResult, 
                filename: '${app.id}-output.md'
            });
        });

        // Project management
        document.querySelectorAll('.add-project-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'pickProjectFolder' });
            });
        });

        function removeProject(path) {
            selectedProjects = selectedProjects.filter(p => p !== path);
            updateProjectList();
        }
        window.removeProject = removeProject;

        function updateProjectList() {
            const container = document.querySelector('.project-picker');
            if (!container) return;
            
            const items = selectedProjects.map(path => {
                const name = path.split('/').pop();
                return \`
                    <div class="project-item">
                        <span>📁</span>
                        <div class="name">\${name}</div>
                        <div class="path">\${path}</div>
                        <button type="button" class="remove-btn" onclick="removeProject('\${path}')">✕</button>
                    </div>
                \`;
            }).join('');
            
            container.innerHTML = items + '<button type="button" class="add-project-btn">+ Add Project Folder</button>';
            container.querySelector('.add-project-btn').addEventListener('click', () => {
                vscode.postMessage({ type: 'pickProjectFolder' });
            });
        }

        // File picker handling
        const attachedFiles = {};
        
        document.querySelectorAll('.add-file-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fieldId = btn.dataset.fieldId;
                vscode.postMessage({ type: 'pickFiles', fieldId });
            });
        });

        function removeFile(fieldId, fileName) {
            if (attachedFiles[fieldId]) {
                attachedFiles[fieldId] = attachedFiles[fieldId].filter(f => f.name !== fileName);
                updateFileList(fieldId);
            }
        }
        window.removeFile = removeFile;

        function updateFileList(fieldId) {
            const container = document.getElementById('file-list-' + fieldId);
            const hiddenInput = document.getElementById('files-data-' + fieldId);
            if (!container) return;
            
            const files = attachedFiles[fieldId] || [];
            const fileIcons = { xlsx: '📊', docx: '📄', txt: '📝', md: '📑' };
            
            container.innerHTML = files.map(file => {
                const ext = file.name.split('.').pop().toLowerCase();
                const icon = fileIcons[ext] || '📎';
                return \`
                    <div class="file-item">
                        <span class="file-icon">\${icon}</span>
                        <div class="file-info">
                            <div class="file-name">\${file.name}</div>
                            <div class="file-size">\${file.content.length > 1000 ? (file.content.length / 1024).toFixed(1) + ' KB' : file.content.length + ' bytes'}</div>
                        </div>
                        <button type="button" class="remove-file-btn" onclick="removeFile('\${fieldId}', '\${file.name}')">✕</button>
                    </div>
                \`;
            }).join('');
            
            // Update hidden input with file contents
            hiddenInput.value = JSON.stringify(files);
        }

        // Model picker handling
        document.querySelectorAll('.refresh-models-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fieldId = btn.dataset.fieldId;
                vscode.postMessage({ type: 'getAvailableModels', fieldId });
            });
        });
        
        // Auto-fetch models on load for all model pickers
        document.querySelectorAll('.model-select').forEach(select => {
            const fieldId = select.id.replace('model-select-', '');
            vscode.postMessage({ type: 'getAvailableModels', fieldId });
        });

        // Radio/checkbox handling
        document.querySelectorAll('.radio-option').forEach(option => {
            option.addEventListener('click', () => {
                const group = option.closest('.radio-group');
                group.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                option.querySelector('input').checked = true;
                handleConditionalFields(option.querySelector('input').name, option.querySelector('input').value);
            });
        });

        document.querySelectorAll('.checkbox-option').forEach(option => {
            option.addEventListener('click', () => {
                option.classList.toggle('selected');
                const cb = option.querySelector('input');
                cb.checked = !cb.checked;
            });
        });

        function handleConditionalFields(fieldName, value) {
            document.querySelectorAll('.conditional-field').forEach(field => {
                const showIf = field.dataset.showIf;
                if (showIf) {
                    const [condField, condValue] = showIf.split('=');
                    if (condField === fieldName) {
                        field.classList.toggle('visible', condValue.includes(',') 
                            ? condValue.split(',').includes(value) 
                            : condValue === value);
                    }
                }
            });
        }

        // Initialize conditional fields
        document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
            handleConditionalFields(radio.name, radio.value);
        });
    </script>
</body>
</html>`;
    }

    /**
     * Render a form input field
     */
    private static renderInputField(input: any, savedProjects: SavedProject[]): string {
        const showIfAttr = input.showIf
            ? `data-show-if="${input.showIf.field}=${Array.isArray(input.showIf.equals) ? input.showIf.equals.join(',') : input.showIf.equals}"`
            : '';
        const conditionalClass = input.showIf ? 'conditional-field' : '';

        switch (input.type) {
            case 'textarea':
            case 'code':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <textarea 
                            name="${input.id}" 
                            placeholder="${input.placeholder || ''}"
                            rows="${input.rows || 5}"
                            ${input.required ? 'required' : ''}
                        >${input.defaultValue || ''}</textarea>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'select':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <select name="${input.id}" ${input.required ? 'required' : ''}>
                            ${(input.options || []).map((opt: any) => `
                                <option value="${opt.value}" ${input.defaultValue === opt.value ? 'selected' : ''}>
                                    ${opt.label}
                                </option>
                            `).join('')}
                        </select>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'radio':
                const defaultRadio = input.defaultValue || (input.options?.[0]?.value);
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <div class="radio-group">
                            ${(input.options || []).map((opt: any) => `
                                <label class="radio-option ${defaultRadio === opt.value ? 'selected' : ''}">
                                    <input type="radio" name="${input.id}" value="${opt.value}" 
                                           ${defaultRadio === opt.value ? 'checked' : ''}>
                                    <div class="option-content">
                                        <div class="option-label">${opt.icon || ''} ${opt.label}</div>
                                        ${opt.description ? `<div class="option-desc">${opt.description}</div>` : ''}
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'multi-select':
                const defaults = (input.defaultValue || '').split(',');
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}</label>
                        <div class="checkbox-group" data-name="${input.id}">
                            ${(input.options || []).map((opt: any) => `
                                <label class="checkbox-option ${defaults.includes(opt.value) ? 'selected' : ''}">
                                    <input type="checkbox" name="${input.id}" value="${opt.value}" 
                                           ${defaults.includes(opt.value) ? 'checked' : ''}>
                                    <div class="option-content">
                                        <div class="option-label">${opt.label}</div>
                                        ${opt.description ? `<div class="option-desc">${opt.description}</div>` : ''}
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'project-picker':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <div class="project-picker">
                            ${savedProjects.map(proj => `
                                <div class="project-item">
                                    <span>📁</span>
                                    <div class="name">${proj.name}</div>
                                    <div class="path">${proj.path}</div>
                                    <button type="button" class="remove-btn" onclick="removeProject('${proj.path}')">✕</button>
                                </div>
                            `).join('')}
                            <button type="button" class="add-project-btn">+ Add Project Folder</button>
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'file-picker':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <div class="file-picker-container" data-field-id="${input.id}">
                            <div class="file-list" id="file-list-${input.id}"></div>
                            <button type="button" class="add-file-btn" data-field-id="${input.id}">
                                📎 Attach Files (.xlsx, .docx, .txt, .md)
                            </button>
                            <input type="hidden" name="${input.id}" id="files-data-${input.id}" value="">
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'model-picker':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}</label>
                        <div class="model-picker-container">
                            <select name="${input.id}" id="model-select-${input.id}" class="model-select">
                                <option value="auto">🤖 Auto (Best Available)</option>
                            </select>
                            <button type="button" class="refresh-models-btn" data-field-id="${input.id}">🔄</button>
                        </div>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            case 'checkbox':
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="checkbox-option ${input.defaultValue === 'true' ? 'selected' : ''}" style="display: inline-flex;">
                            <input type="checkbox" name="${input.id}" value="true" 
                                   ${input.defaultValue === 'true' ? 'checked' : ''}>
                            <div class="option-content">
                                <div class="option-label">${input.label}</div>
                            </div>
                        </label>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;

            default: // text
                return `
                    <div class="form-group ${conditionalClass}" ${showIfAttr}>
                        <label class="form-label">${input.label}${input.required ? ' *' : ''}</label>
                        <input type="text" 
                               name="${input.id}" 
                               placeholder="${input.placeholder || ''}"
                               value="${input.defaultValue || ''}"
                               ${input.required ? 'required' : ''}>
                        ${input.hint ? `<div class="form-hint">${input.hint}</div>` : ''}
                    </div>
                `;
        }
    }
}

/**
 * Generate a nonce for CSP
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
