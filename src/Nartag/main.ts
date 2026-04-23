/// <reference path="../manga-provider.d.ts" />

class Provider {
  private baseUrl = "https://nartag.com";

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
    // mangaId es la URL relativa, ej: "/manga/solo-leveling/"
    const res = await fetch(`${this.baseUrl}${mangaId}ajax/chapters/?t=1`, {
      method: "POST",
      headers: { Referer: `${this.baseUrl}/` },
    });
    const html = await res.text();

    // Usar una sola regex para capturar todo de una vez
    // Busca: <li class="wp-manga-chapter...">...<a href="URL">...TEXTO...</a>...</li>
    const chapterRegex =
      /<li[^>]*class="[^"]*wp-manga-chapter[^"]*"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>[\s]*([^<]+)[\s]*<\/a>[\s\S]*?<\/li>/gi;

    let match;
    let index = 0;
    // Guardar todos los matches
    const matches: ChapterDetails[] = [];
    while ((match = chapterRegex.exec(html)) !== null) {
      const id = match[1].split(this.baseUrl)[1];
      const title = match[2].trim();
      const titleParts =
        title.match(/Cap[ií]tulo\s+([\d.]+)(?:\s+(.+))?/i) ?? [];
      const chapter = titleParts[1] ?? "0";
      const url = match[1];
      index = parseInt(chapter);

      matches.push({
        id,
        title,
        chapter,
        url,
        index,
      });
    }

    return matches;
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await fetch(`${this.baseUrl}${chapterId}`, {
      headers: { Referer: `${this.baseUrl}/` },
    });
    const html = await res.text();

    const regexSrc = /<img[^>]*src="([^"]*)"[^>]*>/gi;
    const listPages = [...html.matchAll(regexSrc)].map((match) => match[1]);

    return listPages
      .filter((url) => url.includes("/WP-manga/"))
      .map((match, index) => ({
        url: match.trim(),
        index: index + 1,
        headers: { Referer: `${this.baseUrl}/` },
      }));
  }
}
