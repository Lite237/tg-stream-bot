import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import express from "express";
import { DownloaderHelper } from "node-downloader-helper";
import ffmpeg from "fluent-ffmpeg";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.token);
const app = express();

// app.use(
//     await bot.createWebhook({
//         domain: process.env.domain,
//         drop_pending_updates: true,
//     })
// );

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

bot.command("stream", async (ctx) => {
    const args = ctx.args;
    const fileInput = `./downloads/${args[1]}`;

    const msg = await ctx.reply("Starting stream...");

    if (!fileInput) {
        await ctx.reply("No file to stream...");
    }

    let lastUpdateTime = new Date();
    //"-stream_loop -1",

    if (fileInput.includes(".mp3")) {
        ffmpeg(fileInput) // Replace with your audio file path
            .inputOptions(["-re"])
            .audioCodec("aac")
            .audioBitrate("64k")
            .audioChannels(2)
            .audioFrequency(34100)
            .format("flv")
            .on("error", function (err) {
                ctx.reply("An error occurred: " + err.message);
            })
            .on("end", function () {
                ctx.reply("Stream finished!");
            })
            .on("progress", function (progress) {
                if (shouldUpdate(new Date(), lastUpdateTime) && progress) {
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

        return;
    }

    ffmpeg(fileInput)
        .inputOptions(["-re"])
        .videoCodec("libx264")
        .videoBitrate(700)
        .size("640x480")
        .addOption("-preset", "ultrafast")
        .addOption("-maxrate", "700k")
        .addOption("-bufsize", "1000k")
        .addOption("-pix_fmt", "yuv420p")
        .addOption("-g", "150")
        .audioCodec("aac")
        .audioBitrate("32k")
        .audioChannels(2)
        .audioFrequency(22050)
        .addOption("-r", "20")
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

bot.on("message", async (ctx) => {
    let fileId = null;

    if (ctx.message.audio) {
        fileId = ctx.message.audio.file_id;
    }

    if (ctx.message.video) {
        fileId = ctx.message.video.file_id;
    }

    if (ctx.message.document) {
        fileId = ctx.message.document.file_id;
    }

    if (ctx.message.voice) {
        fileId = ctx.message.voice.file_id;
    }

    if (!fileId) return;

    try {
        const fileURL = await ctx.telegram.getFileLink(fileId);

        const ext = path.extname(fileURL.href);

        if (!fs.existsSync("./downloads")) {
            fs.mkdirSync("./downloads");
        }

        const downloader = new DownloaderHelper(fileURL.href, "./downloads", {
            fileName: `stream${ext}`,
            override: true,
        });

        let lastUpdateTime = new Date();

        const msg = await ctx.reply("starting...");

        downloader.on("progress", (stats) => {
            if (shouldUpdate(new Date(), lastUpdateTime)) {
                const progress = Math.round(
                    (stats.downloaded / stats.total) * 100
                );

                ctx.telegram.editMessageText(
                    ctx.chat.id,
                    msg.message_id,
                    undefined,
                    `Downloading: ${progress}%...`
                );

                lastUpdateTime = new Date();
            }
        });

        downloader.on("end", async () => {
            let fileStruc = "";

            try {
                const files = await fsPromises.readdir("./downloads");

                files.forEach((file) => {
                    if (file.includes("stream")) {
                        fileStruc += `- ${file}\n\n`;
                        console.log(file);
                    }
                });

                await ctx.reply(
                    "Video downloaded successfully!\n\nAll available files:\n\n" +
                        fileStruc
                );
            } catch (error) {
                await ctx.reply("Error reading directory");
            }
        });

        downloader.on("error", (error) => {
            ctx.reply("Error downloading video:", error);
        });

        downloader.start();
    } catch (error) {
        console.log(error);
    }
});

bot.catch(async (err, ctx) => {
    await ctx.reply("Some shitting thing occured" + err);
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Ready");
});

bot.launch(() => {
    console.log("Ready to get to the moon !!");
});
