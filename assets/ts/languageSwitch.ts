interface I18NData {
    [key: string]: string | I18NData;
}

function getNestedValue(obj: Record<string, any>, path: string): string {
    return path.split('.').reduce((current, key) => {
        if (current && typeof current === 'object') {
            return current[key];
        }
        return undefined;
    }, obj) as string || path;
}

function interpolate(template: string, params: Record<string, string>): string {
    return template.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_, key) => params[key] || '');
}

function translateElement(el: HTMLElement, lang: string): void {
    const i18n = (window as any).__I18N__;
    if (!i18n || !i18n[lang]) return;

    const key = el.getAttribute('data-i18n-key');
    if (!key) return;

    let translation = getNestedValue(i18n[lang], key);
    if (!translation || translation === key) {
        const fallback = getNestedValue(i18n[(window as any).__DEFAULT_LANG__ || 'zh-cn'], key);
        if (fallback && fallback !== key) {
            translation = fallback;
        } else {
            return;
        }
    }

    const paramsStr = el.getAttribute('data-i18n-params');
    if (paramsStr) {
        try {
            const params = JSON.parse(paramsStr);
            translation = interpolate(translation, params);
        } catch (e) {
        }
    }

    const target = el.getAttribute('data-i18n-target');
    if (target === 'placeholder') {
        (el as HTMLInputElement).placeholder = translation;
    } else if (target === 'aria-label') {
        el.setAttribute('aria-label', translation);
    } else if (target === 'title') {
        el.setAttribute('title', translation);
    } else {
        el.textContent = translation;
    }
}

function translateAll(lang: string): void {
    const elements = document.querySelectorAll('[data-i18n-key]');
    elements.forEach(el => translateElement(el as HTMLElement, lang));

    document.documentElement.lang = lang;

    document.querySelectorAll('.language-option').forEach(btn => {
        const btnLang = btn.getAttribute('data-lang');
        if (btnLang === lang) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const langSelect = document.getElementById('language-select') as HTMLSelectElement | null;
    if (langSelect) {
        langSelect.value = lang;
    }
}

export function switchLanguage(lang: string): void {
    const supported = (window as any).__SUPPORTED_LANGS__ || ['zh-cn', 'en'];
    if (!supported.includes(lang)) return;

    localStorage.setItem('preferred-language', lang);
    translateAll(lang);
}

function detectLanguage(): string {
    const stored = localStorage.getItem('preferred-language');
    if (stored) return stored;

    const browserLang = navigator.language || (navigator as any).userLanguage || '';
    if (browserLang.startsWith('zh')) return 'zh-cn';
    if (browserLang.startsWith('en')) return 'en';

    return (window as any).__DEFAULT_LANG__ || 'zh-cn';
}

function initLanguageSwitch(): void {
    const currentLang = detectLanguage();

    if (currentLang !== (window as any).__CURRENT_LANG__) {
        translateAll(currentLang);
    } else {
        translateAll((window as any).__CURRENT_LANG__);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initLanguageSwitch();
});

(window as any).switchLanguage = switchLanguage;

export { initLanguageSwitch, translateAll, translateElement };
