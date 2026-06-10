import ORMManager from './src/index.js';

interface Game {
  id?: number;
  name: string;
}

async function main() {
  const orm = new ORMManager({
    driver: 'sqlite',
    databaseUrl: ':memory:',
    dir: 'src',
    logs: false,
  });

  const db = orm.DB;
  await orm.migrate();
  await orm.defineModel<Game>('games', 'Game');

  await db.Game.insert({ name: 'demo' });
  console.log('custom model registered and inserted');
}

void main();
