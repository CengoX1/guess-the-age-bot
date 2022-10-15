const {BOT_TOKEN, REQUEST_TIMEOUT, ROUNDS, ROUND_DURATION, TIMER_STEPS} =
	process.env
const path = require("path")
const fs = require("fs")
const {InputFile} = require("grammy")
const {
	trim,
	bold,
	escape,
	numberWithSpaces,
	pluralize,
	revealNumberSign,
	arrayRandom,
	findExact,
} = require("./utils")

const getRoundMessage = async ctx => {
	const answers = ctx.session.players
		.filter(player => player.isPlaying && player.answer !== null)
		.sort(
			(a, b) =>
				ctx.session.answersOrder.indexOf(a.id) -
				ctx.session.answersOrder.indexOf(b.id)
		)

	const photosPath = path.resolve(__dirname, "../photos")
	const fileName = arrayRandom(fs.readdirSync(photosPath))
	const filePath = path.resolve(photosPath, fileName)
	ctx.session.rightAnswer = Number(fileName.match(/^(\d+)/)[1])

	return await ctx.replyWithPhoto(new InputFile(filePath), {
		caption: trim(`
			*Раунд ${ctx.session.round}/${ROUNDS}*
			Сколько, по-вашему, лет этому человеку?
			${
				answers.length > 0
					? `\n${answers
							.map(
								(player, index) =>
									`${index + 1}. ${bold(
										escape(player.firstName)
									)}: ${escape(player.answer)}`
							)
							.join("\n")}\n`
					: ""
			}
			${"⬛".repeat(ctx.session.time)}${"⬜".repeat(TIMER_STEPS - ctx.session.time)}
		`),
	})
}

const onStart = async ctx => {
	console.log("Start game")

	await ctx.replyWithMarkdownV1("*Игра начинается!*")

	Object.assign(ctx.session, {
		timeouts: {
			timer: null,
			round: null,
			beforeGame: null,
			afterRound: null,
			stopGame: null,
		},
		guessMessageId: null,
		round: 1,
		time: 0,
		answersOrder: [],
		isPlaying: true,
		isWaitingForAnswers: false,
		players: [],
	})

	const startRound = async () => {
		const guessMessage = await getRoundMessage(ctx)

		ctx.session.guessMessageId = guessMessage.message_id
		ctx.session.isWaitingForAnswers = true

		/*ctx.session.timeouts.timer = setInterval(async () => {
			ctx.session.time = ctx.session.time + 1
			try {
				await ctx.editMessageCaption(
					ctx.chat.id,
					guessMessage.message_id,
					null,
					getRoundMessage(chatId, round, time),
					{
						parse_mode: "Markdown",
					}
				)
			} catch (err) {
				console.log(err)
			}
			time++
			if (time >= config.timerSteps + 1)
				clearInterval(gameState.timeouts.timer)
		}, config.waitDelay / (config.timerSteps + 1))*/

		ctx.session.timeouts.round = setTimeout(async () => {
			try {
				ctx.session.isWaitingForAnswers = false

				const top = []
				for (const player of ctx.session.players) {
					if (!player.isPlaying) continue
					const addScore =
						player.answer === null
							? 0
							: ctx.session.rightAnswer -
							  Math.abs(ctx.session.rightAnswer - player.answer)
					player.gameScore += addScore
					top.push({
						...player,
						addScore,
					})
					player.answer = null
					//db.update(chatId, ch => chat)
				}
				//db.update(chatId, ch => chat)
				console.log({top})
				if (top.every(player => player.answer === null)) {
					await ctx.reply(
						"🤔 Похоже, вы не играете. Ок, завершаю игру..."
					)
					await onStop(ctx)
					return
				} else {
					await ctx.replyWithMarkdownV1(
						trim(`
							Человеку на этом фото *${ctx.session.rightAnswer} ${pluralize(
							ctx.session.rightAnswer,
							"год",
							"года",
							"лет"
						)}*. Вот, кто был ближе всего:
	
							${top
								.sort((a, b) => b.addScore - a.addScore)
								.map(
									(player, index) =>
										`${["🏆", "🎖", "🏅"][index] || "🔸"} ${
											index + 1
										}. ${bold(
											escape(player.firstName)
										)}: ${revealNumberSign(
											player.addScore
										)}`
								)
								.join("\n")}
						`),
						{
							reply_to_message_id: ctx.session.guessMessageId,
						}
					)
				}

				if (ctx.session.round === Number(ROUNDS)) {
					ctx.session.timeouts.stopGame = setTimeout(async () => {
						await onStop(ctx)
					}, 1000)
				} else {
					ctx.session.answersOrder = []
					ctx.session.timeouts.afterRound = setTimeout(async () => {
						ctx.session.round++
						await startRound()
					}, 2500)
				}
			} catch (err) {
				console.log(err)
			}
		}, ROUND_DURATION)
	}

	ctx.session.timeouts.beforeGame = setTimeout(async () => {
		await startRound()
	}, 1000)
}

const onStop = async ctx => {
	console.log("Stop game")

	if (!ctx?.session?.isPlaying) {
		return await ctx.reply(
			"❌ Игра не была запущена. Вы можете запутить ее командой /start."
		)
	}
	Object.values(ctx.session.timeouts).forEach(timeout =>
		clearTimeout(timeout)
	)

	ctx.session.isPlaying = false
	ctx.session.isWaitingForAnswers = false

	const top = []
	for (const player of ctx.session.players) {
		if (!player.isPlaying) continue
		top.push({...player})
	}

	//db.update(chatId, ch => chat)
	if (top.length === 0) {
		return await ctx.replyWithMarkdownV1(
			trim(`
				*🏁 Ок, завершаю игру.*

				❤️ Канал автора, где иногда публикуются новые прикольные боты @FilteredInternet.
				🔄 /game - Еще разок?
			`)
		)
	}

	await ctx.replyWithMarkdownV1(
		trim(`
			*🏁 А вот и победители:*

			${top
				.sort((a, b) => b.score - a.score)
				.map(
					(player, index) =>
						`${["🏆", "🎖", "🏅"][index] || "🔸"} ${
							index + 1
						}. ${bold(
							escape(player.firstName)
						)}: ${numberWithSpaces(player.gameScore)} ${pluralize(
							player.gameScore,
							"очко",
							"очка",
							"очков"
						)}`
				)
				.join("\n")}

			❤️ Канал автора, где иногда публикуются новые прикольные боты @FilteredInternet.
			🔄 /game - Еще разок?
		`)
	)
}

const onNewAnswer = async ctx => {
	const answer = Number(ctx.msg.text)
	if (answer <= 0 || answer > 120) {
		return ctx.reply("Ответ вне допустимого диапазона (1 - 120)", {
			reply_to_message_id: ctx.msg.message_id,
		})
	}
	const player = findExact(ctx.session.players, "id", ctx.from.id)
	if (player) {
		player.answer = answer
	} else {
		ctx.session.players.push({
			id: ctx.from.id,
			firstName: ctx.from.first_name,
			isPlaying: true,
			answer,
			gameScore: 0,
		})
	}
	ctx.session.answersOrder.push(ctx.from.id)

	//db.update(chatId, ch => chat)

	/*await ctx.editMessageCaption(
		chatId,
		gameStates[chatId].guessMessageId,
		null,
		getRoundMessage(
			chatId,
			gameStates[chatId].currentRound,
			gameStates[chatId].currentTime
		),
		{
			parse_mode: "Markdown",
		}
	)*/
}

module.exports = {
	onStart,
	onStop,
	//onFinish,
	getRoundMessage,
	onNewAnswer,
}
