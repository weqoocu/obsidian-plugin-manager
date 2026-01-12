"use strict";

const obsidian = require("obsidian");

// Plugin Manager Settings Tab
class PluginManagerSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.searchQuery = "";
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass("plugin-manager-settings");

        // Header
        containerEl.createEl("h2", { text: "Plugin Manager" });

        // Search bar
        const searchContainer = containerEl.createDiv({ cls: "plugin-manager-search-container" });
        
        new obsidian.Setting(searchContainer)
            .setName("Search plugins")
            .setDesc("Filter plugins by name or ID")
            .addText((text) => {
                text
                    .setPlaceholder("Search...")
                    .setValue(this.searchQuery)
                    .onChange((value) => {
                        this.searchQuery = value.toLowerCase();
                        this.renderPluginList(pluginListContainer);
                    });
                text.inputEl.addClass("plugin-manager-search-input");
            });

        // Refresh all button
        new obsidian.Setting(containerEl)
            .setName("Batch operations")
            .addButton((btn) => {
                btn
                    .setButtonText("Refresh All Enabled Plugins")
                    .setWarning()
                    .onClick(async () => {
                        await this.plugin.refreshAllPlugins();
                    });
            });

        containerEl.createEl("hr");

        // Plugin list container
        const pluginListContainer = containerEl.createDiv({ cls: "plugin-manager-list" });
        this.renderPluginList(pluginListContainer);
    }

    renderPluginList(container) {
        container.empty();

        const enabledPlugins = this.plugin.getEnabledPlugins();
        
        // Filter plugins based on search query
        const filteredPlugins = enabledPlugins.filter((manifest) => {
            if (!this.searchQuery) return true;
            const searchLower = this.searchQuery.toLowerCase();
            return (
                manifest.name.toLowerCase().includes(searchLower) ||
                manifest.id.toLowerCase().includes(searchLower) ||
                (manifest.description && manifest.description.toLowerCase().includes(searchLower))
            );
        });

        // Sort plugins alphabetically
        filteredPlugins.sort((a, b) => a.name.localeCompare(b.name));

        if (filteredPlugins.length === 0) {
            container.createEl("p", { 
                text: this.searchQuery ? "No plugins match your search." : "No enabled plugins found.",
                cls: "plugin-manager-empty"
            });
            return;
        }

        // Stats
        container.createEl("p", { 
            text: `Showing ${filteredPlugins.length} of ${enabledPlugins.length} enabled plugins`,
            cls: "plugin-manager-stats"
        });

        // Render each plugin
        for (const manifest of filteredPlugins) {
            this.renderPluginItem(container, manifest);
        }
    }

    renderPluginItem(container, manifest) {
        const setting = new obsidian.Setting(container)
            .setName(manifest.name)
            .setDesc(this.createPluginDescription(manifest));

        // Refresh button (reload plugin)
        setting.addButton((btn) => {
            btn
                .setIcon("refresh-cw")
                .setTooltip("Refresh plugin (disable then enable)")
                .onClick(async () => {
                    btn.setDisabled(true);
                    await this.plugin.refreshPlugin(manifest.id);
                    btn.setDisabled(false);
                    // Re-render list to show updated version
                    this.renderPluginList(container);
                    new obsidian.Notice(`Plugin "${manifest.name}" refreshed`);
                });
        });

        // Open folder button
        setting.addButton((btn) => {
            btn
                .setIcon("folder-open")
                .setTooltip("Open plugin folder")
                .onClick(async () => {
                    await this.plugin.openPluginFolder(manifest.id);
                });
        });

        // GitHub button (if authorUrl contains github)
        const githubUrl = this.getGitHubUrl(manifest);
        if (githubUrl) {
            setting.addButton((btn) => {
                btn
                    .setIcon("github")
                    .setTooltip("Open GitHub repository")
                    .onClick(() => {
                        window.open(githubUrl, "_blank");
                    });
            });
        }

        // Open settings button (if plugin has settings)
        if (this.pluginHasSettings(manifest.id)) {
            setting.addButton((btn) => {
                btn
                    .setIcon("settings")
                    .setTooltip("Open plugin settings")
                    .onClick(() => {
                        this.app.setting.open();
                        this.app.setting.openTabById(manifest.id);
                    });
            });
        }
    }

    createPluginDescription(manifest) {
        const frag = document.createDocumentFragment();
        
        // Version info
        const versionSpan = frag.createEl("span", { 
            text: `v${manifest.version}`,
            cls: "plugin-manager-version"
        });
        
        // ID info
        frag.createEl("span", { 
            text: ` • ${manifest.id}`,
            cls: "plugin-manager-id"
        });

        // Description
        if (manifest.description) {
            frag.createEl("br");
            frag.createEl("span", { 
                text: manifest.description,
                cls: "plugin-manager-description"
            });
        }

        return frag;
    }

    pluginHasSettings(pluginId) {
        const { setting } = this.app;
        return setting.pluginTabs.some((tab) => tab.id === pluginId);
    }

    // Get GitHub URL from manifest
    getGitHubUrl(manifest) {
        // Check authorUrl
        if (manifest.authorUrl && manifest.authorUrl.includes("github.com")) {
            return manifest.authorUrl;
        }
        // Check helpUrl
        if (manifest.helpUrl && manifest.helpUrl.includes("github.com")) {
            return manifest.helpUrl;
        }
        return null;
    }
}

// Main Plugin Class
class PluginManagerPlugin extends obsidian.Plugin {
    async onload() {
        console.log("Loading Plugin Manager");

        // Add settings tab
        this.addSettingTab(new PluginManagerSettingTab(this.app, this));

        // Add ribbon icon
        this.addRibbonIcon("puzzle", "Plugin Manager", () => {
            this.openSettings();
        });

        // Add command to open plugin manager
        this.addCommand({
            id: "open-plugin-manager",
            name: "Open Plugin Manager",
            callback: () => {
                this.openSettings();
            }
        });

        // Add command to refresh all plugins
        this.addCommand({
            id: "refresh-all-plugins",
            name: "Refresh all enabled plugins",
            callback: async () => {
                await this.refreshAllPlugins();
            }
        });
    }

    onunload() {
        console.log("Unloading Plugin Manager");
    }

    openSettings() {
        this.app.setting.open();
        this.app.setting.openTabById(this.manifest.id);
    }

    // Get all enabled plugins (including this plugin)
    getEnabledPlugins() {
        const { plugins } = this.app;
        const enabledPlugins = [];
        
        // Get enabled plugin IDs
        const enabledIds = new Set(Object.keys(plugins.plugins));
        
        // Use manifests (which contains latest version info from disk) instead of plugin.manifest
        for (const [id, manifest] of Object.entries(plugins.manifests)) {
            if (enabledIds.has(id)) {
                enabledPlugins.push(manifest);
            }
        }
        
        return enabledPlugins;
    }

    // Refresh a single plugin (disable then enable)
    async refreshPlugin(pluginId) {
        const { plugins } = this.app;
        
        try {
            // Disable plugin first
            await plugins.disablePlugin(pluginId);
            
            // Small delay to ensure clean disable
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Reload all manifests to get latest version info from disk
            await plugins.loadManifests();
            
            // Enable plugin
            await plugins.enablePlugin(pluginId);
            
            console.log(`Plugin "${pluginId}" refreshed successfully`);
        } catch (error) {
            console.error(`Failed to refresh plugin "${pluginId}":`, error);
            new obsidian.Notice(`Failed to refresh plugin "${pluginId}": ${error.message}`);
        }
    }

    // Refresh all enabled plugins
    async refreshAllPlugins() {
        const enabledPlugins = this.getEnabledPlugins();
        const total = enabledPlugins.length;
        let current = 0;
        
        new obsidian.Notice(`Refreshing ${total} plugins...`);
        
        for (const manifest of enabledPlugins) {
            current++;
            try {
                await this.refreshPlugin(manifest.id);
            } catch (error) {
                console.error(`Failed to refresh ${manifest.id}:`, error);
            }
        }
        
        new obsidian.Notice(`Refreshed ${current} plugins`);
    }

    // Open plugin folder in system file explorer
    async openPluginFolder(pluginId) {
        const { vault, plugins } = this.app;
        
        try {
            // Get actual folder name from plugin's dir property
            let folderName = pluginId;
            const plugin = plugins.plugins[pluginId];
            if (plugin && plugin.manifest && plugin.manifest.dir) {
                // manifest.dir contains the actual folder path like ".obsidian/plugins/folder-name"
                const dirParts = plugin.manifest.dir.split("/");
                folderName = dirParts[dirParts.length - 1];
            }
            
            const pluginFolder = `${vault.configDir}/plugins/${folderName}`;
            const basePath = vault.adapter.basePath;
            const fullPath = `${basePath}/${pluginFolder}`;
            
            // Use Electron shell to open folder
            const { shell } = require("electron").remote || require("@electron/remote") || require("electron");
            if (shell && shell.openPath) {
                await shell.openPath(fullPath);
            } else if (shell && shell.showItemInFolder) {
                shell.showItemInFolder(fullPath);
            } else {
                // Fallback: use Obsidian's method
                // @ts-ignore
                if (this.app.showInFolder) {
                    await this.app.showInFolder(fullPath);
                } else {
                    new obsidian.Notice("Unable to open folder on this platform");
                }
            }
        } catch (error) {
            console.error(`Failed to open plugin folder:`, error);
            new obsidian.Notice(`Failed to open folder: ${error.message}`);
        }
    }
}

module.exports = PluginManagerPlugin;
