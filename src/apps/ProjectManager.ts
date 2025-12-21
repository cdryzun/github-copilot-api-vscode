/**
 * Project Manager - Manage projects for Code Review app
 * 
 * Handles saving, loading, and managing project paths that users
 * add for code review. Projects are persisted in VS Code settings.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SavedProject } from './types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Service for managing projects and git operations
 */
export class ProjectManager {
    private static instance: ProjectManager;
    private context: vscode.ExtensionContext | undefined;

    private constructor() { }

    /**
     * Get singleton instance
     */
    public static getInstance(): ProjectManager {
        if (!ProjectManager.instance) {
            ProjectManager.instance = new ProjectManager();
        }
        return ProjectManager.instance;
    }

    /**
     * Initialize with extension context
     */
    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    /**
     * Get all saved projects
     */
    public getSavedProjects(): SavedProject[] {
        if (!this.context) {
            return [];
        }
        return this.context.globalState.get<SavedProject[]>('apps.savedProjects', []);
    }

    /**
     * Add a project
     */
    public async addProject(projectPath: string): Promise<SavedProject | null> {
        if (!this.context) {
            return null;
        }

        // Validate the path exists and is a directory
        if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
            return null;
        }

        const projects = this.getSavedProjects();

        // Check if already exists
        const existing = projects.find(p => p.path === projectPath);
        if (existing) {
            // Update last used
            existing.lastUsed = Date.now();
            await this.context.globalState.update('apps.savedProjects', projects);
            return existing;
        }

        // Create new project entry
        const newProject: SavedProject = {
            id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            path: projectPath,
            name: path.basename(projectPath),
            lastUsed: Date.now(),
            favorite: false
        };

        projects.push(newProject);
        await this.context.globalState.update('apps.savedProjects', projects);

        return newProject;
    }

    /**
     * Remove a project
     */
    public async removeProject(projectId: string): Promise<void> {
        if (!this.context) {
            return;
        }

        const projects = this.getSavedProjects();
        const filtered = projects.filter(p => p.id !== projectId);
        await this.context.globalState.update('apps.savedProjects', filtered);
    }

    /**
     * Toggle project favorite status
     */
    public async toggleFavorite(projectId: string): Promise<void> {
        if (!this.context) {
            return;
        }

        const projects = this.getSavedProjects();
        const project = projects.find(p => p.id === projectId);
        if (project) {
            project.favorite = !project.favorite;
            await this.context.globalState.update('apps.savedProjects', projects);
        }
    }

    /**
     * Show folder picker dialog
     */
    public async pickProjectFolder(): Promise<string | undefined> {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select Project Folder',
            openLabel: 'Select Project'
        });

        if (uris && uris.length > 0) {
            return uris[0].fsPath;
        }
        return undefined;
    }

    /**
     * Check if a path is a git repository
     */
    public async isGitRepository(projectPath: string): Promise<boolean> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: projectPath });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get git diff for a project
     */
    public async getGitDiff(
        projectPath: string,
        options: {
            type: 'staged' | 'unstaged' | 'commits' | 'branches';
            commits?: number;
            baseBranch?: string;
            targetBranch?: string;
        }
    ): Promise<{ diff: string; error?: string }> {
        try {
            // Verify it's a git repo
            if (!await this.isGitRepository(projectPath)) {
                return { diff: '', error: 'Not a git repository' };
            }

            let command: string;

            switch (options.type) {
                case 'staged':
                    command = 'git diff --cached';
                    break;
                case 'unstaged':
                    command = 'git diff';
                    break;
                case 'commits':
                    const numCommits = options.commits || 5;
                    command = `git diff HEAD~${numCommits}..HEAD`;
                    break;
                case 'branches':
                    const base = options.baseBranch || 'main';
                    const target = options.targetBranch || 'HEAD';
                    command = `git diff ${base}...${target}`;
                    break;
                default:
                    command = 'git diff';
            }

            // Add options for better diff output
            command += ' --no-color';

            const { stdout, stderr } = await execAsync(command, {
                cwd: projectPath,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
            });

            if (stderr && !stdout) {
                return { diff: '', error: stderr };
            }

            return { diff: stdout };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { diff: '', error: message };
        }
    }

    /**
     * Get list of branches for a project
     */
    public async getBranches(projectPath: string): Promise<string[]> {
        try {
            const { stdout } = await execAsync('git branch -a --format="%(refname:short)"', {
                cwd: projectPath
            });
            return stdout.split('\n').filter(b => b.trim()).map(b => b.trim());
        } catch {
            return [];
        }
    }

    /**
     * Get current branch name
     */
    public async getCurrentBranch(projectPath: string): Promise<string | null> {
        try {
            const { stdout } = await execAsync('git branch --show-current', {
                cwd: projectPath
            });
            return stdout.trim() || null;
        } catch {
            return null;
        }
    }

    /**
     * Get recent commits for a project
     */
    public async getRecentCommits(
        projectPath: string,
        count: number = 10
    ): Promise<Array<{ hash: string; message: string; author: string; date: string }>> {
        try {
            const { stdout } = await execAsync(
                `git log -${count} --format="%H|%s|%an|%ad" --date=short`,
                { cwd: projectPath }
            );

            return stdout.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [hash, message, author, date] = line.split('|');
                    return { hash, message, author, date };
                });
        } catch {
            return [];
        }
    }

    /**
     * Get combined diff from multiple projects
     */
    public async getCombinedDiff(
        projects: { path: string; diffType: string; options?: any }[]
    ): Promise<{ projectPath: string; diff: string; error?: string }[]> {
        const results = await Promise.all(
            projects.map(async (proj) => {
                const result = await this.getGitDiff(proj.path, {
                    type: proj.diffType as any,
                    ...proj.options
                });
                return {
                    projectPath: proj.path,
                    ...result
                };
            })
        );

        return results;
    }
}

/**
 * Export singleton instance
 */
export const projectManager = ProjectManager.getInstance();
