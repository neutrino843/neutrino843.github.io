import { switchLanguage, initLanguageSwitch } from './languageSwitch';

const ready = (): void => {
    initLanguageSwitch();

    const langBtns = document.querySelectorAll('.language-option');
    langBtns.forEach(btn => {
        btn.addEventListener('click', function(this: HTMLElement) {
            const lang = this.getAttribute('data-lang');
            if (lang) {
                switchLanguage(lang);
            }
        });
    });

    const langSelect = document.getElementById('language-select') as HTMLSelectElement | null;
    if (langSelect) {
        langSelect.addEventListener('change', function(this: HTMLSelectElement) {
            switchLanguage(this.value);
        });
    }

    if ((window as any).Stack && (window as any).Stack.ColorScheme) {
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
} else {
    ready();
}
