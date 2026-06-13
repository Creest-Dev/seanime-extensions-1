/// <reference path="../manga-provider.d.ts" />

class Provider {
  private useProxyBypass = "{{useProxyBypass}}";
  private proxyBypassUrl = "{{proxyBypassUrl}}";
  private baseUrl = "https://www.toongod.org";
  private cookies = "";
  private userAgent = "";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  private stringToBool(str: string): boolean {
    return str.toLowerCase() === "true";
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const res = await this.safeFetch(
      `${this.baseUrl}/?s=${opts.query.trim().replaceAll(" ", "+")}&post_type=wp-manga`,
    );

    if (!res.ok) return [];

    const html = res.text();

    const $ = LoadDoc(html);

    const series: SearchResult[] = [];

    $(".page-content-listing")
      .children(".row.c-tabs-item__content")
      .each((i, e) => {
        const url = e.find(".tab-thumb a").attr("href")?.trim() ?? "";
        const id = url.split(this.baseUrl)[1];
        const title = e.find(".post-title").text().trim();
        const image = e.find(".tab-thumb img").attr("data-src")?.trim() ?? "";
        const year = e
          .find(".post-content_item.mg_release .summary-content")
          .text()
          ?.trim();
        const synonymsText = e
          .find(".post-content_item.mg_alternative .summary-content")
          .text()
          ?.trim()
          .split(";");

        series.push({
          id,
          title,
          synonyms: synonymsText.map((i) => i.trim()),
          year: year ? parseInt(year) : undefined,
          image: new URL(
            `${image}&headers=${JSON.stringify({
              Referer: `${this.baseUrl}`,
              "User-Agent": this.userAgent,
              Cookie: this.cookies,
            })}`,
          ).href,
        });
      });

    return series;
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const res = await this.safeFetch(`${this.baseUrl}${mangaId}`);
    if (!res.ok) return [];

    const html = res.text();

    const $ = LoadDoc(html);

    const chapters: ChapterDetails[] = [];

    $("li.wp-manga-chapter").each((i, e) => {
      const url = e.children("a").attr("href")?.trim() ?? "";
      const id = url.split(this.baseUrl)[1];
      const title = e.children("a").text().trim();
      const titleParts = title.match(/Chapter\s+([\d.]+)(?:\s+(.+))?/i) ?? [];
      const chapter = titleParts[1] ?? "0";
      const index = parseInt(chapter);

      chapters.push({
        id,
        title,
        chapter,
        url,
        index,
      });
    });

    return chapters.reverse();
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await this.safeFetch(`${this.baseUrl}${chapterId}`);
    if (!res.ok) return [];

    const html = res.text();

    const $ = LoadDoc(html);

    const pages: ChapterPage[] = [];

    $(".reading-content")
      .children(".page-break")
      .each((i, e) => {
        const url = e.children("img").attr("data-src").trim();

        pages.push({
          index: i + 1,
          url: new URL(url).href,
          headers: {
            Referer: `${this.baseUrl}${chapterId}`,
            "User-Agent": this.userAgent,
            Cookie: this.cookies,
          },
        });
      });

    return pages;
  }

  private async getValidSessionHeaders(): Promise<void> {
    try {
      const res = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url: `${this.baseUrl}/wp-content/uploads/2020/09/toongod-logo.png`,
          maxTimeout: 60000,
        }),
      });
      const data = await res.json();

      if (data.solution?.cookies) {
        this.cookies = data.solution.cookies
          .map((c: any) => `${c.name}=${c.value}`)
          .join("; ");
      }

      if (data.solution?.userAgent) {
        this.userAgent = data.solution.userAgent;
      }

      return;
    } catch (e) {
      console.error(e);
      return;
    }
  }

  private async safeFetch(
    input: string | URL | Request,
    init?: RequestInit | undefined = { headers: {} },
  ): Promise<Response> {
    if (this.stringToBool(this.useProxyBypass)) {
      await this.getValidSessionHeaders();
      this.useProxyBypass = "false";
    }
    const fetchOptions = {
      ...init,
      headers: {
        ...init?.headers,
        "User-Agent": this.userAgent,
        Cookie: this.cookies,
      },
    };
    return fetch(input, fetchOptions);
  }
}
