exports.up = function(knex) {
  return knex.schema.createTable("users", (table) => {
    table.increments("id");
    table.string("email").unique();
    table.timestamps();
  });
};
// No exports.down defined
