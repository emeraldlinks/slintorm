import ORMManager from './src/index.js';

type ModelMap = {
  User: { id: number };
  Post: { id: number };
};

const orm = new ORMManager({ modelMap: {} as ModelMap });

const typed: ORMManager<ModelMap> = orm;

orm.DB.User;
orm.DB.Post;
