
import os
import re
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters
)

TOKEN = os.getenv("BOT_TOKEN")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "GOOGLE LINK REPORTER\n\n"
        "Kirim link website yang ingin diperiksa.\n\n"
        "Perintah:\n"
        "/start - Mulai bot\n"
        "/help - Bantuan"
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Kirim URL website untuk diperiksa.\n"
        "Bot akan menyiapkan jalur pelaporan resmi Google."
    )

async def check_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.message.text.strip()
    urls = re.findall(r'https?://[^\s]+', message)

    if not urls:
        await update.message.reply_text(
            "Link tidak ditemukan. Gunakan format https://example.com"
        )
        return

    for url in urls[:5]:
        await update.message.reply_text(
            f"LINK DIPERIKSA:\n{url}\n\n"
            "PILIH JALUR LAPORAN GOOGLE:\n\n"
            "1. Phishing / Malware:\n"
            "https://safebrowsing.google.com/safebrowsing/report_phish/\n\n"
            "2. Spam Google Search:\n"
            "https://search.google.com/search-console/report-spam\n\n"
            "Silakan periksa bukti dan kirim laporan melalui formulir resmi."
        )

def main():
    if not TOKEN:
        raise ValueError("BOT_TOKEN belum diatur!")

    app = Application.builder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, check_link)
    )

    print("Google Link Reporter berjalan...")
    app.run_polling()

if __name__ == "__main__":
    main()
