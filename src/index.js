
const JUDI_STRONG = [
  "judi online", "judi togel", "togel online",
  "slot online", "casino online", "kasino online",
  "taruhan online", "sportsbook", "agen togel",
  "situs togel", "situs slot", "bet online",
  "bandar togel", "live casino"
];

const JUDI_SUPPORT = [
  "deposit", "withdraw", "jackpot", "maxwin",
  "rtp slot", "spin slot", "bonus member",
  "daftar slot", "bocoran togel", "pasaran togel",
  "pragmatic play", "mahjong ways", "pola slot",
  "taruhan bola"
];

function cleanText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function inspectJudi(domain, content) {
  const text = (domain + " " + content).toLowerCase();

  const strong = JUDI_STRONG.filter(word =>
    text.includes(word)
  );

  const supporting = JUDI_SUPPORT.filter(word =>
    text.includes(word)
  );

  return {
    detected: strong.length >= 1 || supporting.length >= 3,
    strong,
    supporting
  };
}

// Memeriksa URL agar tidak mengarah ke alamat lokal/privat.
function validateUrl(url) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Protokol URL tidak diizinkan.");
  }

  if (
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  ) {
    throw new Error("Format URL tidak diizinkan.");
  }

  const host = url.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host.startsWith("[")
  ) {
    throw new Error("Alamat lokal atau privat tidak diizinkan.");
  }

  // Blokir alamat IPv4 privat dan alamat khusus.
  const parts = host.split(".");

  if (
    parts.length === 4 &&
    parts.every(part => /^\d+$/.test(part))
  ) {
    const ip = parts.map(Number);

    if (
      ip.some(n => n < 0 || n > 255) ||
      ip[0] === 0 ||
      ip[0] === 10 ||
      ip[0] === 127 ||
      ip[0] >= 224 ||
      (ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127) ||
      (ip[0] === 169 && ip[1] === 254) ||
      (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) ||
      (ip[0] === 192 && ip[1] === 168)
    ) {
      throw new Error("Alamat IP privat atau khusus tidak diizinkan.");
    }
  }

  return url;
}

async function inspectWebsite(link) {
  let current = validateUrl(new URL(link));

  for (let i = 0; i < 4; i++) {
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "GoogleLinkReporter/1.0",
        "Accept": "text/html"
      },
      signal: AbortSignal.timeout(8000)
    });

    // Ikuti redirect, tetapi periksa alamat tujuan terlebih dahulu.
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error("Redirect tidak memiliki alamat tujuan.");
      }

      const next = validateUrl(new URL(location, current));
      current = next;
      continue;
    }

    const status = response.status;

    const statusLabel =
      status >= 400
        ? "HALAMAN ERROR"
        : "AKTIF";

    const contentType =
      response.headers.get("content-type") || "";

    let content = "";

    if (
      contentType.toLowerCase().includes("text/html") &&
      response.body
    ) {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;

      while (total < 150000) {
        const { done, value } = await reader.read();

        if (done) break;

        const remaining = 150000 - total;
        const chunk = value.slice(0, remaining);

        chunks.push(chunk);
        total += chunk.length;

        if (chunk.length < value.length) break;
      }

      await reader.cancel().catch(() => {});

      const bytes = new Uint8Array(total);
      let offset = 0;

      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }

      content = cleanText(
        new TextDecoder().decode(bytes)
      );
    }

    return {
      domain: current.hostname,
      finalUrl: current.toString(),
      content,
      httpStatus: status,
      statusLabel,
      isHtml: contentType.toLowerCase().includes("text/html")
    };
  }

  throw new Error("Terlalu banyak redirect.");
}

async function checkGoogle(link, key) {
  const endpoint = new URL(
    "https://safebrowsing.googleapis.com/v4/threatMatches:find"
  );

  endpoint.searchParams.set("key", key);

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client: {
        clientId: "google-link-reporter",
        clientVersion: "1.0"
      },
      threatInfo: {
        threatTypes: [
          "MALWARE",
          "SOCIAL_ENGINEERING",
          "UNWANTED_SOFTWARE"
        ],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url: link }]
      }
    }),
    signal: AbortSignal.timeout(10000)
  });

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Respons Google tidak valid.");
  }

  if (!response.ok) {
    throw new Error(
      "Google HTTP " + response.status + ": " +
      (data.error?.message || "Permintaan gagal")
    );
  }

  return data.matches || [];
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Google Link Reporter Aktif!");
    }

    try {
      const update = await request.json();
      const message = update.message;

      if (
        !message ||
        message.chat.type !== "private" ||
        !message.text
      ) {
        return new Response("OK");
      }

      const found =
        message.text.match(/https?:\/\/[^\s<>"']+/gi) || [];

      const urls = [
        ...new Set(
          found.map(url => url.replace(/[),.!?;:]+$/g, ""))
        )
      ].slice(0, 10);

      if (!urls.length) return new Response("OK");

      if (
        !env.GOOGLE_SAFE_BROWSING_KEY ||
        !env.TELEGRAM_BOT_TOKEN ||
        !env.TELEGRAM_CHAT_ID
      ) {
        throw new Error("Secret belum lengkap.");
      }

      const sender = message.from.username
        ? "@" + message.from.username
        : message.from.first_name || "Pengguna";

      const results = [];

      for (const link of urls) {
        const details = ["LINK: " + link];

        // Google Safe Browsing
        try {
          const matches = await checkGoogle(
            link,
            env.GOOGLE_SAFE_BROWSING_KEY
          );

          if (matches.length > 0) {
            const types = [
              ...new Set(matches.map(item => item.threatType))
            ];

            details.push(
              "GOOGLE SAFE BROWSING: BERBAHAYA",
              "Jenis ancaman: " + types.join(", ")
            );
          } else {
            details.push(
              "GOOGLE SAFE BROWSING: Tidak ditemukan dalam daftar ancaman"
            );
          }
        } catch (error) {
          details.push(
            "GOOGLE SAFE BROWSING: GAGAL DIPERIKSA",
            "Keterangan: " + error.message
          );
        }

        // Pemeriksaan status domain dan halaman
        try {
          const page = await inspectWebsite(link);

          details.push(
            "STATUS DOMAIN: " + page.statusLabel,
            "HTTP STATUS: " + page.httpStatus,
            "DOMAIN AKHIR: " + page.domain
          );

          if (page.statusLabel === "HALAMAN ERROR") {
            details.push(
              "Keterangan: Domain merespons, tetapi halaman memberikan error."
            );
          }

          // Deteksi indikasi judi online
          if (page.isHtml) {
            const judi = inspectJudi(
              page.domain,
              page.content
            );

            if (judi.detected) {
              details.push(
                "KLASIFIKASI: DUGAAN JUDI ONLINE",
                "Indikator: " +
                [...judi.strong, ...judi.supporting].join(", ")
              );
            } else {
              details.push(
                "KLASIFIKASI: Tidak ditemukan indikasi kuat judi online"
              );
            }

            details.push(
              "PEMERIKSAAN WEBSITE: Berhasil membaca halaman"
            );
          } else {
            details.push(
              "PEMERIKSAAN WEBSITE: Halaman bukan HTML",
              "KLASIFIKASI JUDI: Belum dapat dipastikan"
            );
          }
        } catch (error) {
          details.push(
            "STATUS DOMAIN: TIDAK DAPAT DIAKSES",
            "PEMERIKSAAN WEBSITE: GAGAL",
            "Keterangan: " + error.message,
            "KLASIFIKASI JUDI: Belum dapat dipastikan"
          );
        }

        results.push(details.join("\n"));
      }

      const report =
        "GOOGLE LINK REPORTER\n\n" +
        "Pengirim: " + sender + "\n" +
        "Jumlah link: " + urls.length + "\n\n" +
        results.join("\n\n--------------------\n\n");

      const telegramResponse = await fetch(
        "https://api.telegram.org/bot" +
        env.TELEGRAM_BOT_TOKEN +
        "/sendMessage",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: report.slice(0, 4000)
          })
        }
      );

      if (!telegramResponse.ok) {
        throw new Error("Telegram gagal mengirim laporan.");
      }

      return new Response("OK");
    } catch (error) {
      return new Response(
        "Worker error: " + error.message,
        { status: 500 }
      );
    }
  }
};
