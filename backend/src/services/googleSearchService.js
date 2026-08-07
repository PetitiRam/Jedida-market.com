import axios from "axios";

export async function googleSearch(query) {
  try {
    const { data } = await axios.get(
      "https://www.googleapis.com/customsearch/v1",
      {
        params: {
          key: process.env.GOOGLE_SEARCH_API_KEY,
          cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
          q: query,
        },
      }
    );

    return (data.items || []).map((item) => ({
      title: item.title,
      snippet: item.snippet,
      link: item.link,
    }));
  } catch (err) {
    console.error("Google API error:", err.message);
    return [];
  }
}
