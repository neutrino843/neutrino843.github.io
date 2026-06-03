interface pageData {
    title: string,
    date: string,
    permalink: string,
    content: string,
    image?: string,
    preview: string,
    matchCount: number
}

interface match {
    start: number,
    end: number
}

declare var pjax: any;

const tagsToReplace = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '…': '&hellip;'
};

function replaceTag(tag: string) {
    return (tagsToReplace as Record<string, string>)[tag] || tag;
}

function replaceHTMLEnt(str: string) {
    return str.replace(/[&<>"]/g, replaceTag);
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
}

class Search {
    private data: pageData[];
    private form: HTMLFormElement;
    private input: HTMLInputElement;
    private list: HTMLDivElement;
    private resultTitle: HTMLHeadElement;
    private resultTitleTemplate: string;
    private container: HTMLDivElement;

    constructor({ form, input, list, resultTitle, resultTitleTemplate }: {
        form: HTMLFormElement,
        input: HTMLInputElement,
        list: HTMLDivElement,
        resultTitle: HTMLHeadingElement,
        resultTitleTemplate: string
    }) {
        this.form = form;
        this.input = input;
        this.list = list;
        this.resultTitle = resultTitle;
        this.resultTitleTemplate = resultTitleTemplate;
        this.container = list.parentElement as HTMLDivElement;

        if (this.input.value.trim() !== '') {
            this.doSearch(this.input.value.split(' '));
        }
        else {
            this.handleQueryString();
        }

        this.bindQueryStringChange();
        this.bindSearchForm();
    }

    private static processMatches(str: string, matches: match[], ellipsis: boolean = true, charLimit = 140, offset = 20): string {
        matches.sort((a, b) => {
            return a.start - b.start;
        });

        let i = 0,
            lastIndex = 0,
            charCount = 0;

        const resultArray: string[] = [];

        while (i < matches.length) {
            const item = matches[i];

            if (ellipsis && item.start - offset > lastIndex) {
                resultArray.push(`${replaceHTMLEnt(str.substring(lastIndex, lastIndex + offset))} [...] `);
                resultArray.push(`${replaceHTMLEnt(str.substring(item.start - offset, item.start))}`);
                charCount += offset * 2;
            }
            else {
                resultArray.push(replaceHTMLEnt(str.substring(lastIndex, item.start)));
                charCount += item.start - lastIndex;
            }

            let j = i + 1,
                end = item.end;

            while (j < matches.length && matches[j].start <= end) {
                end = Math.max(matches[j].end, end);
                ++j;
            }

            resultArray.push(`<mark>${replaceHTMLEnt(str.substring(item.start, end))}</mark>`);
            charCount += end - item.start;

            i = j;
            lastIndex = end;

            if (ellipsis && charCount > charLimit) break;
        }

        if (lastIndex < str.length) {
            let end = str.length;
            if (ellipsis) end = Math.min(end, lastIndex + offset);

            resultArray.push(`${replaceHTMLEnt(str.substring(lastIndex, end))}`);

            if (ellipsis && end != str.length) {
                resultArray.push(` [...]`);
            }
        }

        return resultArray.join('');
    }

    private async searchKeywords(keywords: string[]) {
        const rawData = await this.getData();
        const results: pageData[] = [];

        // Build escaped, non-empty keyword list (no mutation of original array)
        const escaped = keywords
            .map(v => escapeRegExp(v.trim()))
            .filter(v => v.length > 0);

        if (escaped.length === 0) return [];

        const regex = new RegExp(escaped.join('|'), 'gi');

        for (const item of rawData) {
            const titleMatches: match[] = [],
                contentMatches: match[] = [];

            let result = {
                ...item,
                preview: '',
                matchCount: 0
            }

            const contentMatchAll = item.content.matchAll(regex);
            for (const match of Array.from(contentMatchAll)) {
                contentMatches.push({
                    start: match.index,
                    end: match.index + match[0].length
                });
            }

            const titleMatchAll = item.title.matchAll(regex);
            for (const match of Array.from(titleMatchAll)) {
                titleMatches.push({
                    start: match.index,
                    end: match.index + match[0].length
                });
            }

            if (titleMatches.length > 0) result.title = Search.processMatches(result.title, titleMatches, false);
            if (contentMatches.length > 0) {
                result.preview = Search.processMatches(result.content, contentMatches);
            }
            else {
                result.preview = replaceHTMLEnt(result.content.substring(0, 140));
            }

            result.matchCount = titleMatches.length + contentMatches.length;
            if (result.matchCount > 0) results.push(result);
        }

        return results.sort((a, b) => {
            return b.matchCount - a.matchCount;
        });
    }

    private async doSearch(keywords: string[]) {
        const startTime = performance.now();

        const results = await this.searchKeywords(keywords);
        if (!this.list.isConnected) return;
        this.clear();

        for (const item of results) {
            this.list.append(Search.render(item));
        }

        const endTime = performance.now();

        this.resultTitle.innerText = this.generateResultTitle(results.length, ((endTime - startTime) / 1000).toPrecision(1));

        this.container?.classList.remove('hidden');

        if (typeof pjax !== 'undefined' && pjax && pjax.refresh) {
            pjax.refresh(document);
        }
    }

    private generateResultTitle(resultLen: number, time: string) {
        return this.resultTitleTemplate.replace("#PAGES_COUNT", resultLen.toString()).replace("#TIME_SECONDS", time);
    }

    public async getData() {
        if (!this.data) {
            const jsonURL = this.form.dataset.json as string;
            this.data = await fetch(jsonURL).then(res => res.json());
            const parser = new DOMParser();

            for (const item of this.data) {
                item.content = parser.parseFromString(item.content, 'text/html').body.innerText;
            }
        }

        return this.data;
    }

    private bindSearchForm() {
        let lastSearch = '';

        const eventHandler = (e: Event) => {
            e.preventDefault();
            const keywords = this.input.value.trim();

            Search.updateQueryString(keywords, true);

            if (keywords === '') {
                lastSearch = '';
                return this.clear();
            }

            if (lastSearch === keywords) return;
            lastSearch = keywords;

            this.doSearch(keywords.split(' '));
        }

        this.input.addEventListener('input', eventHandler);
        this.input.addEventListener('compositionend', eventHandler);
    }

    private clear() {
        this.list.innerHTML = '';
        this.resultTitle.innerText = '';
        this.container.classList.add('hidden');
    }

    private bindQueryStringChange() {
        window.addEventListener('popstate', (e) => {
            this.handleQueryString()
        })
    }

    private handleQueryString() {
        const pageURL = new URL(window.location.toString());
        const keywords = pageURL.searchParams.get('keyword') || '';
        this.input.value = keywords;

        if (keywords) {
            this.doSearch(keywords.split(' '));
        }
        else {
            this.clear()
        }
    }

    private static updateQueryString(keywords: string, replaceState = false) {
        const pageURL = new URL(window.location.toString());

        if (keywords === '') {
            pageURL.searchParams.delete('keyword')
        }
        else {
            pageURL.searchParams.set('keyword', keywords);
        }

        if (replaceState) {
            window.history.replaceState('', '', pageURL.toString());
        }
        else {
            window.history.pushState('', '', pageURL.toString());
        }
    }

    public static render(item: pageData) {
        return (
            <article>
                <a href={item.permalink}>
                    <div class="article-details">
                        <h2 class="article-title" dangerouslySetInnerHTML={{ __html: item.title }}></h2>
                        <section class="article-preview" dangerouslySetInnerHTML={{ __html: item.preview }}></section>
                    </div>
                    {item.image &&
                        <div class="article-image">
                            <img src={item.image} loading="lazy" />
                        </div>
                    }
                </a>
            </article>
        );
    }
}

declare global {
    interface Window {
        searchResultTitleTemplate: string;
    }
}

function searchInit() {
    const search = document.querySelector('.search-result');
    if (search) {
        const searchForm = document.querySelector('.search-form') as HTMLFormElement,
            searchInput = searchForm?.querySelector('input') as HTMLInputElement,
            searchResultList = document.querySelector('.search-result--list') as HTMLDivElement,
            searchResultTitle = document.querySelector('.search-result--title') as HTMLHeadingElement;

        if (searchForm && searchInput && searchResultList && searchResultTitle) {
            new Search({
                form: searchForm,
                input: searchInput,
                list: searchResultList,
                resultTitle: searchResultTitle,
                resultTitleTemplate: window.searchResultTitleTemplate
            });
        }
    }
}

export { searchInit };
export default Search;
