import ORMManager from './src/index.ts';

interface MyModel {
  id?: number;
  name: string;
}

async function main() {
  const orm = new ORMManager({ driver: 'sqlite', databaseUrl: ':memory:', dir: 'src', logs: false });
  const db = orm.DB;
  await orm.migrate();
  const model = await orm.defineModel<MyModel>('my_models', 'MyModel');
  await db.MyModel.insert({ name: 'demo' });
  console.log('registered', !!model);
}

void main();
