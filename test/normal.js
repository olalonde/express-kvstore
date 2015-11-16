import test from 'blue-tape';
import initKvstore from '../src';
import initKnex from 'knex';
import express from 'express';
import http from 'http';
import fetch from 'node-fetch';

const knex = initKnex({
  client: 'pg',
  connection: process.env.PG_CONNECTION_STRING || {
    user: 'postgres',
    password: '',
    database: 'express-kvstore',
    host: '192.168.99.100',
  },
});

let cleanUp;
let u;

test('kvstore', (t) => {
  // GET /
  return knex.raw('DELETE FROM kvnodes;')
  .catch(() => {})
  .then(() => {
    const kvstore = initKvstore({ knex });

    const app = express();
    if (process.env.KVSTORE_CHROOT) {
      app.use((req, res, next) => {
        req.kvstoreChroot = process.env.KVSTORE_CHROOT;
        next();
      });
    }
    app.use('/keys', kvstore);
    const server = http.createServer(app).listen();
    const port = server.address().port;

    const baseURL = `http://localhost:${port}/keys`;

    u = (p) => baseURL + p;

    cleanUp = () => {
      return new Promise((y, n) => {
        server.close((err) => err ? n(err) : y());
      })
      .then(() => {
        return knex.destroy();
      });
    };
  })
  .then(() => {
    return fetch(u('/'));
  })
  .then((res) => {
    t.comment('GET /');
    t.equal(res.status, 200);
    t.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    return res.json();
  })
  .then((node) => {
    t.equal(node.key, '/', 'node.key');
    t.equal(node.dir, true, 'node.dir');
    t.deepEqual(node.nodes, [], 'node.nodes');
    t.equal(node.value, undefined, 'node.value');
  })
  // PUT /message
  .then(() => {
    t.comment('PUT /message');
    return fetch(u('/message'), {
      method: 'put',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        value: 'hello world!',
      }),
    });
  })
  .then((res) => {
    t.equal(res.status, 200, 'res.status');
  })
  // GET /message
  .then(() => {
    t.comment('GET /message');
    return fetch(u('/message'));
  })
  .then((res) => {
    t.equal(res.status, 200, 'status');
    return res.json();
  })
  .then(({ key, value }) => {
    t.equal(key, '/message', 'node.key');
    t.equal(value, 'hello world!', 'node.value');
  })
  .then(() => {
    t.comment('GET /');
    return fetch(u('/')).then((r) => r.json());
  })
  .then((node) => {
    t.deepEqual(node.nodes, [ '/message' ], '.nodes contains /message');
  })
  .then(() => {
    t.comment('DELETE /message');
    return fetch(u('/message'), { method: 'delete' });
  })
  .then(() => {
    return fetch(u('/message'));
  })
  .then((res) => {
    t.equal(res.status, 404);
  })
  .then(() => {
    return fetch(u('/')).then((r) => r.json());
  })
  .then((node) => {
    t.deepEqual(node.nodes, []);
  })
  // PUT /message
  .then(() => {
    t.comment('PUT /message');
    return fetch(u('/message'), {
      method: 'put',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        value: 'hello!',
      }),
    });
  })
  .then(() => {
    t.comment('PUT /config/server/port');
    return fetch(u('/config/server/port'), {
      method: 'put',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        value: '80',
      }),
    });
  })
  .then(() => {
    return fetch(u('/message')).then((r) => r.json())
    .then(({ value }) => t.equal(value, 'hello!'));
  })
  .then(() => {
    return fetch(u('/config')).then((r) => r.json())
    .then(({ dir, nodes }) => {
      t.equal(dir, true);
      t.deepEqual(nodes, [ '/server' ]);
    });
  })
  .then(() => {
    t.comment('DELETE /config');
    return fetch(u('/config'), { method: 'delete' });
  })
  .then(() => {
    return fetch(u('/config')).then((res) => t.equal(res.status, 404));
  })
  .then(() => {
    return fetch(u('/config/server')).then((res) => t.equal(res.status, 404));
  })
  .then(() => {
    return fetch(u('/config/server/port')).then((res) => t.equal(res.status, 404));
  })
  .then(() => cleanUp());
});

