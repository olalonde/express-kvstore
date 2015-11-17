import express from 'express';
import path from 'path';
import initBookshelf from 'bookshelf';
import initKvnode from './models/kvnode';
import createError from 'http-errors';
import bodyParser from 'body-parser';

const DEBUG = process.env.EXPRESS_KVSTORE_DEBUG;

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
    const kvnode = Kvnode.init({ key });
    kvnode.set('dir', true);
    kvnode.put().then(() => next()).catch(next);
  })
  .use((req, res, next) => {
    req.kvnode = Kvnode.init({
      key: req.path,
      chroot: req.kvstoreChroot,
    });
    next();
  })
  .get('*', (req, res, next) => {
    req.kvnode.fetch({
      withRelated: [ 'nodes' ],
      debug: DEBUG,
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
