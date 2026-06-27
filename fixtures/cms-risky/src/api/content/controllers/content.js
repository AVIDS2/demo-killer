async function find(ctx) {
  const entries = await strapi.db.query("api::content.content").findMany({
    where: ctx.query,
  });
  return entries;
}

async function findOne(ctx) {
  const entry = await strapi.db.query("api::content.content").findOne({
    where: { id: ctx.params.id },
  });
  return entry;
}

async function create(ctx) {
  const entry = await strapi.db.query("api::content.content").create({
    data: ctx.request.body,
  });
  return entry;
}

async function deleteOne(ctx) {
  await strapi.db.query("api::content.content").delete({
    where: { id: ctx.params.id },
  });
  return { deleted: true };
}

module.exports = { find, findOne, create, delete: deleteOne };
