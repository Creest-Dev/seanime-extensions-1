/// <reference path="../manga-provider.d.ts" />

class Provider {
  private baseUrl = "https://www.leercapitulo.co";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const res = await fetch(
      `${this.baseUrl}/search-autocomplete?term=${encodeURIComponent(opts.query)}`,
      { headers: { Referer: `${this.baseUrl}/` } },
    );

    if (!res.ok) return [];

    const json = await res.json();

    return json.map((item: any) => ({
      id: item.link,
      title: item.label,
      image: this.baseUrl + item.thumbnail,
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const res = await fetch(`${this.baseUrl}${mangaId}`, {
      headers: { Referer: `${this.baseUrl}/` },
    });

    if (!res.ok) return [];

    const html = await res.text();

    const listMatch = html.match(
      /<div[^>]*class="chapter-list"[^>]*>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i,
    );

    if (!listMatch) return [];

    const listHtml = listMatch[1].replace(/\s+/g, " ");
    const liMatches = [
      ...listHtml.matchAll(/<li[^>]*>(.*?)<\/li>/gs),
    ].reverse();

    const chapters: ChapterDetails[] = [];
    let index = 0;

    liMatches.forEach((match) => {
      const block = match[1];

      const hrefMatch = block.match(/href="([^"]+)"/);
      const titleMatch = block.match(/>([^<]+)<\/a>/);

      if (!hrefMatch) return;

      const url = hrefMatch[1];
      const title = titleMatch ? titleMatch[1].trim() : "";
      const urlSplite = url.split("/");
      const number = urlSplite[urlSplite.length - 2];
      if (index === 0) {
        index = parseInt(number);
      }

      chapters.push({
        id: url,
        url: this.baseUrl + url,
        title,
        chapter: String(number),
        index,
      });

      index++;
    });

    return chapters;
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await fetch(`${this.baseUrl}${chapterId}`, {
      headers: { Referer: `${this.baseUrl}/` },
    });

    if (!res.ok) return [];

    const html = await res.text();

    const arrayDataMatch = html.match(/id="array_data"[^>]*>([^<]+)</);
    const arrayData = (arrayDataMatch ? arrayDataMatch[1] : "").trim();

    const urlList = this.decodeArrayData(arrayData);

    // 🔹 2. Obtener ad:check (orden real)
    const orderMetaMatch = html.match(/property="ad:check" content="([^"]+)"/);
    const orderRaw = orderMetaMatch ? orderMetaMatch[1] : null;

    let sortedUrls = urlList;

    if (orderRaw) {
      const orderList = orderRaw
        .replace(/[^\d]+/g, "-")
        .split("-")
        .filter(Boolean);

      const useReversed = orderList.some((x) => x === "01");

      sortedUrls = orderList
        .map((i) => {
          const index = useReversed
            ? parseInt(i.split("").reverse().join(""), 10)
            : parseInt(i, 10);

          return urlList[index];
        })
        .filter(Boolean) // evita undefined si algo falla
        .reverse();
    }

    return sortedUrls.map((url, index) => ({
      url,
      index,
      headers: { Referer: `${this.baseUrl}/` },
    }));
  }

  decodeArrayData(arrayData: string): string[] {
    const mapK2toK1 = new Map([
      ["0", "w"],
      ["1", "j"],
      ["2", "H"],
      ["3", "A"],
      ["4", "V"],
      ["5", "Q"],
      ["6", "P"],
      ["7", "3"],
      ["8", "L"],
      ["9", "Y"],

      ["A", "m"],
      ["B", "t"],
      ["C", "R"],
      ["D", "o"],
      ["E", "B"],
      ["F", "x"],
      ["G", "T"],
      ["H", "C"],
      ["I", "N"],
      ["J", "0"],
      ["K", "S"],
      ["L", "D"],
      ["M", "f"],
      ["N", "F"],
      ["O", "y"],
      ["P", "h"],
      ["Q", "7"],
      ["R", "c"],
      ["S", "s"],
      ["T", "d"],
      ["U", "9"],
      ["V", "e"],
      ["W", "J"],
      ["X", "z"],
      ["Y", "X"],
      ["Z", "b"],

      ["a", "a"],
      ["b", "I"],
      ["c", "q"],
      ["d", "G"],
      ["e", "n"],
      ["f", "2"],
      ["g", "Z"],
      ["h", "M"],
      ["i", "5"],
      ["j", "6"],
      ["k", "u"],
      ["l", "O"],
      ["m", "i"],
      ["n", "l"],
      ["o", "g"],
      ["p", "r"],
      ["q", "K"],
      ["r", "v"],
      ["s", "p"],
      ["t", "8"],
      ["u", "4"],
      ["v", "U"],
      ["w", "W"],
      ["x", "E"],
      ["y", "1"],
      ["z", "k"],
    ]);
    const replaced = arrayData.replace(/[A-Za-z0-9]/g, (ch) => {
      return mapK2toK1.get(ch) || ch;
    });

    let decoded;
    try {
      decoded = Buffer.from(replaced, "base64").toString();
    } catch (e) {
      return [];
    }

    return decoded
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
}
