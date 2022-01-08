const {
	settingsUpdater,
	getSettingsFileVersion,
} = require("./utils/settingsUpdater");
let settings;

// Check that settings file is up to date
try {
	settings = require("./settings");
	if (settings.settingsFileVersion != getSettingsFileVersion()) {
		return settingsUpdater();
	}
} catch (err) {
	return settingsUpdater();
}

const mineflayer = require("mineflayer");

const { messageCreator } = require("./utils/message");
const { sendWebhook } = require("./utils/webhook");
const { startStatus } = require("./utils/discordStatus");
const { username } = require("./settings");

// Core settings checks
if (!settings.username) {
	console.log("Username required!");
	return;
}
if (!settings.password) {
	console.log("Password required!");
	return;
}
if (!settings.authType) {
	console.log("AuthType required!");
	return;
}
if (!settings.webhookURL) {
	console.log("Webhook URL required!");
	return;
}

const OPTIONS = {
	host: "play.mineclub.com",
	username: settings.username,
	password: settings.password,
	auth: settings.authType,
	version: settings.version,
	brand: "Mineclub-Link", // Please don't change ♥
};
const BOT = mineflayer.createBot(OPTIONS);

// Webhook Settings
const webhookInfo = {
	UUID: "",
	USERNAME: "",
};

// Session Stats Tracking
const stats = {
	// Core stats (Can't be removed from disconnect message)
	startTime: 0,
	endTime: 0,
	// Tokens
	tokenMessages: 0,
	tokenTimesEarnt: 0,
	totalTokensEarnt: 0,
	season: "",
	// Gems
	activityGems: 0,
	marketGems: 0,
	totalGems: 0,

	// Configurable stats (Can be hidden from disconnect screen in the settings file)
	goodnights: 0,
};

// Clears stats on join
function resetStats() {
	stats.season = "";
	stats.totalGems = 0;
	stats.totalTokensEarnt = 0;
	stats.tokenTimesEarnt = 0;
	stats.tokenMessages = 0;
	stats.endTime = 0;
}

// Detect Join
BOT.once("spawn", async () => {
	// Set stats to 0 and set start time
	stats.startTime = Date.now();
	resetStats();
	// State that bot has connected
	console.log("Connected!");
	// Load resource pack and set webhook info
	BOT.acceptResourcePack();
	webhookInfo.UUID = BOT.player.uuid;
	webhookInfo.USERNAME = BOT.username;
	// Manage Discord status (Currently Broken)
	if (settings.discordStatus == true) {
		startStatus(BOT.username, stats.startTime);
	}
	await sendWebhook("join", { webhookInfo });
});

// Detect System Messages
BOT.on("messagestr", async (message, messagePosition) => {
	if (messagePosition == "system") {
		// Token earning detection
		if (message.match(/[\W]* You won ([0-9]) (\w*) Token[s]?!/g) != null) {
			let amount = Number.parseInt(message.replace(/[^0-9]+/, ""));
			let season = message.replace(
				/[\W]* You won ([0-9]) (\w*) Token[s]?!/g,
				"$2"
			);
			if (season != stats.season) {
				stats.season = season;
			}
			stats.totalTokensEarnt += amount;
			stats.tokenTimesEarnt++;
			if (settings.tokenAlerts.active == true) {
				let msg = messageCreator("token", { amount, season, stats });
				await sendWebhook("token", { msg, webhookInfo });
				if (settings.logToConsole == true) {
					console.log(`Collected ${amount} ${season} tokens!`);
				}
			}
		}
		// Token message detection
		if (message.includes("鳠")) {
			stats.tokenMessages++;
		}
		// Gem message detection
		if (message.includes("阵")) {
			stats.activityGems += 50;
			stats.totalGems += 50;
			if (settings.gemAlerts.active == true) {
				let msg = messageCreator("gems", { stats });
				await sendWebhook("gems", { msg, webhookInfo });
				if (settings.logToConsole == true) {
					console.log("Earnt 50 gems!");
				}
			}
		}
	}
	if (messagePosition == "chat") {
		// DM Detection
		if (
			message.match(/[\W]+(\w+) -> ME: ([\w\W]+)/g) &&
			settings.dmAlerts == true
		) {
			let msg = messageCreator("message", {
				message: message.replace(/[\W]+(\w+) -> ME: ([\w\W]+)/g, "$2"),
			});
			let username = message.replace(
				/[\W]+(\w+) -> ME: ([\w\W]+)/g,
				"$1"
			);
			await sendWebhook("dm", { msg, username, webhookInfo });
			if (settings.logToConsole == true) {
				console.log(`${username} -> ME: ${msg}`);
			}
		}
		// Market sold detection
		if (message.includes("這")) {
			const AMOUNT_REGEX = RegExp(
				/[\W]+([0-9,]+)[\W]+is ready to be collected/g
			);
			const BUYER_REGEX = RegExp(/[\W]+Purchase made by: [\W]+([\w]+)/g);
			const AMOUNT_RESULT = AMOUNT_REGEX.exec(message);
			const BUYER_RESULT = BUYER_REGEX.exec(message);
			console.log(AMOUNT_RESULT);
			const amount = Number.parseInt(AMOUNT_RESULT[1].replace(",", ""));
			const buyer = BUYER_RESULT[1];

			stats.marketGems += amount;
			stats.totalGems += amount;
			if (settings.marketAlerts.sellAlert == true) {
				let msg = messageCreator("marketSold", {
					amount,
					buyer,
					stats,
				});
				await sendWebhook("marketSold", { msg, webhookInfo });
				if (settings.logToConsole == true) {
					console.log(`${username} brought your item for ${amount}`);
				}
			}
		}
		// Market outbid detection
		if (message.includes("ꌄ[Market] You have been outbid by")) {
			let username = message.replace(
				/[\W]+\[Market\] You have been outbid by [\W]+([\w]+) ([0-9,]+)[\W]+/g,
				"$1"
			);
			let amount = Number.parseInt(
				message
					.replace(
						/[\W]+\[Market\] You have been outbid by [\W]+([\w]+) ([0-9,]+)[\W]+/g,
						"$2"
					)
					.replace(",", "")
			);
			const outbidSettings = settings.marketAlerts.outbidAlert;
			if (outbidSettings.active == true) {
				let msg = messageCreator("marketOutbid", { amount, username });
				if (outbidSettings.ping == true && outbidSettings.pingUserID)				{
					await sendWebhook("marketOutbid", { msg, ping: `<@${outbidSettings.pingUserID}>`, webhookInfo });
				}else {
					await sendWebhook("marketOutbid", { msg, webhookInfo });
				}
				if (settings.logToConsole == true){
					console.log(`Outbid by: ${username}. New price ${amount}`);
				}
			}
		}
	}
});

// Detect Chat Messages
BOT.on("chat", async (username, message) => {
	if (username == BOT.username) {
		return;
	}
	// Mention detection
	if (
		(message.includes(BOT.username) &&
			settings.mentionAlerts.personal == true) ||
		(message.includes("@everyone") &&
			settings.mentionAlerts.everyone == true)
	) {
		let msg = messageCreator("message", { message });
		await sendWebhook("mention", { msg, username, webhookInfo });
		if (settings.logToConsole == true) {
			console.log(`${username}: ${message}`);
		}
	}
	// Goodnight detection
	if (
		message.match(/\bgoodnight\b/g) ||
		message.match(/\bnight\b/g) ||
		message.match(/\bnini\b/g) ||
		message.match(/\bgn\b/g)
	) {
		stats.goodnights++;
	}
});

// Close login window on join or close discord link window
BOT.on("windowOpen", async (window) => {
	if (window.title.includes("庳")) {
		BOT.closeWindow(window.id);
	} else if (window.title.includes("a")) {
		BOT.closeWindow(window.id);
	}
});

// Detect being kicked from the server
let kicked = false;
BOT.on("kicked", async (reason, loggedIn) => {
	if (loggedIn) {
		stats.endTime = Date.now();
		let msg = messageCreator("exit", { stats });
		await sendWebhook("kick", { webhookInfo, reason, msg });
	}
	console.log(JSON.parse(reason).text);
	kicked = true;
});

// Detect error with client
let crashed = false;
BOT.on("error", async (error) => {
	if (error.code == "ECONNREFUSED") {
		console.log("Could not connect!");
	} else {
		stats.endTime = Date.now();
		let msg = messageCreator("exit", { stats });
		await sendWebhook("crash", { webhookInfo, msg });
		console.error(error);
		crashed = true;
	}
});

// Detect disconnecting from the server
BOT.on("end", async () => {
	if (kicked || crashed) {
		return;
	}
	stats.endTime = Date.now();
	let msg = messageCreator("exit", { stats });
	await sendWebhook("disconnect", { webhookInfo, msg });
	console.log("Disconnected from server");
});

// Detect program stop
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


async function shutdown() {
	stats.endTime = Date.now();
	let msg = messageCreator("exit", { stats });
	await sendWebhook("disconnect", { webhookInfo, msg });
	console.log("Disconnected from server");
	process.exit();
}