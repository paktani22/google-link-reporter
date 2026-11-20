
export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Google Link Reporter Aktif!");
    }

    const update = await request.json();
    const message = update.message;

    if (!message || message.chat.type !== "private" || !message.text) {
      return new Response("OK");
    }

    const urls = message.text.match(/https?:\/\/[^\s]+/gi);

    if (!urls) {
      return new Response("Tidak ada link");
    }

    const sender = message.from.username
      ? "@" + message.from.username
      : message.from.first_name || "Pengguna";

    const text =
      "LAPORAN LINK BARU\n\n" +
      "Pengirim: " + sender + "\n\n" +
      urls.join("\n");

    await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: text
        })
      }
    );

    return new Response("OK");
  }
};
