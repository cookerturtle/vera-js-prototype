/* eslint-disable no-console */
(function VisualTagger() {
    interface SelectorConfig {
        useTag: boolean;
        useId: boolean;
        useClasses: boolean;
        useNthChild: boolean;
        useDataAttrs: boolean;
        maxDepth: number;
    }

    interface PiiConfig {
        hashText: boolean;
        stripValues: boolean;
    }

    interface Config {
        selector: SelectorConfig;
        events: string[];
        pii: PiiConfig;
        targetOrigin: string;
    }

    interface SelectorInfo {
        selector: string;
        recipe: string[];
    }

    interface VTEvent {
        type: string;
        eventType: string;
        selector: string;
        recipe: string[];
        elementPath: number[];
        meta: ReturnType<typeof collectMeta>;
        bbox: { x: number; y: number; w: number; h: number };
        timestamp: number;
        frameURL: string;
    }

    interface VTRebuildMessage {
        type: 'vt-rebuild';
        eventId: string;
        elementPath: number[];
        newPrefs: SelectorConfig;
    }

    let cfg: Config = {
        selector: {
            useTag: true, useId: true, useClasses: true, useNthChild: true,
            useDataAttrs: false, maxDepth: 8
        },
        events: ['click'],
        pii: { hashText: false, stripValues: true },
        targetOrigin: '*'
    };

    post({ type: 'vt-init', frameURL: location.href });

    window.addEventListener('message', (e: MessageEvent) => {
        const data = e.data;
        if (data?.type === 'vt-config' && typeof data.cfg === 'object') {
            cfg = { ...cfg, ...data.cfg };
            attach();
        }
        if (data?.type === 'vt-rebuild') {
            rebuildSelector(data as VTRebuildMessage);
        }
    });

    function attach(): void {
        cfg.events.forEach(t => window.addEventListener(t, handle, true));
    }

    function handle(ev: Event): void {
        const el = ev.target as HTMLElement;
        if (!el || !(el instanceof Element)) return;

        const selectorInfo = buildSelector(el, cfg.selector);
        const bbox = el.getBoundingClientRect();

        const message: VTEvent = {
            type: 'vt-event',
            eventType: ev.type,
            selector: selectorInfo.selector,
            recipe: selectorInfo.recipe,
            elementPath: pathToRoot(el),
            meta: collectMeta(el, cfg.pii),
            bbox: { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height },
            timestamp: Date.now(),
            frameURL: location.href
        };

        post(message);
    }

    async function rebuildSelector({ eventId, elementPath, newPrefs }: VTRebuildMessage): Promise<void> {
        const el = locate(elementPath);
        if (!el) {
            return post({ type: 'vt-rebuild-result', eventId, error: 'not-found' });
        }

        const selectorInfo = buildSelector(el, newPrefs);
        const matches = document.querySelectorAll(selectorInfo.selector).length;

        post({
            type: 'vt-rebuild-result',
            eventId,
            selector: selectorInfo.selector,
            recipe: selectorInfo.recipe,
            matchCount: matches
        });
    }

    function buildSelector(el: Element, opts: SelectorConfig): SelectorInfo {
        const path: string[] = [];
        const recipe: string[] = [];
        let depth = 0;
        let node: Element | null = el;

        while (node && node.nodeType === 1 && depth < opts.maxDepth) {
            let seg = '';
            if (opts.useId && node.id) {
                seg = '#' + css(node.id);
                recipe.push('id');
                path.unshift(seg);
                break;
            }
            if (opts.useTag) {
                seg += node.tagName.toLowerCase();
                recipe.push('tag');
            }
            if (opts.useClasses && node.classList.length) {
                seg += '.' + Array.from(node.classList).map(css).join('.');
                recipe.push('classes');
            }
            if (opts.useNthChild && node.parentElement) {
                const idx = Array.from(node.parentElement.children).indexOf(node) + 1;
                seg += `:nth-child(${idx})`;
                recipe.push('nth');
            }

            path.unshift(seg);
            node = node.parentElement;
            depth++;
        }

        return { selector: path.join(' > '), recipe };
    }

    const css = (s: string): string => s.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1');

    function pathToRoot(el: Element): number[] {
        const p: number[] = [];
        let n: Element | null = el;

        while (n && n.parentElement) {
            p.unshift(Array.from(n.parentElement.children).indexOf(n));
            n = n.parentElement;
        }

        return p;
    }

    function locate(path: number[]): Element | null {
        let n: Element | null = document.documentElement;
        for (const idx of path) {
            if (!n || !n.children[idx]) return null;
            n = n.children[idx] as Element;
        }
        return n;
    }

    function collectMeta(el: Element, pii: PiiConfig) {
        const t = (el.textContent || '').trim();
        const input = el as HTMLInputElement;

        return {
            href: el.getAttribute('href') || null,
            src: el.getAttribute('src') || null,
            value: pii.stripValues ? null : input.value || el.getAttribute('value'),
            dataset: el instanceof HTMLElement ? { ...el.dataset } : {},
            text: pii.hashText ? '' : t.slice(0, 200)
        };
    }

    function post(msg: any): void {
        try {
            window.parent.postMessage(msg, cfg.targetOrigin);
        } catch (e) {
            console.error('postMessage error', e);
        }
    }
})();