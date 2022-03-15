import worker from 'node:worker_threads';
import Logger, { Level } from './utils/Logger';
import readline from 'node:readline/promises';
import Chalk from 'chalk';
import FS from 'fs/promises';
import configJSON from './data/config.json';

function randomString(length: number = 10): string {
  if (length < 1) throw new Error('Length must be greater than 0.');
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_. ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

type NamePart =
  | string
  | { type: 'text'; content: string }
  | { type: 'randomString'; length: number }
  | { type: 'randomEntry'; file: string }
  | { type: 'id'; isZeroIndexed: boolean };

type NameGenerator = (id: number) => string;

async function createNameGenerator(
  nameConfig: NamePart[]
): Promise<NameGenerator> {
  const funnyFiles = new Map();

  const generators: NameGenerator[] = await Promise.all(
    nameConfig.map<Promise<NameGenerator>>(async part => {
      if (typeof part == 'string') return () => part;

      switch (part.type) {
        case 'text':
          return () => part.content;
        case 'randomString':
          return () => randomString(part.length);
        case 'randomEntry':
          let stuff: string[];
          if (!funnyFiles.has(part.file)) {
            stuff = (await FS.readFile(part.file)).toString().split(',');
            funnyFiles.set(part.file, stuff);
          } else stuff = funnyFiles.get(part.file);

          return () => {
            const index = Math.floor(Math.random() * stuff.length);
            return stuff[index];
          };
        case 'id':
          return id => `${id + (part.isZeroIndexed ? 0 : 1)}`;
      }
    })
  );

  let badWordWarn = false;
  return id => {
    const name = generators.map(generator => generator(id)).join('');
    if (/sex|fuck|shit/i.test(name) && !badWordWarn) {
      console.warn(
        "A player's name contains a bad word. They might be given a different name by Kahoot."
      );
      badWordWarn = true;
    }
    return name;
  };
}

const players: Map<number, worker.Worker> = new Map();
let tryingToClose = false;

global.console = new Logger(
  process.env.DEBUG ? Level.DEBUG : Level.INFO
) as any;

process.on('uncaughtException', exception => {
  console.error(exception);
  process.exit(1);
});

function randomWait() {
  let end = configJSON.joinVariation.minimum * 1000;
  end +=
    Math.random() * (2 * (configJSON.joinVariation.deviation * 1000)) -
    configJSON.joinVariation.deviation * 1000;
  return configJSON.joinVariation.minimum * 1000 > end
    ? configJSON.joinVariation.minimum * 1000
    : Math.min(configJSON.joinVariation.maximum * 1000, end);
}

if (!process.stdin.isTTY)
  throw new Error('Must be ran from an interactive terminal.');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

(async function () {
  let gameID =
    (configJSON as any)?.joinInfo?.pin ||
    (await rl.question(
      `${Chalk.bold.green('Enter the game PIN: ')}${Chalk.reset()}`
    ));
  let playerCountStr =
    (configJSON as any)?.joinInfo?.players?.toString() ||
    (await rl.question(
      `${Chalk.bold.green('Enter the number of players: ')}${Chalk.reset()}`
    ));

  if (!playerCountStr.match(/^\d+$/)) throw new Error('Invalid player count.');
  let playerCount = parseInt(playerCountStr);

  console.log('Creating players and connecting to game...');
  let i = 0;

  const nameGenerator = await createNameGenerator(configJSON.names as any);

  function initPlayer(i: number) {
    const is = i;
    let player = new worker.Worker('./dist/Player.js', {
      workerData: {
        gameID,
        index: is,
        name: nameGenerator(is)
      }
    });
    function playerMessageHandler(message: any) {
      switch (message.type) {
        case 'Joined':
          console.log(
            `${Chalk.bold.green(`Player ${is + 1} joined.`)}${Chalk.reset()}`
          );
          if (configJSON.waitForSuccessfulJoin)
            if (++i < playerCount && !tryingToClose)
              setTimeout(() => initPlayer(i), randomWait());
          break;
        case 'QuizStart':
          console.log(
            `${Chalk.bold.green(
              `Player ${is + 1} started the quiz.`
            )}${Chalk.reset()}`
          );
          break;
        case 'error':
          console.error(
            `${Chalk.bold.red(
              `Player ${is + 1} encountered an error: ${message.message}`
            )}${Chalk.reset()}`
          );
          break;
      }
    }
    player.on('message', playerMessageHandler);
    player.on('exit', () => {
      players.delete(is);
    });
    player.on('error', () => {
      players.delete(is);
    });
    players.set(is, player);
    if (!configJSON.waitForSuccessfulJoin)
      if (++i < playerCount && !tryingToClose)
        setTimeout(() => initPlayer(i), randomWait());
  }
  initPlayer(i);
})();

rl.on('SIGINT', () => {
  if (tryingToClose) {
    console.warn('Forcefully closing...');
    process.exit(1);
  }
  tryingToClose = true;
  console.log('Disconnecting players...');
  players.forEach(player => player.postMessage({ type: 'Quit' }));
  setInterval(() => {
    if (players.size === 0) process.exit(0);
    console.log('Waiting for players to close...');
    console.log('if this takes too long, press Ctrl+C again.');
    console.log(`${players.size} player(s) remaining.`);
  }, 5000);
});
