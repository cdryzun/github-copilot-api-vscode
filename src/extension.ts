// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CopilotApiGateway, ensureCopilotChatReady, getErrorMessage, normalizePrompt } from './CopilotApiGateway';
import { CopilotPanel } from './CopilotPanel';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('GitHub Copilot API Server');
	context.subscriptions.push(output);

	const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusItem.command = 'github-copilot-api-vscode.showServerControls';
	context.subscriptions.push(statusItem);

	const gateway = new CopilotApiGateway(output, statusItem, context);
	context.subscriptions.push(gateway);

	const provider = new CopilotPanel(context.extensionUri, gateway);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CopilotPanel.viewType, provider)
	);

	// Status Bar & Notifications
	const updateStatusBar = async () => {
		const status = await gateway.getStatus();
		if (status.running) {
			if (status.activeRequests > 0) {
				statusItem.text = `$(sync~spin) Copilot API: ${status.activeRequests}`;
				statusItem.tooltip = `Processing ${status.activeRequests} active request(s)`;
				statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			} else {
				statusItem.text = '$(broadcast) Copilot API: ON';
				statusItem.tooltip = `Listening on ${status.config.host}:${status.config.port}`;
				statusItem.backgroundColor = undefined;
			}
			statusItem.show();
		} else {
			statusItem.text = '$(circle-slash) Copilot API: OFF';
			statusItem.tooltip = 'Copilot API server is stopped. Click to manage.';
			statusItem.show();
		}
	};

	let wasRunning = false;
	context.subscriptions.push(gateway.onDidChangeStatus(async () => {
		await updateStatusBar();

		// Notifications
		const status = await gateway.getStatus();
		if (status.running && !wasRunning) {
			const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
			if (config.get<boolean>('showNotifications', true)) {
				const selection = await vscode.window.showInformationMessage(
					`GitHub Copilot API Server started at http://${status.config.host}:${status.config.port}`,
					'Open Dashboard'
				);
				if (selection === 'Open Dashboard') {
					void vscode.commands.executeCommand('github-copilot-api-vscode.openDashboard');
				}
			}
		}
		wasRunning = status.running;
	}));

	// Initial State
	void updateStatusBar();

	// Auto-Start Logic
	const config = vscode.workspace.getConfiguration('githubCopilotApi.server');
	const enabled = config.get<boolean>('enabled', false);
	const autoStart = config.get<boolean>('autoStart', false);

	output.appendLine(`[DEBUG] Activation. Enabled: ${enabled}, AutoStart: ${autoStart}`);

	if (enabled || autoStart) {
		void gateway.start().catch(error => {
			output.appendLine(`[${new Date().toISOString()}] ERROR Failed to start API server: ${getErrorMessage(error)}`);
			void vscode.window.showErrorMessage(`Failed to start Copilot API server: ${getErrorMessage(error)}`);
		});
	}

	const openChatCommand = vscode.commands.registerCommand('github-copilot-api-vscode.openCopilotChat', async () => {
		if (!await ensureCopilotChatReady()) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.open');
	});

	const askChatCommand = vscode.commands.registerCommand('github-copilot-api-vscode.askCopilot', async (rawPrompt?: unknown) => {
		if (!await ensureCopilotChatReady()) {
			return;
		}

		const prompt = normalizePrompt(rawPrompt) ?? await vscode.window.showInputBox({
			title: 'Ask GitHub Copilot Chat',
			prompt: 'What do you want to ask Copilot?',
			ignoreFocusOut: true,
		});

		if (!prompt) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: prompt,
			isPartialQuery: false,
		});
	});

	const askSelectionCommand = vscode.commands.registerTextEditorCommand('github-copilot-api-vscode.askSelectionWithCopilot', async (editor, _edit, rawPrompt?: unknown) => {
		if (!await ensureCopilotChatReady()) {
			return;
		}

		const selection = editor.selection;
		if (selection.isEmpty) {
			void vscode.window.showWarningMessage('Select some code before asking Copilot about it.');
			return;
		}

		const prompt = normalizePrompt(rawPrompt) ?? await vscode.window.showInputBox({
			title: 'Ask Copilot About Selection',
			prompt: 'Describe what you want to know about the selected code.',
			value: 'Explain this code.',
			ignoreFocusOut: true,
		});

		if (!prompt) {
			return;
		}

		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: prompt,
			isPartialQuery: false,
			attachFiles: [{
				uri: editor.document.uri,
				range: new vscode.Range(selection.start, selection.end),
			}],
			blockOnResponse: false,
		});
	});


	const showServerControls = vscode.commands.registerCommand('github-copilot-api-vscode.showServerControls', async () => {
		await gateway.showControlPalette();
	});

	const openDashboard = vscode.commands.registerCommand('github-copilot-api-vscode.openDashboard', () => {
		CopilotPanel.createOrShow(context.extensionUri, gateway);
	});

	context.subscriptions.push(openChatCommand, askChatCommand, askSelectionCommand, showServerControls, openDashboard);
}

export function deactivate() {
	// no-op
}
