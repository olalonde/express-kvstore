# express-kvstore

[![Build Status](https://travis-ci.org/olalonde/express-kvstore.svg?branch=master)](https://travis-ci.org/olalonde/express-kvstore)

Express middleware that provides a PostgreSQL backed key-value store
REST API.

## Install

```bash
npm install --save express-kvstore
```

## Usage

```javascript
import initKvstore from 'express-kvstore';
import initKnex from 'knex';

const knex = initKnex({
  // see http://knexjs.org/#Installation-client
  client: 'pg',
  connection: process.env.PG_CONNECTION_STRING,
});

app.use('/keys', initKvstore({ knex }));
```

## API

See [./test/normal.js](./test/normal.js).

## Test

```
# npm run docker
npm test
```
