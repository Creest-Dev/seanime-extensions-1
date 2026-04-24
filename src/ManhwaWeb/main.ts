/// <reference path="../manga-provider.d.ts" />

class Provider {
  private webUrl = "https://manhwaweb.com";
  private baseUrl = "https://manhwawebbackend-production.up.railway.app";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const requestRes = await fetch(
      `${this.baseUrl}/manhwa/library?buscar=${encodeURIComponent(opts.query)}&estado=&tipo=&erotico=&demografia=&order_item=alfabetico&order_dir=desc&page=0&generes=`,
      {
        method: "get",
      },
    );

    if (!requestRes.ok) return [];

    const json = await requestRes.json();

    if (!json?.data) return [];

    return json.data.map((item: any) => ({
      id: `${item._id}/${item.real_id}`,
      title: item.the_real_name || "Sin título",
      synonyms: [item.real_id].filter(Boolean),
      year: null, // No viene en los datos
      image: item._imagen || "",
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const request = (slug: string) =>
      fetch(`${this.baseUrl}/manhwa/see/${slug}`, {
        method: "get",
      });

    let response;
    const slugs = mangaId.split("/");
    let slug = slugs[0];
    for (let i = 0; i < slugs.length; i++) {
      response = await request(slugs[i]);
      if (response.ok) {
        slug = slugs[i];
        break;
      }
    }

    if (!response || !response.ok) return [];

    const json = await response.json();

    if (!json?.chapters) return [];

    return json.chapters.map((ch: any, index: number) => ({
      id: `${slug}-${ch.chapter}`,
      url: `${this.webUrl}/leer/${slug}-${ch.chapter}`,
      title: `Capítulo ${ch.chapter}`,
      chapter: String(ch.chapter),
      index,
    }));
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const requestRes = await fetch(
      `${this.baseUrl}/chapters/see/${chapterId}`,
      {
        method: "get",
      },
    );

    if (!requestRes.ok) return [];

    const json = await requestRes.json();

    if (!json?.chapter?.img) return [];

    return json.chapter.img.map((url: string, index: number) => ({
      url,
      index,
      headers: {
        Referer: this.webUrl,
      },
    }));
  }
}
