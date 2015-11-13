// Materialised Path model
//
// parent: full parent path
// key: full path
//
// to list all child keys,
// select * from kvstore where parent = :somekey
//
// to retrieve key,
// select * from kvstore where key = :somekey


export const up = (knex) => {
  return knex.schema.createTable('kvnodes', (table) => {
    table.string('key').primary();

    table.string('parent')
      .references('key')
      .inTable('kvnodes')
      .onDelete('CASCADE');

    table.string('value');
    table.bool('dir').defaultTo(false);
    table.timestamps();
  });
};

export const down = (knex) => {
  return knex.schema.dropTable('kvstore');
};
