/// <reference path="../manga-provider.d.ts" />
/// <reference path="../core.d.ts" />

class ComixProvider {
  private useProxyBypass = "{{useProxyBypass}}";
  private proxyBypassUrl = "{{proxyBypassUrl}}";
  private baseUrl = "https://comix.to";

  private sessionId = "comix-to-seanime";
  private sessionCreated = false;

  private searchCache = new Map<string, SearchResult[]>();
  private synonymIndex = new Map<string, SearchResult>();

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  private stringToBool(value: string): boolean {
    return value.toLowerCase() === "true";
  }

  private toAbsoluteUrl(path: string): string {
    return new URL(path, this.baseUrl).href;
  }

  private toPath(value: string): string {
    try {
      const url = new URL(value, this.baseUrl);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return value.startsWith("/") ? value : `/${value}`;
    }
  }

  private getTitleUrl(mangaId: string, page?: number): string {
    const url = new URL(mangaId, this.baseUrl);
    if (page && page > 1) {
      url.searchParams.set("page", String(page));
    }
    return url.href;
  }

  private normalizeTitle(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private parseCardYear(cardText: string): number | undefined {
    const yearMatch = cardText.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? Number.parseInt(yearMatch[0], 10) : undefined;
  }

  private scoreSearchResult(result: SearchResult, query: string, year?: number): number {
    const normalizedQuery = this.normalizeTitle(query);
    const normalizedTitle = this.normalizeTitle(result.title);
    let score = 0;

    if (normalizedTitle === normalizedQuery) {
      score += 1000;
    } else if (normalizedTitle.startsWith(`${normalizedQuery} `)) {
      score += 600;
    } else if (normalizedTitle.includes(normalizedQuery)) {
      score += 300;
    } else if (normalizedQuery.includes(normalizedTitle)) {
      score += 100;
    }

    if (year && result.year === year) {
      score += 200;
    }

    if (result.synonyms?.some((synonym) => this.normalizeTitle(synonym) === normalizedQuery)) {
      score += 150;
    }

    return score;
  }

  private async ensureSession(): Promise<void> {
    if (!this.stringToBool(this.useProxyBypass)) return;
    if (this.sessionCreated) return;

    try {
      const response = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "sessions.create",
          session: this.sessionId,
        }),
      });
      const data = await response.json();
      if (data.status === "ok") {
        this.sessionCreated = true;
      }
    } catch (error) {
      console.error("[comix.to] Session creation failed:", error);
    }
  }

  private async flareFetch(url: string): Promise<{ ok: boolean; html: string }> {
    if (!this.stringToBool(this.useProxyBypass)) {
      const response = await fetch(url);
      return { ok: response.ok, html: await response.text() };
    }

    await this.ensureSession();

    const body: Record<string, unknown> = {
      cmd: "request.get",
      url,
      maxTimeout: 90000,
      disableMedia: true,
    };

    if (this.sessionCreated) {
      body.session = this.sessionId;
    }

    try {
      const response = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (data.status === "ok" && data.solution) {
        return {
          ok: data.solution.status === 200,
          html: data.solution.response ?? "",
        };
      }

      this.sessionCreated = false;
      try {
        await fetch(`${this.proxyBypassUrl}/v1`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cmd: "sessions.destroy",
            session: this.sessionId,
          }),
        });
      } catch {
        /* ignore */
      }

      await this.ensureSession();
      if (this.sessionCreated) {
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

      return { ok: false, html: "" };
    } catch (error) {
      console.error("[comix.to] Fetch error:", error);
      return { ok: false, html: "" };
    }
  }

  private parseChapterNumber(text: string, fallback: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    const slugMatch = fallback.match(/-chapter-([0-9]+(?:\.[0-9]+)?)/i);
    if (slugMatch?.[1]) {
      return slugMatch[1];
    }

    const titleMatch = normalized.match(/(?:chapter|ch\.)\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (titleMatch?.[1]) {
      return titleMatch[1];
    }

    return normalized || fallback;
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const query = opts.query.trim();
    if (!query) return [];

    const cacheKey = query.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const synonymMatch = this.synonymIndex.get(cacheKey);
    if (synonymMatch) {
      const results = [synonymMatch];
      this.searchCache.set(cacheKey, results);
      return results;
    }

    const searchUrl = new URL("/browse", this.baseUrl);
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("sort", "relevance:desc");

    const { ok, html } = await this.flareFetch(searchUrl.href);
    if (!ok || !html) return [];

    const $ = LoadDoc(html);
    const series: SearchResult[] = [];
    const seen = new Set<string>();

    $("main a[href*='/title/']").each((_i: number, element: any) => {
      const href = element.attr("href")?.trim() ?? "";
      if (!href || seen.has(href)) return;

      const title = element.text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const image =
        element.find("img").attr("data-src")?.trim() ??
        element.find("img").attr("src")?.trim() ??
        "";

      const cardText = element.parent().text().replace(/\s+/g, " ").trim();
      const year = this.parseCardYear(cardText);

      const result: SearchResult = {
        id: this.toPath(href),
        title,
        image,
        year,
      };

      series.push(result);
      seen.add(href);
      this.synonymIndex.set(this.normalizeTitle(title), result);
    });

    series.sort((left, right) => {
      const leftScore = this.scoreSearchResult(left, query, opts.year);
      const rightScore = this.scoreSearchResult(right, query, opts.year);
      if (rightScore !== leftScore) return rightScore - leftScore;
      if ((right.year ?? 0) !== (left.year ?? 0)) return (right.year ?? 0) - (left.year ?? 0);
      return left.title.localeCompare(right.title);
    });

    this.searchCache.set(cacheKey, series);
    return series;
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const chapters: ChapterDetails[] = [];
    const seen = new Set<string>();

    for (let page = 1; page < 1000; page += 1) {
      const { ok, html } = await this.flareFetch(this.getTitleUrl(mangaId, page));
      if (!ok || !html) break;

      const $ = LoadDoc(html);
      let pageCount = 0;

      $("a[href*='/chapter-']").each((_i: number, element: any) => {
        const href = element.attr("href")?.trim() ?? "";
        if (!href) return;

        const id = this.toPath(href);
        if (seen.has(id)) return;

        const title = element.text().replace(/\s+/g, " ").trim();
        if (!title) return;

        const chapter = this.parseChapterNumber(title, id);
        const index = Number.parseFloat(chapter);
        const scanlator = element.parent().find("a[href*='/groups/']").text().replace(/\s+/g, " ").trim();

        chapters.push({
          id,
          url: this.toAbsoluteUrl(id),
          title,
          chapter,
          index: Number.isFinite(index) ? index : chapters.length + 1,
          scanlator: scanlator || undefined,
        });

        seen.add(id);
        pageCount += 1;
      });

      if (pageCount < 20) break;
    }

    chapters.sort((left, right) => left.index - right.index || left.title.localeCompare(right.title));
    return chapters;
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const { ok, html } = await this.flareFetch(this.toAbsoluteUrl(chapterId));
    if (!ok || !html) return [];

    const $ = LoadDoc(html);
    const pages: ChapterPage[] = [];
    const seen = new Set<string>();
    const referer = this.toAbsoluteUrl(chapterId);

    $("img").each((_i: number, element: any) => {
      const imageUrl =
        element.attr("data-src")?.trim() ??
        element.attr("src")?.trim() ??
        "";

      if (!imageUrl || !/wowpic/i.test(imageUrl) || seen.has(imageUrl)) return;

      seen.add(imageUrl);
      pages.push({
        index: pages.length + 1,
        url: new URL(imageUrl, this.baseUrl).href,
        headers: {
          Referer: referer,
        },
      });
    });

    return pages;
  }
}

(globalThis as any).Provider = ComixProvider;
