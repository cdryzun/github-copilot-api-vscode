/**
 * App Service - LLM Invocation for Apps
 * 
 * This service handles direct LLM invocation through VS Code's Language Model API,
 * independent of the API server. Apps can use AI features without starting the server.
 */

import * as vscode from 'vscode';
import { AppDefinition, AppContext, AppOutput, AppResult, OutputAction } from './types';

/**
 * Service for executing apps using VS Code's Language Model API
 */
export class AppService {
    private static instance: AppService;

    private constructor() { }

    /**
     * Get singleton instance
     */
    public static getInstance(): AppService {
        if (!AppService.instance) {
            AppService.instance = new AppService();
        }
        return AppService.instance;
    }

    /**
     * Check if Copilot is available and ready
     */
    public async checkCopilotAvailability(): Promise<{
        available: boolean;
        message?: string;
    }> {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            if (!models || models.length === 0) {
                return {
                    available: false,
                    message: 'GitHub Copilot is not available. Please ensure GitHub Copilot and Copilot Chat extensions are installed and you are signed in.'
                };
            }
            return { available: true };
        } catch (error) {
            return {
                available: false,
                message: `Failed to access Copilot: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Execute an app with the given inputs
     */
    public async executeApp(
        app: AppDefinition,
        inputs: Record<string, string>,
        onProgress?: (message: string) => void,
        cancellationToken?: vscode.CancellationToken
    ): Promise<AppResult> {
        const startTime = Date.now();

        try {
            // Check Copilot availability
            const availability = await this.checkCopilotAvailability();
            if (!availability.available) {
                return {
                    success: false,
                    error: availability.message,
                    durationMs: Date.now() - startTime
                };
            }

            // Fetch context if the app needs it
            let context: AppContext | undefined;
            if (app.fetchContext) {
                onProgress?.('Gathering context...');
                try {
                    context = await app.fetchContext(inputs);
                    if (context.errors && context.errors.length > 0) {
                        console.warn('[AppService] Context fetch warnings:', context.errors);
                    }
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to gather context: ${error instanceof Error ? error.message : String(error)}`,
                        durationMs: Date.now() - startTime
                    };
                }
            }

            // Build the user prompt
            onProgress?.('Building prompt...');
            const userPrompt = app.buildUserPrompt(inputs, context);

            // Invoke the LLM
            onProgress?.('Analyzing with AI...');
            const response = await this.invokeLLM(
                app.systemPrompt,
                userPrompt,
                cancellationToken
            );

            if (!response.success) {
                return {
                    success: false,
                    error: response.error,
                    durationMs: Date.now() - startTime,
                    tokens: response.tokens
                };
            }

            // Parse the response
            onProgress?.('Formatting output...');
            let output: AppOutput;

            if (app.parseResponse) {
                output = app.parseResponse(response.content!, inputs);
            } else {
                // Default: treat as markdown
                output = {
                    type: 'markdown',
                    content: response.content!,
                    actions: app.defaultActions || this.getDefaultActions()
                };
            }

            return {
                success: true,
                output,
                durationMs: Date.now() - startTime,
                tokens: response.tokens
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                durationMs: Date.now() - startTime
            };
        }
    }

    /**
     * Invoke the LLM with system and user prompts
     */
    private async invokeLLM(
        systemPrompt: string,
        userPrompt: string,
        cancellationToken?: vscode.CancellationToken
    ): Promise<{
        success: boolean;
        content?: string;
        error?: string;
        tokens?: { input: number; output: number };
    }> {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            if (!models || models.length === 0) {
                return {
                    success: false,
                    error: 'No Copilot language model available'
                };
            }

            const model = models[0];

            // Build messages
            const messages = [
                vscode.LanguageModelChatMessage.User(`[System Instructions]\n${systemPrompt}`),
                vscode.LanguageModelChatMessage.User(userPrompt)
            ];

            // Create cancellation token if not provided
            const cts = cancellationToken
                ? { token: cancellationToken, dispose: () => { } }
                : new vscode.CancellationTokenSource();

            // Set timeout (3 minutes)
            const timeoutId = setTimeout(() => {
                if ('cancel' in cts) {
                    (cts as vscode.CancellationTokenSource).cancel();
                }
            }, 180000);

            try {
                const response = await model.sendRequest(messages, {}, cts.token);

                // Collect the response
                let content = '';
                for await (const fragment of response.text) {
                    if (cts.token.isCancellationRequested) {
                        return {
                            success: false,
                            error: 'Request was cancelled'
                        };
                    }
                    content += fragment;
                }

                // Count tokens
                let inputTokens = 0;
                let outputTokens = 0;
                try {
                    inputTokens = await model.countTokens(systemPrompt + userPrompt);
                    outputTokens = await model.countTokens(content);
                } catch {
                    // Token counting failed, continue without it
                }

                return {
                    success: true,
                    content: content.trim(),
                    tokens: { input: inputTokens, output: outputTokens }
                };

            } finally {
                clearTimeout(timeoutId);
                if (!cancellationToken) {
                    (cts as vscode.CancellationTokenSource).dispose();
                }
            }

        } catch (error) {
            if (error instanceof vscode.CancellationError) {
                return {
                    success: false,
                    error: 'Request was cancelled'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get default output actions
     */
    private getDefaultActions(): OutputAction[] {
        return [
            {
                label: 'Copy',
                icon: '📋',
                action: 'copy'
            },
            {
                label: 'Insert at Cursor',
                icon: '📝',
                action: 'insert'
            },
            {
                label: 'Save as File',
                icon: '💾',
                action: 'newFile',
                fileExtension: '.md'
            }
        ];
    }

    /**
     * Stream app execution (for real-time output)
     */
    public async *executeAppStreaming(
        app: AppDefinition,
        inputs: Record<string, string>,
        cancellationToken?: vscode.CancellationToken
    ): AsyncGenerator<{ type: 'progress' | 'chunk' | 'done' | 'error'; data: string }> {
        const startTime = Date.now();

        try {
            // Check availability
            const availability = await this.checkCopilotAvailability();
            if (!availability.available) {
                yield { type: 'error', data: availability.message! };
                return;
            }

            // Fetch context
            let context: AppContext | undefined;
            if (app.fetchContext) {
                yield { type: 'progress', data: 'Gathering context...' };
                context = await app.fetchContext(inputs);
            }

            // Build prompt
            yield { type: 'progress', data: 'Building prompt...' };
            const userPrompt = app.buildUserPrompt(inputs, context);

            // Get model
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            if (!models || models.length === 0) {
                yield { type: 'error', data: 'No Copilot model available' };
                return;
            }

            const model = models[0];
            const messages = [
                vscode.LanguageModelChatMessage.User(`[System Instructions]\n${app.systemPrompt}`),
                vscode.LanguageModelChatMessage.User(userPrompt)
            ];

            yield { type: 'progress', data: 'Analyzing...' };

            const cts = cancellationToken
                ? { token: cancellationToken }
                : new vscode.CancellationTokenSource();

            const response = await model.sendRequest(messages, {}, cts.token);

            // Stream the response
            for await (const fragment of response.text) {
                if (cts.token.isCancellationRequested) {
                    yield { type: 'error', data: 'Cancelled' };
                    return;
                }
                yield { type: 'chunk', data: fragment };
            }

            yield { type: 'done', data: `Completed in ${Date.now() - startTime}ms` };

        } catch (error) {
            yield {
                type: 'error',
                data: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

/**
 * Export singleton instance
 */
export const appService = AppService.getInstance();
