import Chalk from 'chalk';
import configJSON from './data/config.json';
import CLI, { Level } from './utils/CLI';
import Kahoot, { Client } from '../../kahoot.js';
import createNameGenerator from './utils/NameGenerator';
import { Choices } from './utils/KahootData';
import { config } from 'process';

const cli = new CLI(Level.DEBUG);

if (!process.stdin.isTTY)
  throw new Error('Must be ran from an interactive terminal.');

const players: Map<number, Client> = new Map();
let tryingToClose = false,
  quizIsInProgress = false,
  answerOverride: number | number[] | string | undefined;

process.on('uncaughtException', exception => {
  cli.error(exception);
  process.exit(1);
});

function randomJoin() {
  const deviationRange =
    configJSON.joinVariation.maximum - configJSON.joinVariation.minimum;
  const deviation = Math.random() * deviationRange - deviationRange / 2;
  return (configJSON.joinVariation.minimum + deviation) * 1000;
}

function randomAnswer() {
  const deviationRange =
    configJSON.answerVariation.maximum - configJSON.answerVariation.minimum;
  const deviation = Math.random() * deviationRange - deviationRange / 2;
  return (configJSON.answerVariation.minimum + deviation) * 1000;
}

(async function () {
  let gameID =
    (configJSON as any)?.joinInfo?.pin ||
    (await cli.prompt(Chalk.bold.green("What's the game Pin?")));

  let playerCountStr =
    (configJSON as any)?.joinInfo?.players ||
    parseInt(await cli.prompt(Chalk.bold.green('How many players?')));

  if (isNaN(playerCountStr)) throw new Error('Invalid player count.');
  let playerCount = parseInt(playerCountStr);

  cli.log(`Joining game ${gameID} with ${playerCount} player(s)...`);

  cli.log('Creating players and connecting to game...');
  let i = 0;

  const nameGenerator = await createNameGenerator(configJSON.names as any);

  function initPlayer(i: number) {
    const is = i;
    let player = Kahoot();
    player.once('Joined', () => {
      cli.log(
        `${Chalk.bold.green(`Player ${is + 1} joined.`)}${Chalk.reset()}`
      );
    });
    if (i === 0) {
      player.on('QuizStart', () => {
        if (quizIsInProgress) return;
        quizIsInProgress = true;
        cli.log(Chalk.bold.green('Quiz started.'));
      });

      player.on('QuizEnd', () => {
        if (!quizIsInProgress) return;
        quizIsInProgress = false;
        cli.log(Chalk.bold.green('Quiz ended.'));
      });

      player.on('QuestionStart', q => {
        cli.log(
          Chalk.bold.green(
            `Question started.\nQuestion #${
              q.questionIndex + 1
            }\nQuestion Time: ${
              q.timeAvailable / 1000
            } Seconds\nAnswer type for this question: ${
              q.gameBlockType
            }\nPossible Answers: ${new Array(
              q.quizQuestionAnswers[q.questionIndex]
            )
              .fill(1)
              .map((_, a) => Choices[a])
              .join(', ')}`
          )
        );
      });

      player.on('QuestionEnd', () => {
        cli.log(Chalk.bold.green('Question ended.'));
        answerOverride = undefined;
      });
    }

    player.on('Disconnect', () => {
      players.delete(is);
    });
    player.on('QuestionStart', async s => {
      setTimeout(async () => {
        let answer =
          answerOverride ||
          Math.floor(Math.random() * (s as any).numberOfChoices);
        await player.answer(answer);
        cli.log(
          `${Chalk.bold.green(
            `Player ${is + 1} answered with ${Choices[answer as number]}.`
          )}`
        );
      }, randomAnswer());
    });
    player.join(gameID, nameGenerator(i)).then(() => {
      if (configJSON.waitForSuccessfulJoin)
        if (++i < playerCount && !tryingToClose)
          setTimeout(() => initPlayer(i), randomJoin());
    });
    players.set(is, player);
    if (!configJSON.waitForSuccessfulJoin)
      if (++i < playerCount && !tryingToClose)
        setTimeout(() => initPlayer(i), randomJoin());
  }
  initPlayer(i);
})();

process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);
cli.on('exiting', exitHandler);

function exitHandler() {
  if (tryingToClose) {
    cli.warn('Forcefully closing...');
    process.exit(1);
  }
  tryingToClose = true;
  cli.log('Disconnecting players...');
  players.forEach(player => player.leave());
  setInterval(() => {
    if (players.size === 0) {
      cli.close();
      process.exit(0);
    }
    cli.log('Waiting for players to close...');
    cli.log('if this takes too long, press Ctrl+C again.');
    players.forEach(player => player.leave());
    cli.log(`${players.size} player(s) remaining.`);
  }, 5000);
}
