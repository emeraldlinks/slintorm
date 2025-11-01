import  SlintManager from './main';
import SlintORM from "./main";




console.log("started...");
async function nn(){
  console.log("started...")
    const orm = new SlintORM({ driver: 'sqlite', databaseUrl: './test.db' });

interface User { 
  id: string;
   name: string;
    age?: number;
     createdAt?: string;
      lastName?: string 
      posts?: Post // `manytomany:Post`;
    }
    interface Post { 
  id: string;
   name: string;
    age?: number;
     createdAt?: string;
      lastName?: string 
      userID?: string
      user?: User // `manytomany:Post;foreignKey:userID`;

    }
const Users = orm.defineModel<User>('users', { sample: { id: '', name: '', age: 0, createdAt: '' } });

await Users.insert({ id: 'u7', name: 'Joe', age: 25, createdAt: new Date().toISOString() });
let list = await Users.query()
  .where('age', '>', 18)
  .orderBy('name', 'asc')
  .limit(10)
  .get();

console.log("found:", list);

await Users.update("u2", { name: "Adam" });

list = await Users.query()
  .select('id', 'name')
  .where('age', '>', 18)
  .orderBy('name', 'asc')
  .limit(10)
  .get();

console.log("update found:", list);

const one = await Users.query().where("id", "=", "u1").first()
const two = await Users.query().where("id", "=", "u2").first()
console.log("one: ", one)
console.log("all: ", [one, two] )












const db = new SlintManager({
  driver: "sqlite",
  databaseUrl: "./test.db"
});

const gg = db.defineModel<User>("users");
const xone = await gg.query().where("id", "=", "u1").first()
const xtwo = await Users.query().where("id", "=", "u2").first()
console.log("onex: ", one)
console.log("allx: ", [xone, xtwo] )

}

nn()



