import worker from 'node:worker_threads';
import Kahoot from '../../kahoot.js';
import Logger, { Level } from './utils/Logger';
import configJSON from './data/config.json';

function randomWait() {
  let end = configJSON.answerVariation.minimum * 1000;
  end +=
    Math.random() * (2 * (configJSON.answerVariation.deviation * 1000)) -
    configJSON.answerVariation.deviation * 1000;
  return configJSON.answerVariation.minimum * 1000 > end
    ? configJSON.answerVariation.minimum * 1000
    : Math.min(configJSON.answerVariation.maximum * 1000, end);
}

global.console = new Logger(
  process.env.DEBUG ? Level.DEBUG : Level.INFO
) as any;

let answerOverride: number | number[] | string | undefined;

function exitWithMessage(message: string) {
  if (!worker.isMainThread)
    worker.parentPort.postMessage({
      type: 'error',
      message
    });
  console.error(message);
  process.exit(1);
}

if (worker.isMainThread)
  exitWithMessage('Player can only be ran as a worker thread.');

const { gameID, index, name }: { gameID: string; index: number; name: string } =
  worker.workerData;

if (!gameID) exitWithMessage('Game ID not provided.');

const myself = Kahoot();

myself.on('QuizStart', () => {
  worker.parentPort.postMessage({
    type: 'QuizStart'
  });
});

myself.once('Joined', () => {
  worker.parentPort.postMessage({
    type: 'Joined'
  });
});

myself.on('QuestionStart', async s => {
  setTimeout(async () => {
    await myself.answer(
      answerOverride ||
        Math.floor(Math.random() * s.quizQuestionAnswers[s.questionIndex])
    );
    answerOverride = undefined;
  }, randomWait());
});

myself.on('Feedback', s => {
  myself.sendFeedback(5, 1, 1, 1);
});

(async function () {
  try {
    await myself.join(gameID, name);
  } catch (error) {
    exitWithMessage(error);
  }
})();
worker.parentPort.on('message', message => {
  switch (message.type) {
    case 'Quit':
      myself.leave();
      process.exit(0);
    case 'Answer':
      answerOverride = message.answer;
      break;
  }
});
