import EventEmitter from 'events';
import REPL from 'repl';
import Chalk from 'chalk';
import * as NodeUtil from 'node:util';

export enum Level {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

function addZero(n: number): string {
  return n >= 0 && n < 10 ? '0' + n : n + '';
}
function date(): string {
  let now = new Date();
  return [
    [
      addZero(now.getDate()),
      addZero(now.getMonth() + 1),
      now.getFullYear()
    ].join('/'),
    [
      addZero(now.getHours()),
      addZero(now.getMinutes()),
      addZero(now.getSeconds())
    ].join(':')
  ].join(' ');
}

type LoggerConstructor = Level | 'none' | 'error' | 'warn' | 'info' | 'debug';

export default class CLI extends EventEmitter {
  private replInstance: REPL.REPLServer;
  private __logLevel: Level;
  private timestamp: boolean;
  private promptStr: string;
  private redisplayPromptTimeout: NodeJS.Timer = null;
  get logLevel(): Level {
    return this.__logLevel;
  }

  constructor(
    logLevel: LoggerConstructor,
    timestamps: boolean = true,
    prompt: string = '> '
  ) {
    super();
    this.timestamp = timestamps;
    if (typeof logLevel === 'string') {
      switch (logLevel as string) {
        case 'none':
          this.__logLevel = Level.NONE;
          break;
        case 'error':
          this.__logLevel = Level.ERROR;
          break;
        case 'warn':
          this.__logLevel = Level.WARN;
          break;
        case 'info':
          this.__logLevel = Level.INFO;
          break;
        case 'debug':
          this.__logLevel = Level.DEBUG;
          break;
      }
    } else this.__logLevel = logLevel as Level;
    this.replInstance = REPL.start({
      prompt,
      eval: this.commandHandler.bind(this)
    });
    this.promptStr = prompt;
    this.replInstance.on('SIGINT', this.replInstance.close);
    this.replInstance.on('exit', () => this.emit('exit'));
  }

  private commandHandler(command: string): void {
    this.replInstance.output.write(`${this.promptStr}${command}\n`);
    this.redisplayPrompt();
  }

  close() {
    this.replInstance.close();
  }

  private redisplayPrompt() {
    if (this.redisplayPromptTimeout) {
      clearTimeout(this.redisplayPromptTimeout);
      this.redisplayPromptTimeout = null;
    }
    this.redisplayPromptTimeout = setTimeout(() => {
      this.redisplayPromptTimeout = null;
      this.replInstance.output.write('\n');
      this.replInstance.displayPrompt(true);
    }, 100);
  }

  error(message: any, ...optionalParams: any[]) {
    if (this.logLevel < Level.ERROR) return;
    this.replInstance.output.write(
      `\n${this.timestamp ? `${Chalk.bgBlue(date())} ` : ''}${Chalk.rgb(
        214,
        78,
        207
      )('[ERROR]')} ${Chalk.reset(
        typeof message !== 'string' ? NodeUtil.inspect(message) : message
      )}${
        optionalParams.length > 0
          ? `\t${optionalParams
              .map(p => (typeof p !== 'string' ? NodeUtil.inspect(p) : p))
              .join(' ')}`
          : ''
      }`
    );
    this.redisplayPrompt();
    this.emit('write');
  }

  warn(message: any, ...optionalParams: any[]) {
    if (this.logLevel < Level.WARN) return;
    this.replInstance.output.write(
      `\n${this.timestamp ? `${Chalk.bgBlue(date())} ` : ''}${Chalk.rgb(
        177,
        170,
        55
      )('[WARN]')} ${Chalk.reset(
        typeof message !== 'string' ? NodeUtil.inspect(message) : message
      )}${
        optionalParams.length > 0
          ? `\t${optionalParams
              .map(p => (typeof p !== 'string' ? NodeUtil.inspect(p) : p))
              .join(' ')}`
          : ''
      }`
    );
    this.redisplayPrompt();
    this.emit('write');
  }

  log(message: any, ...optionalParams: any[]) {
    if (this.logLevel < Level.INFO) return;
    this.replInstance.output.write(
      `\n${this.timestamp ? `${Chalk.bgBlue(date())} ` : ''}${Chalk.rgb(
        47,
        184,
        55
      )('[INFO]')} ${Chalk.reset(
        typeof message !== 'string' ? NodeUtil.inspect(message) : message
      )}${
        optionalParams.length > 0
          ? `\t${optionalParams
              .map(p => (typeof p !== 'string' ? NodeUtil.inspect(p) : p))
              .join(' ')}`
          : ''
      }`
    );
    this.redisplayPrompt();
    this.emit('write');
  }

  info(message: any, ...optionalParams: any[]) {
    this.log(message, ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    if (this.logLevel < Level.DEBUG) return;
    this.replInstance.output.write(
      `\n${this.timestamp ? `${Chalk.bgBlue(date())} ` : ''}${Chalk.rgb(
        74,
        69,
        220
      )('[DEBUG]')} ${Chalk.reset(
        typeof message !== 'string' ? NodeUtil.inspect(message) : message
      )}${
        optionalParams.length > 0
          ? `\t${optionalParams
              .map(p => (typeof p !== 'string' ? NodeUtil.inspect(p) : p))
              .join(' ')}`
          : ''
      }`
    );
    this.redisplayPrompt();
    this.emit('write');
  }

  async prompt(message: string): Promise<string> {
    return new Promise(resolve => {
      this.replInstance.output.write(`\n${message}`);
      this.redisplayPrompt();
      this.replInstance.once('line', resolve);
    });
  }
}
