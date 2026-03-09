import { describe, expect, it } from "vitest";
import { parseYahooEarthquakeDetail, parseYahooEarthquakeListEntries } from "../src/sources/yahoo-image-client.js";

describe("Yahoo earthquake parsers", () => {
  it("extracts list entries from Yahoo list HTML", () => {
    const html = `
      <html><body>
        <table>
          <tr>
            <td><a href="/weather/jp/earthquake/20260309113622.html">2026年3月9日 11時36分ごろ</a></td>
            <td>東京都多摩東部</td>
            <td>4.3</td>
            <td>3</td>
          </tr>
        </table>
      </body></html>
    `;

    const entries = parseYahooEarthquakeListEntries(html, "https://typhoon.yahoo.co.jp");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.detailPath).toBe("https://typhoon.yahoo.co.jp/weather/jp/earthquake/20260309113622.html");
    expect(entries[0]?.hypocenterName).toBe("東京都多摩東部");
    expect(entries[0]?.maxIntensity).toBe(30);
  });

  it("extracts image URL from Yahoo detail HTML", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://s.yimg.jp/images/weather/earthquake/20260309113622_point.png" />
        </head>
        <body>
          <img src="https://s.yimg.jp/images/weather/earthquake/20260309113622_point.png" />
        </body>
      </html>
    `;

    const detail = parseYahooEarthquakeDetail(html);
    expect(detail.pointImageUrl).toBe("https://s.yimg.jp/images/weather/earthquake/20260309113622_point.png");
  });
});
