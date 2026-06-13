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
  private webUrl = "https://bokugents.com";
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
    const data = await this.searchFetch(opts);

    if (!data) return [];

    const series = data.series[0].all;
    return series.map((item) => ({
      id: item.post_link.split(this.webUrl)[1],
      title: item.post_title,
      image: new URL(
        `${item.post_image}&headers=${JSON.stringify({
          Referer: `${this.webUrl}`,
          "User-Agent": this.userAgent,
          Cookie: this.cookies,
        })}`,
      ).href,
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const html = await this.findFetch(mangaId);
    if (!html) return [];

    const $ = LoadDoc(html);

    const chapters: ChapterDetails[] = [];
    $("#chapterlist>ul")
      .children("li")
      .each((i, e) => {
        const url = e.find(".eph-num>a").attr("href")?.trim() ?? "";
        const id = url.split(this.webUrl)[1];
        const title = e
          .find(".chapternum")
          .text()
          .trim()
          .replace("Chapter", "Capítulo");
        const chapter = e.attr("data-num");
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
    const html = await this.findFetch(chapterId);
    if (!html) return [];

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
          Referer: `${this.webUrl}${chapterId}`,
          "User-Agent": this.userAgent,
          Cookie: this.cookies,
        },
      }));
    } catch (error) {
      return [];
    }
  }

  private proxyReq(data: string) {
    return fetch(`${this.proxyBypassUrl}/v1`, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: data,
    });
  }

  async searchFetch(opts: QueryOptions): Promise<SerieSearchResponse | null> {
    const url = `${this.webUrl}/wp-admin/admin-ajax.php`;
    try {
      if (!this.stringToBool(this.useProxyBypass)) {
        const formData = new FormData();
        formData.append("action", "ts_ac_do_search");
        formData.append("ts_ac_query", opts.query.trim());

        const res = await fetch(url, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) return null;

        const data: SerieSearchResponse = await res.json();
        return data;
      }
      const data = await this.proxyReq(
        JSON.stringify({
          cmd: "request.post",
          url: url,
          maxTimeout: 60000,
          postData: `action=ts_ac_do_search&ts_ac_query=${opts.query.trim()}`,
        }),
      );
      const res = await data.json();
      const html = res.solution.response;

      this.cookies = res.solution.cookies
        .map((c: any) => `${c.name}=${c.value}`)
        .join("; ");

      this.userAgent = res.solution.userAgent;

      const $ = LoadDoc(html);

      const json = $("body").text();

      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async findFetch(id: string): Promise<string | null> {
    const url = `${this.webUrl}${id}`;
    try {
      if (!this.stringToBool(this.useProxyBypass)) {
        const res = await fetch(url);
        if (!res.ok) return null;
        return res.text();
      }
      const series = await this.proxyReq(
        JSON.stringify({
          cmd: "request.get",
          url: url,
          maxTimeout: 60000,
        }),
      );
      const data = await series.json();

      this.cookies = data.solution.cookies
        .map((c: any) => `${c.name}=${c.value}`)
        .join("; ");

      this.userAgent = data.solution.userAgent;

      return data.solution.response;
    } catch {
      return null;
    }
  }
}
