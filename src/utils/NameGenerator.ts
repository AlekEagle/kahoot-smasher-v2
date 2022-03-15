import FS from 'fs/promises';

type NamePart =
  | string
  | { type: 'text'; content: string }
  | { type: 'randomString'; length: number }
  | { type: 'randomEntry'; file: string }
  | { type: 'id'; isZeroIndexed: boolean };

type NameGenerator = (id: number) => string;

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

export default async function createNameGenerator(
  nameConfig: NamePart[],
  logger: (input: string) => void = console.log
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
      logger(
        "A player's name contains a bad word. They might be given a different name by Kahoot."
      );
      badWordWarn = true;
    }
    return name;
  };
}
