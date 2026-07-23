/// <reference path="../manga-provider.d.ts" />

class Provider {
  private useProxyBypass = "{{useProxyBypass}}";
  private proxyBypassUrl = "{{proxyBypassUrl}}";
  private baseUrl = "https://www.toongod.org";

  // ── FlareSolverr session ───────────────────────────────────────
  private sessionId = "";
  private sessionReady = false;

  // ── Search cache (best-effort, still useful sometimes) ─────────
  private searchCache = new Map<string, SearchResult[]>();
  private synonymIndex = new Map<string, SearchResult>();

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  private stringToBool(str: string): boolean {
    return str.toLowerCase() === "true";
  }

  // ── Create a persistent FlareSolverr browser session ───────────
  private async ensureSession(): Promise<void> {
    if (!this.stringToBool(this.useProxyBypass)) return;
    if (this.sessionReady) return;

    try {
      const res = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "sessions.create",
        }),
      });
      const data = await res.json();

      if (data.status === "ok" && data.session) {
        this.sessionId = data.session;
        this.sessionReady = true;
        console.log(`FlareSolverr session created: ${this.sessionId}`);
      }
    } catch (e) {
      console.error("Failed to create FlareSolverr session:", e);
    }
  }

  // ── Fetch through FlareSolverr using the persistent session ────
  private async flareFetch(url: string): Promise<{ ok: boolean; html: string }> {
    if (!this.stringToBool(this.useProxyBypass)) {
      const res = await fetch(url);
      return { ok: res.ok, html: await res.text() };
    }

    await this.ensureSession();

    try {
      const body: Record<string, unknown> = {
        cmd: "request.get",
        url,
        maxTimeout: 90000,
      };

      // Attach session if we have one
      if (this.sessionId) {
        body.session = this.sessionId;
      }

      const res = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.status === "ok" && data.solution) {
        return {
          ok: data.solution.status === 200,
          html: data.solution.response ?? "",
        };
      }

      // Session may have expired — recreate and retry once
      if (this.sessionId) {
        console.warn("Session may be stale, recreating...");
        this.sessionReady = false;
        this.sessionId = "";
        await this.ensureSession();

        if (this.sessionId) {
          body.session = this.sessionId;
          const retry = await fetch(`${this.proxyBypassUrl}/v1`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const retryData = await retry.json();
          if (retryData.status === "ok" && retryData.solution) {
            return {
              ok: retryData.solution.status === 200,
              html: retryData.solution.response ?? "",
            };
          }
        }
      }

      console.error("FlareSolverr error:", data.message);
      return { ok: false, html: "" };
    } catch (e) {
      console.error("FlareSolverr fetch failed:", e);
      return { ok: false, html: "" };
    }
  }

  // ── Search with synonym cache ──────────────────────────────────
  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const query = opts.query.trim();
    const cacheKey = query.toLowerCase();

    // 1) Exact cache hit
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey)!;
    }

    // 2) Synonym index hit
    const synonymMatch = this.synonymIndex.get(cacheKey);
    if (synonymMatch) {
      const results = [synonymMatch];
      this.searchCache.set(cacheKey, results);
      return results;
    }

    // 3) Network search
    const encoded = query.replaceAll(" ", "+");
    const { ok, html } = await this.flareFetch(
      `${this.baseUrl}/?s=${encoded}&post_type=wp-manga`,
    );
    if (!ok || !html) return [];

    const $ = LoadDoc(html);
    const series: SearchResult[] = [];

    $(".page-content-listing")
      .children(".row.c-tabs-item__content")
      .each((_i, e) => {
        const url = e.find(".tab-thumb a").attr("href")?.trim() ?? "";
        const id = url.split(this.baseUrl)[1] ?? "";
        const title = e.find(".post-title").text().trim();
        const image =
          e.find(".tab-thumb img").attr("data-src")?.trim() ??
          e.find(".tab-thumb img").attr("src")?.trim() ??
          "";
        const year = e
          .find(".post-content_item.mg_release .summary-content")
          .text()
          ?.trim();
        const synonymsText =
          e
            .find(".post-content_item.mg_alternative .summary-content")
            .text()
            ?.trim()
            .split(";") ?? [];

        const result: SearchResult = {
          id,
          title,
          synonyms: synonymsText.map((s) => s.trim()).filter(Boolean),
          year: year ? parseInt(year) : undefined,
          image,
        };

        series.push(result);

        // Index title + synonyms for future lookups
        this.synonymIndex.set(title.toLowerCase(), result);
        for (const syn of result.synonyms) {
          this.synonymIndex.set(syn.toLowerCase(), result);
        }
      });

    this.searchCache.set(cacheKey, series);
    return series;
  }

  // ── Chapters ───────────────────────────────────────────────────
  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const { ok, html } = await this.flareFetch(`${this.baseUrl}${mangaId}`);
    if (!ok || !html) return [];

    const $ = LoadDoc(html);
    const chapters: ChapterDetails[] = [];

    $("li.wp-manga-chapter").each((_i, e) => {
      const url = e.children("a").attr("href")?.trim() ?? "";
      const id = url.split(this.baseUrl)[1] ?? "";
      const title = e.children("a").text().trim();
      const titleParts = title.match(/Chapter\s+([\d.]+)(?:\s+(.+))?/i) ?? [];
      const chapter = titleParts[1] ?? "0";
      const index = parseInt(chapter);
      chapters.push({ id, title, chapter, url, index });
    });

    return chapters.reverse();
  }

  // ── Pages ──────────────────────────────────────────────────────
  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const { ok, html } = await this.flareFetch(`${this.baseUrl}${chapterId}`);
    if (!ok || !html) return [];

    const $ = LoadDoc(html);
    const pages: ChapterPage[] = [];

    $(".reading-content")
      .children(".page-break")
      .each((i, e) => {
        const url =
          e.children("img").attr("data-src")?.trim() ??
          e.children("img").attr("src")?.trim() ??
          "";
        if (!url) return;
        pages.push({
          index: i + 1,
          url: new URL(url).href,
          headers: { Referer: `${this.baseUrl}${chapterId}` },
        });
      });

    return pages;
  }
}