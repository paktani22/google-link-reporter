
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

      const found = message.text.match(/https?:\/\/[^\s<>"']+/gi) || [];
      const urls = [...new Set(
        found.map(url => url.replace(/[),.!?;:]+$/g, ""))
      )].slice(0, 50);

      if (urls.length === 0) {
        return new Response("Tidak ada link");
      }

      const sender = message.from.username
        ? "@" + message.from.username
        : message.from.first_name || "Pengguna";

      const results = [];

      for (const link of urls) {
        try {
          const apiUrl = new URL(
            "https://safebrowsing.googleapis.com/v5/urls:search"
          );

          apiUrl.searchParams.set("key", env.GOOGLE_SAFE_BROWSING_KEY);
          apiUrl.searchParams.append("urls", link);

          const response = await fetch(apiUrl);
          const data = await response.json();

          if (!response.ok) {
            results.push(
              "GAGAL DIPERIKSA\n" + link +
              "\nKeterangan: " + (data.error?.message || response.status)
            );
          } else if (data.threats?.length > 0) {
            const types = [
              ...new Set(data.threats.flatMap(t => t.threatTypes || []))
            ];

            results.push(
              "BERBAHAYA\n" + link +
              "\nJenis ancaman: " + types.join(", ")
            );
          } else {
            results.push(
              "TIDAK DITEMUKAN DALAM DAFTAR ANCAMAN GOOGLE\n" + link
            );
          }
        } catch (error) {
          results.push("GAGAL DIPERIKSA\n" + link);
        }
      }

      const report =
        "HASIL PEMERIKSAAN LINK\n\n" +
        "Pengirim: " + sender + "\n\n" +
        results.join("\n\n");

      await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: report
          })
        }
      );

      return new Response("OK");
    } catch (error) {
      return new Response("OK");
    }
  }
};
