/// <reference path="../manga-provider.d.ts" />

class Provider {
  private useProxyBypass = "{{useProxyBypass}}";
  private proxyBypassUrl = "{{proxyBypassUrl}}";
  private baseUrl = "https://www.toongod.org";

  // ── Cookie / session cache ─────────────────────────────────────
  private cookies = "";
  private userAgent = "";
  private cookiesExpiry = 0;

  // ── Search result cache ────────────────────────────────────────
  // Maps a lowercase search term → SearchResult[]
  private searchCache = new Map<string, SearchResult[]>();
  // Maps a lowercase synonym/title → the SearchResult it belongs to
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

  // ── Solve challenge once, cache cookies ────────────────────────
  private async ensureSession(): Promise<void> {
    // Reuse cookies if they haven't expired (cf_clearance lasts ~30 min)
    if (this.cookies && Date.now() < this.cookiesExpiry) return;

    if (!this.stringToBool(this.useProxyBypass)) return;

    try {
      const res = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url: this.baseUrl,
          maxTimeout: 90000,
        }),
      });
      const data = await res.json();

      if (data.status === "ok" && data.solution?.cookies) {
        this.cookies = data.solution.cookies
          .map((c: any) => `${c.name}=${c.value}`)
          .join("; ");
        this.userAgent = data.solution.userAgent ?? "";

        // Find cf_clearance expiry
        const cfCookie = data.solution.cookies.find(
          (c: any) => c.name === "cf_clearance",
        );
        if (cfCookie?.expiry) {
          // Expire 5 min early to be safe
          this.cookiesExpiry = (cfCookie.expiry - 300) * 1000;
        } else {
          // Default: 25 minutes from now
          this.cookiesExpiry = Date.now() + 25 * 60 * 1000;
        }
      }
    } catch (e) {
      console.error("Failed to get session:", e);
    }
  }

  // ── Smart fetch: try cached cookies first, fall back to FlareSolverr
  private async smartFetch(url: string): Promise<{ ok: boolean; html: string }> {
    if (!this.stringToBool(this.useProxyBypass)) {
      const res = await fetch(url);
      return { ok: res.ok, html: await res.text() };
    }

    // 1) Try with cached cookies (fast, no FlareSolverr)
    if (this.cookies && Date.now() < this.cookiesExpiry) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": this.userAgent,
            Cookie: this.cookies,
          },
        });
        if (res.ok) {
          return { ok: true, html: await res.text() };
        }
        // 403 → cookies rejected, fall through to FlareSolverr
      } catch {
        // Network error, fall through
      }
    }

    // 2) Fall back to FlareSolverr (slow, ~12s)
    try {
      const res = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url,
          maxTimeout: 90000,
        }),
      });
      const data = await res.json();

      if (data.status === "ok" && data.solution) {
        // Refresh cached cookies from this response
        if (data.solution.cookies) {
          this.cookies = data.solution.cookies
            .map((c: any) => `${c.name}=${c.value}`)
            .join("; ");
          this.userAgent = data.solution.userAgent ?? "";
          const cfCookie = data.solution.cookies.find(
            (c: any) => c.name === "cf_clearance",
          );
          this.cookiesExpiry = cfCookie?.expiry
            ? (cfCookie.expiry - 300) * 1000
            : Date.now() + 25 * 60 * 1000;
        }
        return {
          ok: data.solution.status === 200,
          html: data.solution.response ?? "",
        };
      }
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

    // 1) Exact cache hit — return instantly (0 ms)
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey)!;
    }

    // 2) Synonym index hit — return the cached manga (0 ms)
    const synonymMatch = this.synonymIndex.get(cacheKey);
    if (synonymMatch) {
      const results = [synonymMatch];
      this.searchCache.set(cacheKey, results);
      return results;
    }

    // 3) No cache hit — actually search via network
    const encoded = query.replaceAll(" ", "+");
    const { ok, html } = await this.smartFetch(
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

        // ── Index every synonym + title for future lookups ──
        this.synonymIndex.set(title.toLowerCase(), result);
        for (const syn of result.synonyms) {
          this.synonymIndex.set(syn.toLowerCase(), result);
        }
      });

    // Cache this exact query
    this.searchCache.set(cacheKey, series);

    return series;
  }

  // ── Chapters (uses smartFetch with cookie reuse) ───────────────
  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const { ok, html } = await this.smartFetch(`${this.baseUrl}${mangaId}`);
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
    const { ok, html } = await this.smartFetch(`${this.baseUrl}${chapterId}`);
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
          headers: {
            Referer: `${this.baseUrl}${chapterId}`,
          },
        });
      });

    return pages;
  }
}