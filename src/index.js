import express from 'express';
import path from 'path';
import initBookshelf from 'bookshelf';
import initKvnode from './models/kvnode';
import createError from 'http-errors';
import bodyParser from 'body-parser';

const normalize = (str) => {
  // trim / on the right
  let tail = str.length;
  while (/\//.test(str[tail - 1])) {
    tail--;
  }
  return str.slice(0, tail);
};

export default ({
  knex,
  migrationsTable = 'kvstore_migrations',
} = {}) => {
  if (!knex) throw new Error('missing knex option');

  const bookshelf = initBookshelf(knex);
  const Kvnode = initKvnode({ bookshelf });

  const router = new express.Router();

  let isDatabaseReady = false;
  let dbError;

  const directory = path.join(__dirname, '/migrations');

  const migratePromise = knex.migrate.latest({
    directory,
    tableName: migrationsTable,
  })
  .then(() => {
    // Make sure root node exists
    return Kvnode.root()
    .save(null, { method: 'insert' })
    .catch(() => {
      // ignore duplicate key error
    });
  })
  .then(() => isDatabaseReady = true)
  .catch((err) => {
    dbError = err;
  });


  // Ensure database migrations have run
  router
  .use((req, res, next) => {
    if (dbError) {
      next(dbError);
    } else if (!isDatabaseReady) {
      // enqueue to list of callbacks to be called
      // when migration has run
      migratePromise.then(() => {
        next();
      });
    } else {
      next();
    }
  })
  .use(bodyParser.json())
  .use((req, res, next) => {
    if (!req.kvstoreChroot) return next();
    const key = req.kvstoreChroot;
    // Ensure root is a dir and exists
    // TODO: not really necessary? just return
    // empty node on get(root) ?
    return Kvnode.root(key)
    .save(null, { method: 'insert' })
    .catch(() => {
      // ignore duplicate key error
    })
    .then(() => {
      next();
    });
  })
  .use((req, res, next) => {
    const chroot = req.kvstoreChroot || '/';
    const key = normalize(path.join(chroot, req.path)) || '/';
    req.kvnode = Kvnode.forge({ key });
    req.kvnode.chroot = chroot;
    next();
  })
  .get('*', (req, res, next) => {
    req.kvnode.fetch({
      withRelated: [ 'nodes' ],
    })
    .then((kvnode) => {
      if (!kvnode) {
        throw new createError.NotFound(req.kvnode.get('key'));
      }
      res.json(kvnode);
    })
    .catch(next);
  })
  .put('*', (req, res, next) => {
    const kvnode = req.kvnode;
    kvnode.set('value', req.body.value);
    kvnode.set('dir', false);
    kvnode.put()
    .then(() => {
      res.json(kvnode);
    })
    .catch(next);
  })
  .delete('*', (req, res, next) => {
    const kvnode = req.kvnode;
    return kvnode
    .destroy()
    .then(() => {
      res.json({ ok: true });
    })
    .catch(next);
  });

  return router;
};
