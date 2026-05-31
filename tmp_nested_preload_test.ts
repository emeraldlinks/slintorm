import ORMManager from './src/index.js';

async function run() {
  const orm = new ORMManager({ driver: 'sqlite', databaseUrl: './test_nested.db', dir: 'src' });
  await orm.migrate();

  const Users = await orm.defineModel('users', 'User');
  const Profiles = await orm.defineModel('profile', 'Profile');
  const Posts = await orm.defineModel('post', 'Post');

  // Clean up existing rows for deterministic test
  try { await Posts.truncate(); } catch {}
  try { await Profiles.truncate(); } catch {}
  try { await Users.truncate(); } catch {}

  // Insert a user and relations with cycles
  const u1 = await Users.insert({ name: 'NestedUser1', email: 'n1@test' });
  const u2 = await Users.insert({ name: 'NestedUser2', email: 'n2@test' });

  // u1 has profile P1, which references u1
  const p1 = await Profiles.insert({ userId: u1?.id, meta: { info: 'p1' } });
  // u2 has profile P2
  const p2 = await Profiles.insert({ userId: u2?.id, meta: { info: 'p2' } });

  // Posts for users
  const a = await Posts.insert({ title: 'A1', userId: u1?.id });
  const b = await Posts.insert({ title: 'A2', userId: u1?.id });
  const c = await Posts.insert({ title: 'B1', userId: u2?.id });

  // Now exercise nested preloads with depth and circular references
  // 1) user -> profile -> user -> posts
  const deepUser = await Users.query()
    .preload('profile.user.posts')
    .first({ id: u1?.id });

  // 2) post -> user -> profile -> user
  const deepPost = await Posts.query()
    .preload('user.profile.user')
    .first({ id: a?.id });

  // 3) multi-level nested one-to-many -> many-to-one -> one-to-one
  const deepUser2 = await Users.query()
    .preload('posts.user.profile')
    .first({ id: u1?.id });

  console.log('deepUser', JSON.stringify(deepUser, null, 2));
  console.log('deepPost', JSON.stringify(deepPost, null, 2));
  console.log('deepUser2', JSON.stringify(deepUser2, null, 2));

  await orm.adapter.close();
}

run().catch(e => { console.error('ERROR', e); process.exit(1); });
