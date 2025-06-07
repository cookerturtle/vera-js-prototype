// src/index.ts
(function VisualTagger() {
  let cfg = {
    selector: {
      useTag: true,
      useId: true,
      useClasses: true,
      useNthChild: true,
      useDataAttrs: false,
      maxDepth: 8
    },
    events: ["click"],
    pii: { hashText: false, stripValues: true },
    targetOrigin: "*"
  };
  const VT_READY = { type: "vt-init", frameURL: location.href };
  safePost(VT_READY);
  window.addEventListener("message", (e) => {
    const data = e.data;
    if (data?.type === "vt-config") {
      cfg = { ...cfg, ...data.cfg };
      attachEventListeners();
    }
  });
  function attachEventListeners() {
    cfg.events.forEach(
      (evt) => document.addEventListener(evt, handleDomEvent, true)
    );
  }
  function handleDomEvent(ev) {
    const el = ev.target;
    if (!el || el.nodeType !== 1) return;
    const selectorInfo = buildSelector(el, cfg.selector);
    const bbox = el.getBoundingClientRect();
    const meta = collectMeta(el, cfg.pii);
    const payload = {
      type: "vt-event",
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
  function buildSelector(el, opts) {
    const path = [];
    const recipe = [];
    let depth = 0;
    while (el && el.nodeType === 1 && depth < opts.maxDepth) {
      let sel = "";
      if (opts.useId && el.id) {
        sel = `#${cssEscape(el.id)}`;
        recipe.push("id");
        path.unshift(sel);
        break;
      }
      if (opts.useTag) {
        sel += el.tagName.toLowerCase();
        recipe.push("tag");
      }
      if (opts.useClasses && el.classList.length > 0) {
        sel += "." + Array.from(el.classList).map(cssEscape).join(".");
        recipe.push("classes");
      }
      if (opts.useNthChild && el.parentElement) {
        const idx = Array.prototype.indexOf.call(el.parentElement.children, el) + 1;
        sel += `:nth-child(${idx})`;
        recipe.push("nth");
      }
      path.unshift(sel);
      el = el.parentElement;
      depth++;
    }
    return { selector: path.join(" > "), recipe };
  }
  function collectMeta(el, piiCfg) {
    const attr = (name) => el.getAttribute(name);
    const textContent = el.textContent?.trim() || "";
    const textPromise = piiCfg.hashText ? sha256(textContent).then((hash) => hash.slice(0, 8)) : Promise.resolve(textContent.slice(0, 200));
    return {
      href: attr("href"),
      src: attr("src"),
      value: piiCfg.stripValues ? null : attr("value"),
      dataset: { ...el.dataset },
      text: textContent
    };
  }
  function cssEscape(id) {
    return id.replace(/([ #;?%&,.+*~':"!^$\[\]()=>|/@])/g, "\\$1");
  }
  function sha256(str) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
  }
  function safePost(msg) {
    try {
      window.parent.postMessage(msg, cfg.targetOrigin);
    } catch (_) {
    }
  }
})();
