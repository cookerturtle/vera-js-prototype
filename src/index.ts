/**
 * Visual Tagger – iframe tracker (TypeScript version)
 * v1.0
 */
(function VisualTagger() {
    type SelectorOptions = {
        useTag: boolean;
        useId: boolean;
        useClasses: boolean;
        useNthChild: boolean;
        useDataAttrs: boolean;
        maxDepth: number;
    };

    type PiiOptions = {
        hashText: boolean;
        stripValues: boolean;
    };

    type Config = {
        selector: SelectorOptions;
        events: string[];
        pii: PiiOptions;
        targetOrigin: string;
    };

    type VtInitMessage = {
        type: 'vt-init';
        frameURL: string;
    };

    type VtConfigMessage = {
        type: 'vt-config';
        cfg: Partial<Config>;
    };

    type VtEventMessage = {
        type: 'vt-event';
        eventType: string;
        selector: string;
        recipe: string[];
        meta: Record<string, any>;
        bbox: { x: number; y: number; w: number; h: number };
        timestamp: number;
        frameURL: string;
    };

    let cfg: Config = {
        selector: {
            useTag: true,
            useId: true,
            useClasses: true,
            useNthChild: true,
            useDataAttrs: false,
            maxDepth: 8
        },
        events: ['click'],
        pii: { hashText: false, stripValues: true },
        targetOrigin: '*'
    };

    const VT_READY: VtInitMessage = { type: 'vt-init', frameURL: location.href };

    safePost(VT_READY);

    window.addEventListener('message', (e: MessageEvent) => {
        const data = e.data as VtConfigMessage;
        if (data?.type === 'vt-config') {
            cfg = { ...cfg, ...data.cfg };
            attachEventListeners();
        }
    });

    function attachEventListeners(): void {
        cfg.events.forEach(evt =>
            document.addEventListener(evt, handleDomEvent as EventListener, true)
        );
    }

    function handleDomEvent(ev: Event): void {
        const el = ev.target as HTMLElement;
        if (!el || el.nodeType !== 1) return;

        const selectorInfo = buildSelector(el, cfg.selector);
        const bbox = el.getBoundingClientRect();
        const meta = collectMeta(el, cfg.pii);

        const payload: VtEventMessage = {
            type: 'vt-event',
            eventType: ev.type,
            selector: selectorInfo.selector,
            recipe: selectorInfo.recipe,
            meta,
            bbox: {
                x: bbox.x,
                y: bbox.y,
                w: bbox.width,
                h: bbox.height
            },
            timestamp: Date.now(),
            frameURL: location.href
        };

        safePost(payload);
    }

    function buildSelector(el: HTMLElement, opts: SelectorOptions): { selector: string; recipe: string[] } {
        const path: string[] = [];
        const recipe: string[] = [];
        let depth = 0;

        while (el && el.nodeType === 1 && depth < opts.maxDepth) {
            let sel = '';

            if (opts.useId && el.id) {
                sel = `#${cssEscape(el.id)}`;
                recipe.push('id');
                path.unshift(sel);
                break;
            }

            if (opts.useTag) {
                sel += el.tagName.toLowerCase();
                recipe.push('tag');
            }

            if (opts.useClasses && el.classList.length > 0) {
                sel += '.' + Array.from(el.classList).map(cssEscape).join('.');
                recipe.push('classes');
            }

            if (opts.useNthChild && el.parentElement) {
                const idx = Array.prototype.indexOf.call(el.parentElement.children, el) + 1;
                sel += `:nth-child(${idx})`;
                recipe.push('nth');
            }

            path.unshift(sel);
            el = el.parentElement as HTMLElement;
            depth++;
        }

        return { selector: path.join(' > '), recipe };
    }

    function collectMeta(el: HTMLElement, piiCfg: PiiOptions): Record<string, any> {
        const attr = (name: string): string | null => el.getAttribute(name);

        const textContent = el.textContent?.trim() || '';
        const textPromise = piiCfg.hashText
            ? sha256(textContent).then(hash => hash.slice(0, 8))
            : Promise.resolve(textContent.slice(0, 200));

        return {
            href: attr('href'),
            src: attr('src'),
            value: piiCfg.stripValues ? null : attr('value'),
            dataset: { ...el.dataset },
            text: textContent
        };
    }

    function cssEscape(id: string): string {
        return id.replace(/([ #;?%&,.+*~':"!^$\[\]()=>|/@])/g, '\\$1');
    }

    function sha256(str: string): Promise<string> {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
            .then(buf => Array.from(new Uint8Array(buf))
                .map(b => b.toString(16).padStart(2, '0')).join(''));
    }

    function safePost(msg: object): void {
        try {
            window.parent.postMessage(msg, cfg.targetOrigin);
        } catch (_) {
            // Ignore postMessage errors
        }
    }
})();