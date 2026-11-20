
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
        ...new Set(found.map(url => url.replace(/[),.!?;:]+$/g, "")))
      ].slice(0, 50);

      if (!urls.length) return new Response("OK");

      if (
        !env.GOOGLE_SAFE_BROWSING_KEY ||
        !env.TELEGRAM_BOT_TOKEN ||
        !env.TELEGRAM_CHAT_ID
      ) {
        throw new Error("Secret Google atau Telegram belum lengkap.");
      }

      const sender = message.from.username
        ? "@" + message.from.username
        : message.from.first_name || "Pengguna";

      const results = [];

      for (const link of urls) {
        try {
          const apiUrl = new URL(
            "https://safebrowsing.googleapis.com/v4/threatMatches:find"
          );

          apiUrl.searchParams.set(
            "key",
            env.GOOGLE_SAFE_BROWSING_KEY
          );

          const response = await fetch(apiUrl.toString(), {
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
            })
          });

          const raw = await response.text();
          let data;

          try {
            data = JSON.parse(raw);
          } catch {
            throw new Error(
              "Respons Google tidak valid. HTTP " + response.status
            );
          }

          if (!response.ok) {
            throw new Error(
              "Google API HTTP " + response.status +
              ": " + (data.error?.message || raw.slice(0, 300))
            );
          }

          const matches = data.matches || [];

          if (matches.length > 0) {
            const types = [
              ...new Set(matches.map(item => item.threatType))
            ];

            results.push(
              "BERBAHAYA\n" + link +
              "\nJenis ancaman: " + types.join(", ")
            );
          } else {
            results.push(
              "TIDAK DITEMUKAN DALAM DAFTAR ANCAMAN GOOGLE\n" +
              link +
              "\nCatatan: Bukan jaminan 100% aman."
            );
          }
        } catch (error) {
          results.push(
            "GAGAL DIPERIKSA\n" + link +
            "\nPenyebab: " + String(error.message || error)
          );
        }
      }

      const report =
        "HASIL PEMERIKSAAN LINK\n\n" +
        "Pengirim: " + sender + "\n\n" +
        results.join("\n\n");

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
        throw new Error(
          "Telegram gagal mengirim: " +
          await telegramResponse.text()
        );
      }

      return new Response("OK");
    } catch (error) {
      return new Response(
        "Worker error: " + String(error.message || error),
        { status: 500 }
      );
    }
  }
};
