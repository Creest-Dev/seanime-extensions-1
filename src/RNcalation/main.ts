/// <reference path="../manga-provider.d.ts" />

class Provider {
  private baseUrl = "https://rncalation.online";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: true,
    };
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const res = await fetch(`${this.baseUrl}/search?q=${opts.query.trim()}`);
    if (!res.ok) return [];

    const html = await res.text();

    const $ = LoadDoc(html);

    const titles = [];

    $(".lib-grid")
      .children("a")
      .each((i, e) => {
        const id = e.attr("href").trim();
        const title = e
          .find("p.font-semibold.leading-snug.line-clamp-2")
          .text()
          .trim();
        const image = this.baseUrl + e.find("img.card-media").attr("src");

        titles.push({
          id,
          title,
          image,
        });
      });

    return titles;
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const res = await fetch(`${this.baseUrl}${mangaId}`);

    if (!res.ok) return [];

    const html = await res.text();

    const $ = LoadDoc(html);

    const first = this.formatChapters($("#chapter-list").html());
    const second = this.formatChapters($("template").html());

    return first.concat(second).reverse();
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await fetch(`${this.baseUrl}${chapterId}`);

    if (!res.ok) return [];

    const html = await res.text();

    const $ = LoadDoc(html);

    const pages: ChapterPage[] = [];

    $('div[class*="mx-auto"][class*="flex"][class*="flex-col"]')
      .children("div.page-wrap")
      .map((i, e) => {
        const dataUrl = e.children(".page-img").attr("data-src");
        const url = e.children(".page-img").attr("src");

        pages.push({
          url: url ?? dataUrl,
          index: i + 1,
          headers: { Referer: `${this.baseUrl}${chapterId}` },
        });
      });

    return pages;
  }

  private formatChapters(html): ChapterDetails[] {
    const $ = LoadDoc(html);
    const items: ChapterDetails[] = [];

    $("a").each((i, e) => {
      const url = e.attr("href");
      const cont = e
        .find('span[class*="flex-1"][class*="text-sm"]')
        .text()
        .trim();
      const number = parseInt(cont.split(":")[0]?.split(" ")[1]);
      const date = e
        .find('span[class*="hidden"][class*="shrink-0"]')
        .text()
        .trim();
      const scan = e
        .find('span[class*="text-[.7rem]"][class*="sm:block"]')
        .text();

      items.push({
        id: url,
        url: `${this.baseUrl}${url}`,
        title: cont,
        chapter: number.toString(),
        index: number,
        scanlator: scan,
        updatedAt: new Date(date),
      });
    });

    return items;
  }
}
