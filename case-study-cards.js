/*!
 * Case Study Cards — <case-study-card> + <case-study-grid>
 * Self-contained web components for embedding in Squarespace (or any site).
 * Styles live in Shadow DOM, so nothing here can restyle the host site and
 * the host site's CSS can't break the cards.
 *
 * Theming: colors and fonts fall back to Squarespace's own theme variables
 * (--heading-font-font-family, --paragraphMediumColor, …), which inherit into
 * the Shadow DOM, so the cards follow the site's Site Styles automatically.
 */
(() => {
  if (window.customElements.get('case-study-card')) return; // safe to load twice

  /* ------------------------------------------------------------------ */
  /* Shared helpers                                                      */
  /* ------------------------------------------------------------------ */

  const mqHover = matchMedia('(hover: hover) and (pointer: fine)');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const PLATFORM_NAMES = {
    ios: 'iOS', ipados: 'iPadOS', android: 'Android', web: 'Web', macos: 'macOS',
    windows: 'Windows', watchos: 'watchOS', visionos: 'visionOS', tvos: 'tvOS',
    desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', kiosk: 'Kiosk',
  };

  const ICON = {
    lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="3" y="7" width="10" height="7.25" rx="1.75" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 2.75 3.5v4c0 3.3 2.2 5.9 5.25 7 3.05-1.1 5.25-3.7 5.25-7v-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M5.6 8.1 7.3 9.8l3.2-3.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.3v9.4a.6.6 0 0 0 .9.5l7.4-4.7a.6.6 0 0 0 0-1L5.9 2.8a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>',
  };

  /* Design tokens shared by the card and the grid. Every value can be
     overridden with a --csc-* property, and most fall back to the
     Squarespace theme variable of the section the cards sit in. */
  const TOKENS = /* css */ `
    --_text: var(--csc-text, var(--paragraphMediumColor, #182a39));
    --_muted: var(--csc-muted, #415d77);
    --_accent: var(--csc-accent, #007c85);
    --_accent-contrast: var(--csc-accent-contrast, #ffffff);
    --_page-bg: var(--csc-page-bg, var(--siteBackgroundColor, #eef6f7));
    --_surface: var(--csc-surface, #ffffff);
    --_line: var(--csc-line, rgba(24, 42, 57, .12));
    --_card-radius: var(--csc-card-radius, 20px);
    --_pad: var(--csc-card-padding, clamp(14px, 4.5%, 22px));
    --_skeleton: var(--csc-skeleton, #dbe8eb);
    --_skeleton-hi: var(--csc-skeleton-highlight, #f2f8f9);
    --_panel-radius: var(--csc-panel-radius, 12px);
    --_offset: var(--csc-shadow-offset, 8px);
    --_pill: var(--csc-pill-radius, var(--primary-button-rounded-border-top-left-radius, 999px));
    --_heading-font: var(--csc-heading-font, var(--heading-font-font-family, Georgia, serif));
    --_body-font: var(--csc-body-font, var(--body-font-font-family, system-ui, sans-serif));
    --_live: var(--csc-live, #006b73);
    --_live-bg: var(--csc-live-bg, #d3eef0);
    --_progress: var(--csc-progress, #7f5200);
    --_progress-bg: var(--csc-progress-bg, #fbeccb);
    --_chip: var(--csc-chip, #182a39);
    --_chip-bg: var(--csc-chip-bg, rgba(24, 42, 57, .07));
    --_focus: var(--csc-focus, #007c85);
    --_ease: cubic-bezier(.2, .7, .2, 1);
  `;

  /* One IntersectionObserver for every card in "scroll" mode: the card crossing
     the middle of the screen plays; everything else pauses. */
  const scrollPlayer = (() => {
    const inBand = new Set();
    let active = null;
    const pick = () => {
      const mid = innerHeight / 2;
      let best = null, bestDist = Infinity;
      inBand.forEach((card) => {
        const r = card.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestDist) { bestDist = d; best = card; }
      });
      if (best !== active) {
        active?._pause();
        active = best;
        active?._play();
      }
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) inBand.add(e.target); else inBand.delete(e.target);
      });
      pick();
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 }); // a band across the middle 10% of the screen
    return {
      add(card) { io.observe(card); },
      remove(card) {
        io.unobserve(card);
        inBand.delete(card);
        if (active === card) { active._pause(); active = null; pick(); }
      },
    };
  })();

  /* Loads the poster only when a card gets near the viewport. */
  const nearViewport = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      nearViewport.unobserve(e.target);
      e.target.getRootNode().host._loadPoster();
    });
  }, { rootMargin: '400px 0px' });

  /* ------------------------------------------------------------------ */
  /* <case-study-card>                                                   */
  /* ------------------------------------------------------------------ */

  const CARD_CSS = /* css */ `
    :host {
      ${TOKENS}
      --_gradient: linear-gradient(135deg, #4fb0ba, #3fa2ac);
      --_panel-shadow: rgba(24, 42, 57, .22);
      --_ratio: 16 / 10;
      display: block;
      min-width: 0;
      color: var(--_text);
      font-family: var(--_body-font);
      text-align: start; /* don't inherit a centered Squarespace section */
      -webkit-font-smoothing: antialiased;
    }
    :host([hidden]) { display: none; }
    * { box-sizing: border-box; }

    .card {
      position: relative;
      display: grid;
      grid-template-rows: auto 1fr;
      height: 100%;
      background: var(--_surface);
      border: 1px solid var(--_line);
      border-radius: var(--_card-radius);
      overflow: hidden; /* clips the full-bleed hero to the card's corners */
      transition: border-color .35s var(--_ease), box-shadow .35s var(--_ease);
    }
    :host(:hover) .card {
      border-color: color-mix(in srgb, var(--_text) 22%, transparent);
      box-shadow: 0 18px 36px -24px rgba(11, 26, 38, .35);
    }
    /* focus ring drawn inside, since the card clips its overflow */
    .card:has(.title-link:focus-visible) { outline: 3px solid var(--_focus); outline-offset: -3px; }

    /* ---------- hero: full-bleed gradient panel; the demo frame carries the site's hard offset shadow ---------- */
    .media {
      position: relative;
      padding: clamp(18px, 7%, 36px) clamp(18px, 7%, 36px) calc(clamp(18px, 7%, 36px) + var(--_offset) / 2);
      background: var(--_gradient);
      isolation: isolate;
    }
    .frame {
      position: relative;
      aspect-ratio: var(--_ratio);
      max-width: 100%;
      border-radius: 8px;
      overflow: hidden;
      background: rgba(255, 255, 255, .5);
      box-shadow: var(--_offset) var(--_offset) 0 var(--_panel-shadow);
      transition: transform .35s var(--_ease), box-shadow .35s var(--_ease);
    }
    :host(:hover) .frame,
    .card:has(.title-link:focus-visible) .frame {
      transform: translate(-3px, -3px);
      box-shadow: calc(var(--_offset) + 3px) calc(var(--_offset) + 3px) 0 var(--_panel-shadow);
    }
    .frame img, .frame video {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .frame video { opacity: 0; transition: opacity .3s ease; }
    :host([data-playing]) .frame video { opacity: 1; }

    .hint {
      position: absolute; right: 10px; bottom: 10px;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 10px 5px 8px;
      border-radius: var(--_pill);
      background: rgba(24, 42, 57, .78);
      color: #fff;
      font: 600 11px/1 var(--_body-font);
      letter-spacing: .02em;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      transition: opacity .25s ease, transform .25s ease;
      pointer-events: none;
    }
    .hint svg { width: 10px; height: 10px; }
    :host([data-playing]) .hint,
    :host(:not([data-mode="hover"])) .hint,
    :host(:not([data-has-video])) .hint { opacity: 0; transform: translateY(4px); }

    /* status sits on the image, opposite the Preview hint */
    .on-image {
      position: absolute; left: 10px; bottom: 10px;
      z-index: 1;
      pointer-events: none;
    }
    .on-image .chip {
      height: 24px;
      padding: 0 10px;
      font-size: 12px; font-weight: 600;
      background: rgba(255, 255, 255, .94);
      box-shadow: 0 2px 8px -2px rgba(11, 26, 38, .3);
    }
    .on-image .chip.status-live { background: rgba(255, 255, 255, .94); }
    .on-image .chip.status-in-progress { background: rgba(255, 255, 255, .94); }

    .buffering {
      position: absolute; right: 10px; top: 10px;
      width: 18px; height: 18px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,.45);
      border-top-color: #fff;
      opacity: 0;
      animation: spin .8s linear infinite;
      transition: opacity .2s;
      pointer-events: none;
    }
    :host([data-buffering]) .buffering { opacity: 1; }

    /* ---------- text ---------- */
    .body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 18px var(--_pad) var(--_pad);
      min-width: 0;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      height: 26px;
      padding: 0 11px;
      border-radius: var(--_pill);
      background: var(--_chip-bg);
      color: var(--_chip);
      font: 500 13px/1 var(--_body-font);
      white-space: nowrap;
    }
    .chip svg { width: 12px; height: 12px; flex: none; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .chip.status-live { background: var(--_live-bg); color: var(--_live); }
    .chip.status-in-progress { background: var(--_progress-bg); color: var(--_progress); }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; position: relative; }
    .status-live .dot::after {
      content: ""; position: absolute; inset: -3px; border-radius: 50%;
      border: 1.5px solid currentColor; opacity: 0;
      animation: pulse 2.2s ease-out infinite;
    }
    .status-in-progress .dot { background: transparent; border: 1.75px solid currentColor; }
    .status-in-progress .dot::after {
      content: ""; position: absolute; inset: 0; border-radius: 50%;
      background: conic-gradient(currentColor 0 50%, transparent 0);
      transform: scale(.55);
    }

    .meta {
      margin: 0;
      display: flex; flex-wrap: wrap; align-items: center; gap: 2px 7px;
      color: var(--_muted);
      font-size: 14px; line-height: 1.45;
    }
    .meta .company { color: var(--_text); font-weight: 700; }
    .meta .sep { opacity: .5; }

    .title-link { color: inherit; text-decoration: none; outline: none; display: block; }
    /* Stretch the title's link over the whole card: one link, one tab stop. */
    .title-link::after { content: ""; position: absolute; inset: 0; z-index: 2; border-radius: var(--_card-radius); }

    ::slotted([slot="title"]) {
      margin: 0 !important;
      font-family: var(--_heading-font) !important;
      font-weight: 400 !important;
      font-size: var(--csc-title-size, 1.6rem) !important;
      line-height: 1.15 !important;
      letter-spacing: -0.02em !important;
      color: var(--_text) !important;
      text-wrap: balance;
    }
    ::slotted([slot="description"]) {
      margin: 0 !important;
      font-family: var(--_body-font) !important;
      font-size: var(--csc-description-size, 1.0625rem) !important;
      line-height: 1.55 !important;
      color: var(--_text) !important;
    }

    .footer {
      margin-top: auto;
      padding-top: 6px;
      display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between;
      gap: 12px;
    }
    .footer .facts { flex: 1 1 auto; min-width: 0; }
    .footer .cta { flex: none; }
    .facts {
      margin: 0;
      display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0;
      color: var(--_muted);
      font-size: 14px; line-height: 1.4;
      font-variant-numeric: tabular-nums;
    }
    .facts { column-gap: 12px; }
    .facts .platforms { white-space: nowrap; }
    .facts .year { font-weight: 700; color: var(--_text); }

    /* matches the site's outlined pill "View Case Study" button; fills on hover */
    .cta {
      display: inline-flex; align-items: center;
      min-height: 44px;
      padding: 0 22px;
      border: 2px solid var(--_accent);
      border-radius: var(--_pill);
      color: var(--_accent);
      font: 700 15px/1 var(--_body-font);
      white-space: nowrap;
      transition: background-color .25s ease, color .25s ease;
    }
    :host(:hover) .cta,
    .card:has(.title-link:focus-visible) .cta { background: var(--_accent); color: var(--_accent-contrast); }

    /* ---------- horizontal (extra-large screens): alternating rows, like the site ---------- */
    :host([data-layout="horizontal"]) .card {
      grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr);
      grid-template-rows: none;
      align-items: stretch;
    }
    /* the panel fills its whole half of the card, top to bottom and out to the edge */
    :host([data-layout="horizontal"]) .media {
      display: flex; align-items: center;
      padding: clamp(24px, 4%, 40px);
    }
    :host([data-layout="horizontal"]) .frame { width: 100%; }
    :host([data-layout="horizontal"][data-flip]) .media { order: 2; }
    :host([data-layout="horizontal"][data-flip]) .card,
    :host([data-layout="horizontal"][data-flip]) .skeleton { grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); }
    :host([data-layout="horizontal"]) .body { padding: clamp(24px, 3.5%, 48px); gap: 16px; justify-content: center; }
    /* title and description use the full width of the text column */
    :host([data-layout="horizontal"]) ::slotted([slot="title"]) { font-size: var(--csc-title-size-lg, 2.6rem) !important; max-width: none !important; width: 100%; text-wrap: pretty; }
    :host([data-layout="horizontal"]) ::slotted([slot="description"]) { font-size: var(--csc-description-size-lg, 1.125rem) !important; max-width: none !important; width: 100%; }
    :host([data-layout="horizontal"]) .footer { margin-top: 8px; flex-direction: column; align-items: flex-start; gap: 20px; }

    /* ---------- loading skeleton ---------- */
    .skeleton {
      position: absolute; inset: 0;
      z-index: 3;
      display: grid;
      grid-template-rows: auto 1fr;
      background: var(--_surface);
      pointer-events: none;
      transition: opacity .45s ease, visibility 0s linear .45s;
    }
    :host([data-state="ready"]) .skeleton { opacity: 0; visibility: hidden; }
    .sk-media {
      padding: clamp(18px, 7%, 36px) clamp(18px, 7%, 36px) calc(clamp(18px, 7%, 36px) + var(--_offset) / 2);
      background: var(--_skeleton);
    }
    .sk-media div { aspect-ratio: var(--_ratio); border-radius: 8px; }
    .sk-body { padding: 18px var(--_pad) var(--_pad); display: flex; flex-direction: column; gap: 12px; }
    .sk-row { display: flex; gap: 6px; }
    .sk { border-radius: 6px; height: 12px; }
    .shimmer {
      background: linear-gradient(90deg, var(--_skeleton) 0%, var(--_skeleton-hi) 40%, var(--_skeleton) 80%) 0 0 / 250% 100%;
      animation: shimmer 1.3s linear infinite;
    }
    .sk-media .shimmer { background-image: linear-gradient(90deg, rgba(255,255,255,.3) 0%, rgba(255,255,255,.75) 40%, rgba(255,255,255,.3) 80%); }
    :host([data-layout="horizontal"]) .skeleton {
      grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr);
      grid-template-rows: none;
      align-items: stretch;
    }
    :host([data-layout="horizontal"]) .sk-media { display: flex; align-items: center; padding: clamp(24px, 4%, 40px); }
    :host([data-layout="horizontal"]) .sk-media div { width: 100%; }
    :host([data-layout="horizontal"][data-flip]) .sk-media { order: 2; }
    :host([data-layout="horizontal"][data-flip]) .skeleton { grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); }
    :host([data-layout="horizontal"]) .sk-body { padding: clamp(24px, 3.5%, 48px); justify-content: center; }

    @keyframes shimmer { to { background-position: -250% 0; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0% { opacity: .9; transform: scale(.6); } 80%, 100% { opacity: 0; transform: scale(1.6); } }

    @media (prefers-reduced-motion: reduce) {
      .frame, .cta { transition: none; }
      :host(:hover) .frame, .card:has(.title-link:focus-visible) .frame { transform: none; }
      .shimmer, .status-live .dot::after, .buffering { animation: none; }
    }
  `;

  const SKELETON = `
    <div class="skeleton" aria-hidden="true">
      <div class="sk-media"><div class="shimmer"></div></div>
      <div class="sk-body">
        <div class="sk-row"><div class="sk shimmer" style="width:130px;height:26px;border-radius:999px"></div></div>
        <div class="sk shimmer" style="width:55%"></div>
        <div class="sk shimmer" style="width:85%;height:24px"></div>
        <div class="sk shimmer" style="width:100%"></div>
        <div class="sk shimmer" style="width:70%"></div>
        <div class="sk-row" style="justify-content:space-between;align-items:center;margin-top:6px"><div class="sk shimmer" style="width:30%"></div><div class="sk shimmer" style="width:150px;height:44px;border-radius:999px"></div></div>
      </div>
    </div>`;

  class CaseStudyCard extends HTMLElement {
    static get observedAttributes() {
      return ['href', 'status', 'company', 'product', 'feature', 'confidential', 'protected',
        'year', 'platforms', 'video', 'poster', 'gradient', 'gradient-from', 'gradient-via',
        'gradient-to', 'gradient-angle', 'shadow-color', 'media-ratio', 'play-mode', 'layout',
        'target', 'cta'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._posterLoaded = false;
      this._wantPlay = false;
      this._mode = 'none';
      this._onEnter = () => { if (this._mode === 'hover') this._play(); };
      this._onLeave = () => { if (this._mode === 'hover' && !this.matches(':focus-within')) this._pause(); };
      this._onFocusIn = () => { if (this._mode === 'hover') this._play(); };
      this._onFocusOut = () => { if (this._mode === 'hover' && !this.matches(':hover')) this._pause(); };
      this._onMQ = () => this._applyMode();
    }

    connectedCallback() {
      if (!this._built) this._build();
      this.setAttribute('data-state', this._posterLoaded ? 'ready' : 'loading');
      this._card.setAttribute('aria-busy', String(!this._posterLoaded));
      this.addEventListener('pointerenter', this._onEnter);
      this.addEventListener('pointerleave', this._onLeave);
      this.addEventListener('focusin', this._onFocusIn);
      this.addEventListener('focusout', this._onFocusOut);
      mqHover.addEventListener?.('change', this._onMQ);
      mqReduce.addEventListener?.('change', this._onMQ);
      nearViewport.observe(this._media);
      this._applyMode();
    }

    disconnectedCallback() {
      this.removeEventListener('pointerenter', this._onEnter);
      this.removeEventListener('pointerleave', this._onLeave);
      this.removeEventListener('focusin', this._onFocusIn);
      this.removeEventListener('focusout', this._onFocusOut);
      mqHover.removeEventListener?.('change', this._onMQ);
      mqReduce.removeEventListener?.('change', this._onMQ);
      nearViewport.unobserve(this._media);
      if (this._mode === 'scroll') scrollPlayer.remove(this);
      this._mode = 'none';
      this._pause();
    }

    attributeChangedCallback(name) {
      if (!this._built) return;
      if (name === 'poster') { this._posterLoaded = false; this._loadPoster(); return; }
      if (name === 'video') { this._video.removeAttribute('src'); this._videoSet = false; this.toggleAttribute('data-has-video', !!this.getAttribute('video')); return; }
      if (name === 'play-mode') { this._applyMode(); return; }
      if (name === 'layout') { this._syncLayout(); return; }
      this._renderBody();
      this._applyGradient();
    }

    /* ---------- build ---------- */
    _build() {
      this._built = true;
      this.shadowRoot.innerHTML = `
        <style>${CARD_CSS}</style>
        <article class="card" part="card">
          <div class="media" part="media">
            <div class="frame" part="frame">
              <img class="poster" alt="" decoding="async">
              <video muted playsinline loop preload="none" tabindex="-1" aria-hidden="true" disablepictureinpicture disableremoteplayback></video>
              <span class="on-image"></span>
              <span class="hint" aria-hidden="true">${ICON.play}Preview</span>
              <span class="buffering" aria-hidden="true"></span>
            </div>
          </div>
          <div class="body" part="body"></div>
          ${SKELETON}
        </article>`;
      const $ = (s) => this.shadowRoot.querySelector(s);
      this._card = $('.card');
      this._media = $('.media');
      this._img = $('.poster');
      this._video = $('video');
      this._body = $('.body');
      this._onImage = $('.on-image');
      this._video.muted = true; // must be set as a property too for iOS autoplay

      this._video.addEventListener('waiting', () => this.toggleAttribute('data-buffering', this._wantPlay));
      this._video.addEventListener('playing', () => {
        this.removeAttribute('data-buffering');
        if (this._wantPlay) this.setAttribute('data-playing', '');
      });
      this._video.addEventListener('error', () => { this.removeAttribute('data-buffering'); this.removeAttribute('data-playing'); });

      this._img.addEventListener('load', () => this._markReady());
      this._img.addEventListener('error', () => this._markReady());

      this.toggleAttribute('data-has-video', !!this.getAttribute('video'));
      this._renderBody();
      this._applyGradient();
      this._syncLayout();
    }

    _renderBody() {
      const a = (n) => (this.getAttribute(n) || '').trim();
      const status = a('status').toLowerCase().replace(/\s+/g, '-');
      // status rides on the hero image, next to the Preview hint
      let statusChip = '';
      if (status === 'live') statusChip = '<span class="chip status-live"><span class="dot" aria-hidden="true"></span>Live</span>';
      else if (status === 'in-progress' || status === 'inprogress') statusChip = '<span class="chip status-in-progress"><span class="dot" aria-hidden="true"></span>In progress</span>';
      this._onImage.innerHTML = statusChip;

      // one access tag: the lock icon says "password", the text says why
      const chips = [];
      const isProtected = this.hasAttribute('protected');
      const reason = this.hasAttribute('confidential') ? (a('confidential') || 'Confidential') : '';
      if (isProtected && reason) chips.push(`<span class="chip access" title="Password protected">${ICON.lock}<span aria-hidden="true">${esc(reason)}</span><span class="sr">Password protected, ${esc(reason)}</span></span>`);
      else if (isProtected) chips.push(`<span class="chip access">${ICON.lock}Password protected</span>`);
      else if (reason) chips.push(`<span class="chip access">${ICON.shield}${esc(reason)}</span>`);

      const metaParts = [
        a('company') && `<span class="company">${esc(a('company'))}</span>`,
        a('product') && `<span>${esc(a('product'))}</span>`,
        a('feature') && `<span>${esc(a('feature'))}</span>`,
      ].filter(Boolean);
      const meta = metaParts.length
        ? `<p class="meta">${metaParts.join('<span class="sep" aria-hidden="true">›</span>')}</p>` : '';

      const platforms = a('platforms').split(',').map((p) => p.trim()).filter(Boolean)
        .map((p) => PLATFORM_NAMES[p.toLowerCase()] || p);
      const facts = [
        a('year') && `<span class="year">${esc(a('year'))}</span>`,
        platforms.length && `<span class="platforms">${platforms.map(esc).join(' · ')}</span>`,
      ].filter(Boolean).join('');

      // cta="" hides the button; no attribute uses the default label
      const ctaLabel = this.hasAttribute('cta') ? a('cta') : 'View case study';

      const href = a('href') || '#';
      const target = a('target');
      const targetAttrs = target ? ` target="${esc(target)}"${target === '_blank' ? ' rel="noopener"' : ''}` : '';

      this._body.innerHTML = `
        ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
        ${meta}
        <a class="title-link" href="${esc(href)}"${targetAttrs}><slot name="title"></slot></a>
        <slot name="description"></slot>
        <div class="footer">
          <p class="facts">${facts}</p>
          ${ctaLabel ? `<span class="cta" aria-hidden="true">${esc(ctaLabel)}</span>` : ''}
        </div>`;
    }

    _applyGradient() {
      const get = (n) => (this.getAttribute(n) || '').trim();
      let g;
      if (get('gradient')) g = get('gradient');
      else if (get('gradient-from') || get('gradient-to')) {
        const angle = get('gradient-angle') || '135deg';
        const stops = [get('gradient-from'), get('gradient-via'), get('gradient-to')].filter(Boolean);
        if (stops.length === 1) stops.push(stops[0]);
        g = `linear-gradient(${/^\d+$/.test(angle) ? angle + 'deg' : angle}, ${stops.join(', ')})`;
      }
      if (g) this.style.setProperty('--_gradient', g); else this.style.removeProperty('--_gradient');

      // offset shadow: explicit color, or a darker shade of the panel's last color stop
      const base = get('shadow-color') || get('gradient-to') || get('gradient-from');
      if (get('shadow-color')) this.style.setProperty('--_panel-shadow', get('shadow-color'));
      else if (base) this.style.setProperty('--_panel-shadow', `color-mix(in srgb, ${base} 68%, #0b1a26)`);
      else this.style.removeProperty('--_panel-shadow');

      const ratio = get('media-ratio');
      if (ratio) this.style.setProperty('--_ratio', ratio.replace(':', ' / ')); else this.style.removeProperty('--_ratio');
    }

    _syncLayout() {
      const own = this.getAttribute('layout');
      const layout = (own === 'horizontal' || own === 'vertical') ? own : (this._gridLayout || 'vertical');
      this.setAttribute('data-layout', layout);
      this.toggleAttribute('data-flip', layout === 'horizontal' && !!this._gridFlip);
    }
    /** Called by <case-study-grid>. */
    _setGridLayout(layout, flip) { this._gridLayout = layout; this._gridFlip = flip; this._syncLayout(); }

    /* ---------- loading ---------- */
    _loadPoster() {
      const src = this.getAttribute('poster');
      if (!src) { this._markReady(); return; }
      if (this._img.getAttribute('src') === src && this._img.complete) { this._markReady(); return; }
      this._img.src = src;
      if (this._img.complete && this._img.naturalWidth) this._markReady();
    }

    _markReady() {
      if (this._posterLoaded) return;
      const delay = Number(this.getAttribute('debug-delay')) || 0; // for testing the loading state
      const done = () => {
        this._posterLoaded = true;
        this.setAttribute('data-state', 'ready');
        this._card.setAttribute('aria-busy', 'false');
      };
      const decoded = this._img.decode ? this._img.decode().catch(() => {}) : Promise.resolve();
      decoded.then(() => (delay ? setTimeout(done, delay) : done()));
    }

    /* ---------- playback ---------- */
    _resolveMode() {
      if (!this.getAttribute('video') || mqReduce.matches) return 'none';
      const grid = this.closest('case-study-grid');
      const pref = (this.getAttribute('play-mode') || grid?.getAttribute('play-mode') || 'auto').toLowerCase();
      if (pref === 'none' || pref === 'hover' || pref === 'scroll') return pref;
      return mqHover.matches ? 'hover' : 'scroll';
    }

    _applyMode() {
      if (!this._built || !this.isConnected) return;
      const next = this._resolveMode();
      if (next === this._mode) return;
      if (this._mode === 'scroll') scrollPlayer.remove(this);
      this._pause();
      this._mode = next;
      this.setAttribute('data-mode', next);
      if (next === 'scroll') scrollPlayer.add(this);
      if (next === 'hover' && this.matches(':hover')) this._play();
    }

    _play() {
      const src = this.getAttribute('video');
      if (!src || this._mode === 'none') return;
      this._wantPlay = true;
      if (!this._videoSet) {
        this._video.src = src;
        this._video.preload = 'auto';
        this._videoSet = true;
      }
      if (this._video.readyState < 3) this.setAttribute('data-buffering', '');
      const p = this._video.play();
      if (p && p.catch) {
        p.then(() => { if (this._wantPlay) this.setAttribute('data-playing', ''); else this._video.pause(); })
          .catch(() => { // autoplay refused (e.g. iOS Low Power Mode): keep showing the poster
            this.removeAttribute('data-buffering');
            this.removeAttribute('data-playing');
          });
      }
    }

    _pause() {
      this._wantPlay = false;
      this.removeAttribute('data-playing');
      this.removeAttribute('data-buffering');
      if (this._video && !this._video.paused) this._video.pause();
    }
  }

  /* ------------------------------------------------------------------ */
  /* <case-study-grid>                                                   */
  /* ------------------------------------------------------------------ */

  const GRID_CSS = /* css */ `
    :host {
      ${TOKENS}
      display: block;
      text-align: start;
      font-family: var(--_body-font);
      color: var(--_text);
    }
    * { box-sizing: border-box; }
    .grid {
      display: grid;
      grid-template-columns: repeat(var(--_cols, 1), minmax(0, 1fr));
      column-gap: var(--csc-gap, clamp(24px, 3vw, 44px));
      row-gap: var(--csc-row-gap, clamp(44px, 5vw, 72px));
      align-items: stretch;
    }
    :host([data-layout="horizontal"]) .grid { row-gap: var(--csc-row-gap-lg, clamp(28px, 2.5vw, 40px)); }

    /* ---------- "Up next" tile: same anatomy as a card, panel drawn as a work in progress ---------- */
    .next {
      position: relative;
      display: flex;
      flex-direction: column;
      background: var(--_surface);
      border: 1px solid var(--_line);
      border-radius: var(--_card-radius);
      overflow: hidden;
      color: var(--_text);
      text-decoration: none;
      transition: border-color .35s var(--_ease), box-shadow .35s var(--_ease);
    }
    .next[hidden] { display: none; }
    a.next:hover { border-color: color-mix(in srgb, var(--_text) 22%, transparent); box-shadow: 0 18px 36px -24px rgba(11, 26, 38, .35); }
    a.next:focus-visible { outline: 3px solid var(--_focus); outline-offset: -3px; }
    .panel {
      position: relative;
      /* same full-bleed box as a card's hero panel */
      padding: clamp(18px, 7%, 36px) clamp(18px, 7%, 36px) calc(clamp(18px, 7%, 36px) + var(--_offset) / 2);
      background: var(--_page-bg);
      overflow: hidden;
      isolation: isolate;
    }
    .next-body { display: flex; flex-direction: column; gap: 12px; padding: 18px var(--_pad) var(--_pad); }
    .blob {
      position: absolute;
      width: 55%; aspect-ratio: 1;
      border-radius: 50%;
      filter: blur(34px);
      opacity: .75;
      z-index: -1;
      animation: drift 16s ease-in-out infinite alternate;
    }
    .blob.b1 { background: var(--csc-next-1, #4fb0ba); left: -10%; top: -15%; }
    .blob.b2 { background: var(--csc-next-2, #de8ff2); right: -12%; top: 5%; animation-duration: 19s; animation-delay: -6s; }
    .blob.b3 { background: var(--csc-next-3, #e3692b); left: 20%; bottom: -30%; animation-duration: 22s; animation-delay: -11s; }
    .blob.b4 { background: var(--csc-next-4, #f2b935); right: 5%; bottom: -25%; animation-duration: 18s; animation-delay: -3s; }

    /* a wireframe frame "being drafted" */
    .box { position: relative; aspect-ratio: 16 / 10; }
    .draft {
      position: absolute;
      inset: 6% 8%;
      display: grid; align-content: start; gap: 10px;
      padding: 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, .55);
      border: 1px solid rgba(255, 255, 255, .8);
      box-shadow: 0 12px 28px -14px rgba(11, 26, 38, .45);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .draft .img { aspect-ratio: 16 / 6; border-radius: 6px; background-color: rgba(24, 42, 57, .1); }
    .draft .ln { height: 8px; border-radius: 4px; background-color: rgba(24, 42, 57, .14); }
    .draft .ln.w1 { width: 45%; }
    .draft .ln.w2 { width: 80%; }
    .draft .img, .draft .ln {
      background-image: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.85) 50%, transparent 100%);
      background-size: 250% 100%;
      background-repeat: no-repeat;
      animation: sweep 2.4s ease-in-out infinite;
    }
    .cursor {
      position: absolute; width: 18px; height: 18px;
      left: 64%; top: 62%;
      animation: wander 7s ease-in-out infinite;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.3));
    }

    .eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      color: var(--_accent);
      font: 700 12px/1 var(--_body-font);
      letter-spacing: .1em; text-transform: uppercase;
    }
    .eyebrow .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: blink 1.6s ease-in-out infinite; }
    .heading {
      margin: 0;
      font: 400 1.6rem/1.15 var(--_heading-font);
      letter-spacing: -0.02em;
      min-height: 1.15em;
    }
    .caret { display: inline-block; width: 2px; height: 1em; margin-left: 3px; background: var(--_accent); vertical-align: -0.1em; animation: blink 1s step-end infinite; }
    .text { margin: 0; font-size: 1.0625rem; line-height: 1.55; max-width: 36ch; }
    .cta {
      display: inline-flex; align-items: center;
      align-self: flex-start;
      min-height: 44px;
      margin-top: 4px;
      padding: 0 22px;
      border: 2px solid var(--_accent);
      border-radius: var(--_pill);
      color: var(--_accent);
      font: 700 15px/1 var(--_body-font);
      transition: background-color .25s ease, color .25s ease;
    }
    a.next:hover .cta, a.next:focus-visible .cta { background: var(--_accent); color: var(--_accent-contrast); }

    @keyframes drift {
      0% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(15%, 10%) scale(1.15); }
      100% { transform: translate(-10%, 15%) scale(.95); }
    }
    @keyframes sweep { 0% { background-position: 150% 0; } 100% { background-position: -150% 0; } }
    @keyframes blink { 50% { opacity: 0; } }
    @keyframes wander {
      0%, 100% { transform: translate(0, 0); }
      30% { transform: translate(-80px, -26px); }
      60% { transform: translate(-28px, -60px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .blob, .draft .img, .draft .ln, .cursor, .eyebrow .dot, .caret { animation: none; }
      .panel, .cta { transition: none; }
    }
  `;

  class CaseStudyGrid extends HTMLElement {
    static get observedAttributes() {
      return ['horizontal-from', 'two-up-from', 'three-up-from', 'next-title', 'next-text', 'next-href', 'next-label', 'next-eyebrow', 'no-next', 'play-mode', 'alternate'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <style>${GRID_CSS}</style>
        <div class="grid" part="grid">
          <slot></slot>
          <div class="next" part="next" hidden></div>
        </div>`;
      this._grid = this.shadowRoot.querySelector('.grid');
      this._next = this.shadowRoot.querySelector('.next');
      this._slot = this.shadowRoot.querySelector('slot');
      this._slot.addEventListener('slotchange', () => this._layout());
      this._ro = new ResizeObserver(() => this._layout());
    }

    connectedCallback() {
      this._ro.observe(this);
      this._renderNext();
      this._layout();
    }
    disconnectedCallback() { this._ro.disconnect(); this._typeIO?.disconnect(); }

    attributeChangedCallback(name) {
      if (!this.isConnected) return;
      if (name === 'play-mode') { this._cards().forEach((c) => c._applyMode?.()); return; }
      if (name.startsWith('next') || name === 'no-next') this._renderNext();
      this._layout();
    }

    _cards() {
      return this._slot.assignedElements().filter((el) => el.localName === 'case-study-card' && !el.hidden);
    }

    _num(name, fallback) { const n = parseFloat(this.getAttribute(name)); return Number.isFinite(n) ? n : fallback; }

    _layout() {
      const w = this.offsetWidth; // layout width, ignores any CSS transform scaling
      if (!w) return;
      const horizontalFrom = this._num('horizontal-from', 1320);
      const threeFrom = this._num('three-up-from', 900);
      const twoFrom = this._num('two-up-from', 600);
      let cols, layout = 'vertical';
      if (w >= horizontalFrom) { cols = 1; layout = 'horizontal'; }
      else if (w >= threeFrom) cols = 3;
      else if (w >= twoFrom) cols = 2;
      else cols = 1;

      this._grid.style.setProperty('--_cols', cols);
      this.setAttribute('data-columns', cols);
      this.setAttribute('data-layout', layout);

      // rows alternate image left / image right, like the site's case-study list
      const alternate = this.getAttribute('alternate') !== 'false';
      const cards = this._cards();
      cards.forEach((c, i) => c._setGridLayout?.(layout, alternate && i % 2 === 1));

      const empty = cols > 1 ? (cols - (cards.length % cols)) % cols : 0;
      const show = empty > 0 && !this.hasAttribute('no-next');
      this._next.hidden = !show;
      if (show) this._next.style.gridColumn = `span ${empty}`;
    }

    _renderNext() {
      const a = (n, d) => (this.getAttribute(n) ?? d);
      const href = this.getAttribute('next-href');
      const old = this._next;
      const el = document.createElement(href ? 'a' : 'div');
      el.className = 'next';
      el.setAttribute('part', 'next');
      el.hidden = old.hidden;
      el.style.gridColumn = old.style.gridColumn;
      if (href) el.href = href;
      const title = a('next-title', 'New case study in the works');
      el.innerHTML = `
        <div class="panel" aria-hidden="true">
          <span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="blob b4"></span>
          <div class="box">
            <div class="draft"><div class="img"></div><div class="ln w1"></div><div class="ln w2"></div></div>
            <svg class="cursor" viewBox="0 0 18 18"><path d="M2 1.5 15 8.2l-5.6 1.6L7 15.5z" fill="#182a39" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </div>
        </div>
        <div class="next-body">
          <span class="eyebrow"><span class="dot" aria-hidden="true"></span>${esc(a('next-eyebrow', 'Up next'))}</span>
          <p class="heading" aria-label="${esc(title)}"><span class="typed" aria-hidden="true"></span><span class="caret" aria-hidden="true"></span></p>
          <p class="text">${esc(a('next-text', 'Drafting the next story now. Want an early look?'))}</p>
          ${href ? `<span class="cta">${esc(a('next-label', 'Get in touch'))}</span>` : ''}
        </div>`;
      old.replaceWith(el);
      this._next = el;
      this._typeOnView(el.querySelector('.typed'), title);
    }

    /* Types the heading once when the tile scrolls into view. */
    _typeOnView(target, text) {
      this._typeIO?.disconnect();
      if (mqReduce.matches) { target.textContent = text; return; }
      target.textContent = '';
      this._typeIO = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        this._typeIO.disconnect();
        let i = 0;
        const step = () => {
          target.textContent = text.slice(0, ++i);
          if (i < text.length) setTimeout(step, 38 + Math.random() * 50);
        };
        setTimeout(step, 350);
      }, { threshold: 0.5 });
      this._typeIO.observe(this._next);
    }
  }

  customElements.define('case-study-card', CaseStudyCard);
  if (!customElements.get('case-study-grid')) customElements.define('case-study-grid', CaseStudyGrid);
})();
