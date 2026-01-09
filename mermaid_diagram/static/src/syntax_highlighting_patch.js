/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { EmbeddedSyntaxHighlightingComponent } from "@html_editor/others/embedded_components/backend/syntax_highlighting/syntax_highlighting";
import { CodeToolbar } from "@html_editor/others/embedded_components/backend/syntax_highlighting/code_toolbar";

const MERMAID_CDN_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

/**
 * Extended languages list including Mermaid
 */
const MERMAID_LANGUAGES = {
    plaintext: "Plain Text",
    markdown: "Markdown",
    mermaid: "Mermaid",
    javascript: "Javascript",
    typescript: "Typescript",
    jsdoc: "JSDoc",
    java: "Java",
    python: "Python",
    html: "HTML",
    xml: "XML",
    svg: "SVG",
    json: "JSON",
    css: "CSS",
    sass: "SASS",
    scss: "SCSS",
    sql: "SQL",
    diff: "Diff",
};

let mermaidModule = null;
let mermaidLoadingPromise = null;

function getOdooTheme() {
    return document.documentElement.dataset.colorScheme ||
        document.cookie.split('; ').find(row => row.startsWith('color_scheme='))?.split('=')[1] ||
        'light';
}

function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

function getMermaidThemeConfig() {
    const isDark = getOdooTheme() === 'dark';
    const primary = cssVar('--o-brand-primary', isDark ? '#4a90a4' : '#714B67');
    const textColor = cssVar('--o-main-text-color', isDark ? '#e5e7eb' : '#374151');
    const bgColor = cssVar('--o-view-background-color', isDark ? '#374151' : '#fff');

    return {
        theme: 'base',
        themeVariables: isDark ? {
            primaryColor: primary,
            primaryTextColor: '#fff',
            primaryBorderColor: '#5a6d7a',
            lineColor: '#8b9aa5',
            secondaryColor: '#3d4f5f',
            tertiaryColor: '#2d3e4a',
            background: 'transparent',
            mainBkg: bgColor,
            secondBkg: '#2d3748',
            border1: '#4b5563',
            border2: '#6b7280',
            arrowheadColor: '#9ca3af',
            fontFamily: 'inherit',
            fontSize: '14px',
            textColor: textColor,
            nodeTextColor: '#f3f4f6',
        } : {
            primaryColor: primary,
            primaryTextColor: '#fff',
            primaryBorderColor: '#5a3d52',
            lineColor: '#6b7280',
            secondaryColor: '#f3e8ee',
            tertiaryColor: '#faf5f8',
            background: 'transparent',
            mainBkg: bgColor,
            secondBkg: '#f9fafb',
            border1: '#e5e7eb',
            border2: '#d1d5db',
            arrowheadColor: '#374151',
            fontFamily: 'inherit',
            fontSize: '14px',
            textColor: textColor,
            nodeTextColor: '#1f2937',
        }
    };
}

async function loadMermaid() {
    if (mermaidModule) return mermaidModule;
    if (mermaidLoadingPromise) return mermaidLoadingPromise;

    mermaidLoadingPromise = (async () => {
        try {
            const module = await import(/* @vite-ignore */ MERMAID_CDN_URL);
            mermaidModule = module.default;
            mermaidModule.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                suppressErrorRendering: true,
                ...getMermaidThemeConfig(),
            });
            return mermaidModule;
        } catch (e) {
            console.error("Failed to load Mermaid:", e);
            mermaidLoadingPromise = null;
            return null;
        }
    })();

    return mermaidLoadingPromise;
}

/**
 * Patch CodeToolbar to include Mermaid in languages list
 */
patch(CodeToolbar.prototype, {
    setup() {
        super.setup();
        // Override the languages with our extended list
        this.languages = MERMAID_LANGUAGES;
    },
});

/**
 * Patch the syntax highlighting component to handle Mermaid rendering
 */
patch(EmbeddedSyntaxHighlightingComponent.prototype, {
    /**
     * Override highlight to handle Mermaid rendering
     */
    highlight(focus) {
        // Get language from embedded state or props
        const languageId = this.embeddedState?.languageId || this.props?.languageId || "plaintext";

        if (languageId === "mermaid") {
            this._renderMermaidDiagram();
            return; // Don't call super for mermaid
        }

        // Clean up mermaid container if switching away
        if (this._mermaidContainer) {
            this._mermaidContainer.remove();
            this._mermaidContainer = null;
            if (this.pre) this.pre.style.display = "";
            if (this.textarea) this.textarea.style.display = "";
        }

        // Call original highlight for non-mermaid languages
        return super.highlight(focus);
    },

    /**
     * Render mermaid diagram
     */
    async _renderMermaidDiagram() {
        const mermaid = await loadMermaid();
        if (!mermaid) {
            if (this.pre) this.pre.textContent = "Failed to load Mermaid library";
            return;
        }

        const value = this.textarea?.value || this.embeddedState?.value || this.props?.value || "";
        const trimmedValue = value.trim();

        // Create container if needed
        if (!this._mermaidContainer) {
            this._mermaidContainer = document.createElement("div");
            this._mermaidContainer.className = "o_mermaid_container";
            this._mermaidContainer.style.cssText = "display: flex; justify-content: center; padding: 1rem; cursor: pointer;";

            if (this.pre?.parentNode) {
                this.pre.parentNode.insertBefore(this._mermaidContainer, this.pre.nextSibling);
            }

            // Click to edit
            this._mermaidContainer.addEventListener("click", () => {
                if (this.state) this.state.isActive = true;
                this.openCodeToolbar?.();
            });
        }

        // Hide code elements, show diagram
        if (this.pre) this.pre.style.display = "none";
        if (this.textarea) this.textarea.style.display = "none";
        this._mermaidContainer.style.display = "flex";

        if (!trimmedValue) {
            this._mermaidContainer.innerHTML = `<div style="color: #888; font-style: italic;">Enter Mermaid code to render diagram</div>`;
            return;
        }

        try {
            const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const { svg } = await mermaid.render(id, trimmedValue);
            this._mermaidContainer.innerHTML = svg;
        } catch (e) {
            this._mermaidContainer.innerHTML = `<div style="color: #dc3545; padding: 0.5rem;">
                <strong>Mermaid syntax error:</strong><br>
                <small>${e.message || 'Invalid syntax'}</small>
            </div>`;
        }
    },
});
