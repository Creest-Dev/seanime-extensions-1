/// <reference path="../manga-provider.d.ts" />

class Provider {
  private baseUrl = "https://mhscans.com";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const res = await fetch(
      `${this.baseUrl}/?s=${encodeURIComponent(opts.query)}&post_type=wp-manga`,
      { headers: { Referer: `${this.baseUrl}/` } },
    );

    if (!res.ok) return [];

    const html = await res.text();

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
    const res = await fetch(`${this.baseUrl}${mangaId}ajax/chapters/?t=1`, {
      method: "POST",
      headers: { Referer: `${this.baseUrl}/` },
    });

    if (!res.ok) return [];

    const html = await res.text();

    const $ = LoadDoc(html);

    const chapters: ChapterDetails[] = [];

    $("li.wp-manga-chapter").each((i, e) => {
      const url = e.children("a").attr("href");
      const id = url.split(this.baseUrl)[1];
      const title = e.children("a").text().trim();
      const titleParts =
        title.match(/Cap[ií]tulo\s+([\d.]+)(?:\s+(.+))?/i) ?? [];
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
    const html = await this.getReadingPageHtml(chapterId);

    if (!html) return [];

    const $ = LoadDoc(html);

    const pages: ChapterPage[] = [];

    $("img.rk-img.h-auto").each((i, e) => {
      pages.push({
        url: e.attr("src"),
        index: i + 1,
      });
    });

    return pages;
  }

  async getReadingPageHtml(chapterId: string): string | null {
    const chapterUrl = `${this.baseUrl}${chapterId}`;
    const resRedirect = await fetch(chapterUrl, {
      headers: { Referer: `${this.baseUrl}/` },
    });

    if (!resRedirect.ok) return [];

    const formHtml = await resRedirect.text();

    const $ = LoadDoc(formHtml);
    const data = {
      actionUrl: $("form#rk_madara_redirect").attr("action"),
      rt: $("input[name=rt]").attr("value"),
      chapter_id: $("input[name=chapter_id]").attr("value"),
      manga_id: $("input[name=manga_id]").attr("value"),
    };

    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.set(key, value.toString());
    });

    const res = await fetch(data.actionUrl, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!res.ok) return null;

    return res.text();
  }
}
