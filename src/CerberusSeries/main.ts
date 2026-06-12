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
  private webUrl = "https://legionscans.com/wp";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const formData = new FormData();
    formData.append("action", "ts_ac_do_search");
    formData.append("ts_ac_query", opts.query);
    const res = await fetch(`${this.webUrl}/wp-admin/admin-ajax.php`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) return [];

    const data: SerieSearchResponse = await res.json();

    const series = data.series[0].all;

    return series.map((item) => ({
      id: item.post_link.split(this.webUrl)[1],
      title: item.post_title,
      image: item.post_image,
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const res = await fetch(`${this.webUrl}${mangaId}`);

    if (!res.ok) return [];

    const html = await res.text();

    const $ = LoadDoc(html);

    const chapters = [];

    $("ul.clstyle")
      .children("li")
      .each((i, e) => {
        const url = e.find(".eph-num>a").attr("href");
        const id = url.split(this.webUrl)[1];
        const title = e
          .find(".chapternum")
          .text()
          .trim()
          .replace("Chapter", "Capítulo");
        const date = new Date(e.find(".chapterdate").text());

        chapters.push({
          id,
          url,
          title,
          chapter: "",
          updatedAt: date,
        });
      });

    let number = 0;
    return chapters.reverse().map((e, i) => {
      if (!e.id.includes("ex")) number++;

      return {
        ...e,
        chapter: number.toString(),
        index: i,
      };
    });
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await fetch(`${this.webUrl}${chapterId}`);

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
        url,
        headers: {
          Referer: `${this.webUrl}${chapterId}`,
        },
      }));
    } catch (error) {
      return [];
    }
  }
}
