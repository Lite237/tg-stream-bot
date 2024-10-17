import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import express from "express";
import { DownloaderHelper } from "node-downloader-helper";
import ffmpeg from "fluent-ffmpeg";
import dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.token);
const app = express();

app.use(
    await bot.createWebhook({
        domain: process.env.domain,
        drop_pending_updates: true,
    })
);

app.get("/", (req, res) => {
    res.send("Bot started");
});

const shouldUpdate = (currentTime, lastTime) => {
    const differenceInMilliseconds = currentTime - lastTime;
    const differenceInSeconds = differenceInMilliseconds / 1000;

    return differenceInSeconds >= 3;
};

bot.start(async (ctx) => {
    ctx.reply("Bot in development. Please try later :)");
});

bot.on(message("video"), async (ctx) => {
    const fileId = ctx.message.video.file_id;

    const fileURL = await ctx.telegram.getFileLink(fileId);

    const downloader = new DownloaderHelper(fileURL.href, "./", {
        fileName: "stream.mp4",
        override: true,
        progressThrottle: 5000,
    });

    let lastUpdateTime = new Date();

    const msg = await ctx.reply("starting...");

    downloader.on("progress", (stats) => {
        if (shouldUpdate(new Date(), lastUpdateTime)) {
            const progress = Math.round((stats.downloaded / stats.total) * 100);

            ctx.telegram.editMessageText(
                ctx.chat.id,
                msg.message_id,
                undefined,
                `Downloading: ${progress}%...`
            );

            lastUpdateTime = new Date();
        }
    });

    downloader.on("end", () => {
        ctx.reply(
            "Video downloaded successfully!\n\nSend /stream to start the stream"
        );
    });

    downloader.on("error", (error) => {
        ctx.reply("Error downloading video:", error);
    });

    downloader.start();
});

bot.command("stream", async (ctx) => {
    const args = ctx.args;

    const msg = await ctx.reply("Starting stream...");

    let lastUpdateTime = new Date();

    ffmpeg("./stream.mp4")
        .inputOptions(["-re"])
        .videoCodec("libx264")
        .audioCodec("aac")
        .format("flv")
        .on("error", function (err) {
            ctx.reply("An error occurred: " + err.message);
        })
        .on("end", function () {
            ctx.reply("Stream finished!");
        })
        .on("progress", function (progress) {
            if (shouldUpdate(new Date(), lastUpdateTime)) {
                ctx.telegram.editMessageText(
                    ctx.chat.id,
                    msg.message_id,
                    undefined,
                    "Processing: " + progress.percent + "%...",
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Cancel Stream",
                                        callback_data: "cancel",
                                    },
                                ],
                            ],
                        },
                    }
                );

                lastUpdateTime = new Date();
            }
        })
        .output(args[0])
        .run();
});

bot.catch(async (err, ctx) => {
    await ctx.reply("Some shitting thing occured", err);
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Ready");
});
