/// <reference path="../manga-provider.d.ts" />
interface SerieSearchResponse {
  series: {
    all: {
      post_image: string;
      post_title: string;
      post_link: string;
    }[];
  }[];
}

class Provider {
  private useProxyBypass = "{{useProxyBypass}}";
  private proxyBypassUrl = "{{proxyBypassUrl}}";
  private baseUrl = "https://bokugents.com";
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
    const formData = new FormData();
    formData.append("action", "ts_ac_do_search");
    formData.append("ts_ac_query", opts.query.trim());

    const res = await this.safeFetch(
      `${this.baseUrl}/wp-admin/admin-ajax.php`,
      {
        method: "POST",
        body: formData,
      },
    );

    if (!res.ok) return [];

    const data: SerieSearchResponse = await res.json();

    const series = data.series[0].all;
    return series.map((item) => ({
      id: item.post_link.split(this.baseUrl)[1],
      title: item.post_title,
      image: new URL(
        `${item.post_image}&headers=${JSON.stringify({
          Referer: `${this.baseUrl}`,
          "User-Agent": this.userAgent,
          Cookie: this.cookies,
        })}`,
      ).href,
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const res = await this.safeFetch(`${this.baseUrl}${mangaId}`);

    if (!res.ok) return [];

    const html = await res.text();

    const $ = LoadDoc(html);

    const chapters: ChapterDetails[] = [];
    $("#chapterlist>ul")
      .children("li")
      .each((i, e) => {
        const url = e.find(".eph-num>a").attr("href")?.trim() ?? "";
        const id = url.split(this.baseUrl)[1];
        const title = e
          .find(".chapternum")
          .text()
          .trim()
          .replace("Chapter", "Capítulo");
        const chapter = e.attr("data-num")?.trim() ?? "";
        const updatedAt = new Date(e.find(".chapterdate").text()).toString();

        chapters.push({
          id,
          url,
          title,
          chapter,
          updatedAt,
          index: i,
        });
      });

    return chapters.reverse().map((e, i) => {
      return {
        ...e,
        index: i,
      };
    });
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await this.safeFetch(`${this.baseUrl}${chapterId}`);

    if (!res.ok) return [];

    const html = await res.text();

    const sourcesRegex = /"sources":\s*(\[[\s\S]*?\})\s*\]/;
    const match = html.match(sourcesRegex);
    if (!match || !match[1]) return [];
    try {
      // Parsear el JSON capturado
      const sourcesJson = match[1] + "]";
      const sources: { source: string; images: string[] }[] =
        JSON.parse(sourcesJson);
      return sources[0].images.map((url, index) => ({
        index,
        url: new URL(url).href,
        headers: {
          Referer: `${this.baseUrl}${chapterId}`,
          "User-Agent": this.userAgent,
          Cookie: this.cookies,
        },
      }));
    } catch (error) {
      return [];
    }
  }

  private async getValidSessionHeaders(): Promise<void> {
    try {
      const res = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url: `${this.baseUrl}/wp-content/uploads/2026/03/Logoboku.png`,
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
    init: RequestInit | undefined = { headers: {} },
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
