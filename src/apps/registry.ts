/**
 * App Registry - Central registry for all apps
 * 
 * This module provides an easy way to register and discover apps.
 * Adding a new app is as simple as importing and adding it to the registry.
 */

import { AppDefinition, AppCategory } from './types';

// Import app implementations
import { codeReviewApp } from './implementations/codeReview';
import { testCaseGeneratorApp } from './implementations/testCaseGenerator';
import { bugReportWriterApp } from './implementations/bugReportWriter';
import { meetingNotesToActionsApp } from './implementations/meetingNotesToActions';
import { standupSummaryApp } from './implementations/standupSummary';
import { playwrightGeneratorApp } from './implementations/playwrightGenerator';

/**
 * All registered apps
 * 
 * To add a new app:
 * 1. Create the app definition in src/apps/implementations/
 * 2. Import it here
 * 3. Add it to this array
 */
export const appRegistry: AppDefinition[] = [
    codeReviewApp,
    testCaseGeneratorApp,
    bugReportWriterApp,
    meetingNotesToActionsApp,
    standupSummaryApp,
    playwrightGeneratorApp,
];

/**
 * Get an app by ID
 */
export function getAppById(id: string): AppDefinition | undefined {
    return appRegistry.find(app => app.id === id);
}

/**
 * Get all apps in a category
 */
export function getAppsByCategory(category: AppCategory): AppDefinition[] {
    return appRegistry.filter(app => app.category === category);
}

/**
 * Get apps grouped by category
 */
export function getAppsGroupedByCategory(): Record<AppCategory, AppDefinition[]> {
    const grouped: Record<AppCategory, AppDefinition[]> = {
        developer: [],
        qa: [],
        leadership: [],
        productivity: []
    };

    for (const app of appRegistry) {
        grouped[app.category].push(app);
    }

    return grouped;
}

/**
 * Search apps by name or description
 */
export function searchApps(query: string): AppDefinition[] {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
        return appRegistry;
    }

    return appRegistry.filter(app =>
        app.name.toLowerCase().includes(lowerQuery) ||
        app.description.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Get category metadata
 */
export const categoryMetadata: Record<AppCategory, { label: string; icon: string; description: string }> = {
    developer: {
        label: 'Developer',
        icon: '👨‍💻',
        description: 'Tools for software developers'
    },
    qa: {
        label: 'QA & Testing',
        icon: '🧪',
        description: 'Tools for quality assurance'
    },
    leadership: {
        label: 'Leadership',
        icon: '📊',
        description: 'Tools for tech leads and managers'
    },
    productivity: {
        label: 'Productivity',
        icon: '⚡',
        description: 'General productivity tools'
    }
};
