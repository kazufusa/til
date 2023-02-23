module.exports = {
  src: "./src",
  language: "typescript",
  schema: "./graphql/schema.graphql",
  eagerEsModules: true,
  exclude: ["**/node_modules/**", "**/__mocks__/**", "**/__generated__/**"],
};
