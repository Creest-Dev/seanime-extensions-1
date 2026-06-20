// main.ts - Manga Translate Plugin (Proof of Concept)

/// <reference path="../../plugin.d.ts" />
/// <reference path="../../core.d.ts" />
/// <reference path="../../app.d.ts" />

function init() {
  $ui.register((ctx: $ui.Context) => {
    // ── Settings ──────────────────────────────────────────────
    const settings = ctx.settings.define("translate", {
      apiKey: "",
      targetLang: "es",
      model: "gpt-4o",
      font: "Default",
      textAlign: "center",
      bubblesOnly: false,
      strokeDisabled: false,
      minFontSize: 0,
      customPrompt: "",
    });

    // ── State ─────────────────────────────────────────────────
    const enqueued = new Set<string>(); // img src -> translating
    const translated = new Set<string>(); // img src -> done

    // ── Inject translate button ───────────────────────────────
    let translateBtn: $ui.DOMElement | null = null;
    let isTranslating = false;

    function buildTranslateUrl(imgSrc: string): string {
      // imgSrc is already a page-proxy URL like /api/v1/manga/page-proxy?url=...
      const separator = imgSrc.includes("?") ? "&" : "?";
      return imgSrc + separator + "translate=1";
    }

    async function handleTranslatePage() {
      if (isTranslating) return;
      isTranslating = true;

      try {
        // Find current page images
        const images = await ctx.dom.query("[data-chapter-page-image]");
        for (const img of images) {
          const src = await img.getAttribute("src");
          if (!src || translated.has(src) || enqueued.has(src)) continue;

          enqueued.add(src);
          const translatedUrl = buildTranslateUrl(src);
          await img.setAttribute("src", translatedUrl);
          translated.add(src);
        }
      } finally {
        isTranslating = false;
      }
    }

    ctx.dom.onMainTabReady(async () => {
      // Wait for manga reader bar to appear
      const [stopObserving] = ctx.dom.observe(
        "[data-manga-reader-bar]",
        async (elements) => {
          if (elements.length === 0) return;
          stopObserving(); // Found it, stop watching

          const bar = elements[0];

          // Check if button already exists
          const existing = await bar.query("[data-plugin-translate-btn]");
          if (existing.length > 0) return;

          // Create translate button
          const btn = await ctx.dom.createElement("button");
          btn.setAttribute("data-plugin-translate-btn", "");
          btn.setAttribute("title", "Translate page");
          btn.setCssText(`
            display: inline-flex; align-items: center; justify-content: center;
            width: 32px; height: 32px; border-radius: 6px; border: 1px solid #494949;
            background: transparent; color: #ccc; cursor: pointer; font-size: 18px;
            margin-left: 8px;
          `);
          btn.setText("🌐");

          btn.addEventListener("click", async () => {
            await handleTranslatePage();
          });

          // Insert before the settings component
          const infoContainer = await bar.queryOne(
            "[data-manga-reader-bar-info-container]",
          );
          if (infoContainer) {
            infoContainer.before(btn);
          } else {
            bar.appendChild(btn);
          }

          translateBtn = btn;

          // Observe page changes to update button state
          ctx.dom.observe("[data-chapter-page-image]", async (pageImages) => {
            // Button state could be updated here based on whether current page is translated
          });
        },
      );
    });
  });
}
