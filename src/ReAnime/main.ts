/// <reference path="../online-streaming-provider.d.ts" />

interface ResponseSearch {
  limit: number;
  results: {
    anime_id: string;
    title: {
      english: string;
      native: string;
      romaji: string;
    };
    cover_image: {
      colo: string;
      extra_large: string;
      large: string;
      medium: string;
    };
    episodes: number;
    subbed: number;
    dubbed: number;
  }[];
}

interface RespondeEpisodes {
  anime: {
    anilist_id: number;
  };
  episodes: {
    data: {
      aired: string;
      episode_number: number;
      title: string;
    }[];
  };
}

interface RespondeEpisodesServers {
  servers: {
    $id: string;
    serverName: string;
    dataLink: string;
    dataType: "sub" | "dub";
  }[];
}

class Provider {
  private baseUrl = "https://reanime.to";

  getSettings(): Settings {
    return {
      episodeServers: ["HD-1", "HD-2"],
      supportsDub: true,
    };
  }

  async search(query: SearchOptions): Promise<SearchResult[]> {
    const res = await fetch(
      `${this.baseUrl}/api/search?limit=36&q=${query.query.trim()}`,
    );
    if (!res.ok) return [];

    const data: ResponseSearch = await res.json(); // ?

    return data.results.map((item) => ({
      id: item.anime_id,
      title: item.title.english ?? item.title.romaji,
      url: `${this.baseUrl}/anime/${item.anime_id}`,
      subOrDub:
        item.subbed > 0 && item.dubbed > 0
          ? "both"
          : item.dubbed > 0
            ? "dub"
            : "sub",
    }));
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    const res = await fetch(
      `${this.baseUrl}/anime/${id}/__data.json?x-appkit-invalidated=01`,
    );
    if (!res.ok) return [];

    const data = await res.json();

    const decodeData: RespondeEpisodes = this.parseSvelteKitDataJson(data)[1];

    return decodeData.episodes.data.map((ep) => ({
      id: `${decodeData.anime.anilist_id}_$_${id}?ep=${ep.episode_number}`,
      number: ep.episode_number,
      url: `${this.baseUrl}/watch/${id}?ep=${ep.episode_number}`,
      title: ep.title,
    }));
  }

  async findEpisodeServer(
    episode: EpisodeDetails,
    _server: string,
  ): Promise<EpisodeServer> {
    let server = "HD-1";
    if (_server !== "default") server = _server;

    const anilistId = episode.id.split("_$_")[0];
    const res = await fetch(
      `${this.baseUrl}/api/flix/${anilistId}/${episode.number}`,
    );
    if (!res.ok) {
      return {
        server,
        headers: {},
        videoSources: [],
      };
    }

    const data: RespondeEpisodesServers = await res.json(); // ?

    return {
      server: server,
      headers: {},
      videoSources: data.servers.map((server) => ({
        url: server.dataLink,
        type: "unknown",
        quality: "1080p",
        subtitles: [],
      })),
    };
  }

  decodeSvelteKitData(data) {
    function resolve(index) {
      const val = data[index];

      if (val === null || val === undefined) return val;

      if (Array.isArray(val)) {
        return val.map((i) => resolve(i));
      }

      if (typeof val === "object") {
        const result = {};
        for (const [k, v] of Object.entries(val)) {
          // la key puede ser un índice (string numérica) o literal
          const resolvedKey = typeof data[k] === "string" ? data[k] : k;
          result[resolvedKey] = resolve(v);
        }
        return result;
      }

      // primitivo: string, number, boolean
      return val;
    }

    return resolve(0);
  }

  parseSvelteKitDataJson(json) {
    return json.nodes
      .filter((node) => node !== null && node.type === "data")
      .map((node) => this.decodeSvelteKitData(node.data));
  }
}
