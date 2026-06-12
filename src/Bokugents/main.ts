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

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const data = await this.searchFetch(opts);

    if (!data) return [];

    const series = data.series[0].all;
    return series.map((item) => ({
      id: item.post_link.split(this.webUrl)[1],
      title: item.post_title,
      image: item.post_image,
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const html = await this.findFetch(mangaId);
    if (!html) return [];

    const $ = LoadDoc(html);

    const chapters = [];
    $("#chapterlist>ul")
      .children("li")
      .each((i, e) => {
        const url = e.find(".eph-num>a").attr("href");
        const id = url.split(this.webUrl)[1];
        const title = e
          .find(".chapternum")
          .text()
          .trim()
          .replace("Chapter", "Capítulo");
        const chapter = e.attr("data-num");
        const updatedAt = new Date(e.find(".chapterdate").text());

        chapters.push({
          id,
          url,
          title,
          chapter,
          updatedAt,
        });
      });

    let number = 0;
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
        url,
        headers: {
          Referer: `${this.webUrl}${chapterId}`,
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

  async searchFetch(opts: QueryOptions): SerieSearchResponse | null {
    const url = `${this.webUrl}/wp-admin/admin-ajax.php`;
    try {
      if (!this.useProxyBypass) {
        const formData = new FormData();
        formData.append("action", "ts_ac_do_search");
        formData.append("ts_ac_query", opts.query.trim());

        const res = await fetch(url, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) return [];

        const data: SerieSearchResponse = await res.json();
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

      const $ = cheerio.load(html);

      const json = $("body").text();

      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async findFetch(id: string): string | null {
    const url = `${this.webUrl}${id}`;
    try {
      if (!this.useProxyBypass) {
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
      return data.solution.response;
    } catch {
      return null;
    }
  }
}
