/// <reference path="../manga-provider.d.ts" />

class Provider {
  private useProxyBypass = "true";
  private proxyBypassUrl = "http://127.0.0.1:2344";
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
    const html = await this.htmlFetch(
      `${this.baseUrl}/?s=${encodeURIComponent(opts.query)}&post_type=wp-manga`,
    );

    if (!html) return [];

    const blocks = html.match(
      /<div class="row c-tabs-item__content">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g,
    );
    if (!blocks) return [];

    const searchList: SearchResult[] = [];

    blocks.forEach((block) => {
      // Extraer el slug y title del enlace principal
      const linkMatch = block.match(/<a href="([^"]+)" title="([^"]+)">/);

      // Extraer la URL de la portada
      const imageMatch = block.match(/<img[^>]+src="([^"]+)"/);

      if (linkMatch && imageMatch) {
        const id = linkMatch[1].split(this.baseUrl)[1];
        const title = linkMatch[2];
        const image = imageMatch[1];

        searchList.push({
          id,
          title,
          image,
        });
      }
    });

    return searchList;
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const html = await this.htmlFetch(`${this.baseUrl}${mangaId}`);

    if (!html) return [];

    const $ = LoadDoc(html);

    const chapters: ChapterDetails[] = [];

    $("li.wp-manga-chapter").each((i, e) => {
      const url = e.children("a").attr("href");
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
    const html = await this.htmlFetch(`${this.baseUrl}${chapterId}`);

    if (!html) return [];

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

  private proxyReq(data: string) {
    return fetch(`${this.proxyBypassUrl}/v1`, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: data,
    });
  }

  async htmlFetch(url: string): Promise<string | null> {
    try {
      if (!this.stringToBool(this.useProxyBypass)) {
        const res = await fetch(url);
        if (!res.ok) return null;
        const html = await res.text();
      }
      const series = await this.proxyReq(
        JSON.stringify({
          cmd: "request.get",
          url: url,
          maxTimeout: 60000,
        }),
      );
      const data = await series.json();

      if (data.solution?.cookies) {
        this.cookies = data.solution.cookies
          .map((c: any) => `${c.name}=${c.value}`)
          .join("; ");
      }

      this.userAgent = data.solution.userAgent;

      return data.solution.response;
    } catch (e) {
      console.log(e);
      return null;
    }
  }
}
